// Move-quality classification.
//
// Method (documented in README "Move classification"):
//   1. Evaluate the position BEFORE the move (best line) and AFTER the played move.
//   2. Convert both to the mover's win chance (logistic model, see eval.ts).
//   3. winLoss = max(0, winBefore - winAfter), in percentage points.
//   4. Map winLoss to a category with the thresholds below.
//
// Using win chance instead of raw centipawns means a 1.5-pawn slip when the game is
// already decided costs little, while the same slip in an equal position costs a lot.
import type { Color, MoveClass, MoveFlag, Score } from '../types';
import { cappedCp, forMover, winPctFor } from './eval';

export const CLASS_THRESHOLDS = {
  /** Played the engine's top move, or lost no more than this: "Best". */
  best: 0.5,
  excellent: 2,
  good: 5,
  inaccuracy: 10,
  mistake: 20,
  // above `mistake` = blunder
} as const;

export const CLASS_LABEL: Record<MoveClass, string> = {
  brilliant: 'Brilliant',
  great: 'Great',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  book: 'Book',
  inaccuracy: 'Inaccuracy',
  miss: 'Miss',
  mistake: 'Mistake',
  blunder: 'Blunder',
  forced: 'Only move',
};

/** One line saying what each grade means, for tooltips and the Help page. */
export const CLASS_MEANING: Record<MoveClass, string> = {
  brilliant: 'A sound sacrifice: the engine approves it, and it leaves you down material once the exchanges settle.',
  great: 'The only move that kept the position: every alternative was at least 15 win-chance points worse.',
  best: 'The engine\'s first choice, or within half a point of it.',
  excellent: 'Within 2 points of the best move.',
  good: 'Within 5 points of the best move.',
  book: 'A move from the opening list that the engine also approves.',
  inaccuracy: 'Lost 5 to 10 win-chance points.',
  miss: 'Failed to take advantage of the opponent\'s previous mistake (lost 5 to 20 points).',
  mistake: 'Lost 10 to 20 win-chance points.',
  blunder: 'Lost more than 20 win-chance points.',
  forced: 'The only legal move, so nothing is graded.',
};

/**
 * Annotation glyphs, as printed on scoresheets. "Best" has none: most moves in a game are the engine's first choice,
 * so a mark on each would say nothing; the only-move "!" belongs to "great".
 */
export const CLASS_GLYPH: Record<MoveClass, string> = {
  brilliant: '!!',
  great: '!',
  best: '',
  excellent: '',
  good: '',
  book: '',
  inaccuracy: '?!',
  miss: '✕',
  mistake: '?',
  blunder: '??',
  forced: '',
};

export const CLASS_ORDER: MoveClass[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'miss', 'mistake', 'blunder'];

/** The grade by loss alone: the part of `cls` that statistics rely on. */
export const lossClassOf = (m: { cls: MoveClass; lossCls?: MoveClass }): MoveClass => m.lossCls ?? m.cls;
/** Grades that mean "a move you should be glad you found". */
export const isPraise = (c: MoveClass): boolean => c === 'brilliant' || c === 'great' || c === 'best';
/** A mistake or a blunder by loss: the moves statistics and training treat as errors. */
export const isSevere = (c: MoveClass): boolean => c === 'mistake' || c === 'blunder';
/** Grades the review walks through as things to learn from. */
export const isLesson = (c: MoveClass): boolean => c === 'miss' || c === 'mistake' || c === 'blunder';

export function classifyByLoss(winLoss: number, isEngineBest: boolean): MoveClass {
  if (isEngineBest || winLoss <= CLASS_THRESHOLDS.best) return 'best';
  if (winLoss <= CLASS_THRESHOLDS.excellent) return 'excellent';
  if (winLoss <= CLASS_THRESHOLDS.good) return 'good';
  if (winLoss <= CLASS_THRESHOLDS.inaccuracy) return 'inaccuracy';
  if (winLoss <= CLASS_THRESHOLDS.mistake) return 'mistake';
  return 'blunder';
}

export interface ClassifyInput {
  color: Color;
  evalBefore: Score; // best line before the move (White's view)
  evalAfter: Score; // best line after the played move (White's view)
  playedIsBest: boolean;
  legalMoveCount: number;
  secondBest?: Score; // second-best line before the move (White's view), if analysed
}

export interface Classification {
  cls: MoveClass;
  winBefore: number;
  winAfter: number;
  winLoss: number;
  cpLoss: number;
  flags: MoveFlag[];
}

export function classifyMove(input: ClassifyInput): Classification {
  const { color, evalBefore, evalAfter, playedIsBest, legalMoveCount, secondBest } = input;
  const winBefore = winPctFor(evalBefore, color);
  // The engine's own first choice cannot lose anything by definition. The position before and the position after are
  // two separate searches, and near forced mates they can disagree by tens of points; that disagreement is search noise,
  // not a mistake, so for the engine's top move the loss is zero.
  const winAfter = playedIsBest ? Math.max(winBefore, winPctFor(evalAfter, color)) : winPctFor(evalAfter, color);
  const winLoss = Math.max(0, winBefore - winAfter);
  const cpBefore = cappedCp(forMover(evalBefore, color));
  const cpAfter = playedIsBest ? Math.max(cpBefore, cappedCp(forMover(evalAfter, color))) : cappedCp(forMover(evalAfter, color));
  const cpLoss = Math.max(0, cpBefore - cpAfter);

  let cls: MoveClass = legalMoveCount <= 1 ? 'forced' : classifyByLoss(winLoss, playedIsBest);

  const flags: MoveFlag[] = [];
  const noisy = playedIsBest; // flags about what was lost make no sense for the engine's own choice
  const mBefore = forMover(evalBefore, color);
  const mAfter = forMover(evalAfter, color);
  if (!noisy && mBefore.kind === 'mate' && mBefore.mate > 0 && !(mAfter.kind === 'mate' && mAfter.mate > 0)) flags.push('missed-mate');
  if (!noisy && mAfter.kind === 'mate' && mAfter.mate < 0 && !(mBefore.kind === 'mate' && mBefore.mate < 0)) flags.push('allowed-mate');
  if (winBefore >= 80 && winAfter < 60 && cls !== 'forced') flags.push('missed-win');
  if (winLoss >= 15 && winBefore >= 50 && winAfter < 50 && cls !== 'forced') flags.push('turning-point');
  if (secondBest) {
    const gap = winBefore - winPctFor(secondBest, color);
    if (gap >= 15 && legalMoveCount > 1) flags.push('critical');
  }
  // A forced mate that is allowed or missed is always at least a mistake in practice.
  if (cls === 'inaccuracy' && (flags.includes('allowed-mate') || flags.includes('missed-mate'))) cls = 'mistake';

  return { cls, winBefore, winAfter, winLoss, cpLoss, flags };
}

/** Importance of a move for "critical moment" navigation. Higher = more important. */
export function momentImportance(c: { cls: MoveClass; winLoss: number; flags: MoveFlag[] }): number {
  let v = c.winLoss;
  if (c.flags.includes('missed-win')) v += 10;
  if (c.flags.includes('missed-mate')) v += 15;
  if (c.flags.includes('allowed-mate')) v += 15;
  if (c.flags.includes('turning-point')) v += 8;
  if (c.flags.includes('critical') && c.winLoss > CLASS_THRESHOLDS.good) v += 4;
  return v;
}
