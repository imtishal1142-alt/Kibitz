// Helpers for "Guess the Move" and the Candidate Move trainer. The grading is pure so it can be
// tested; the engine work happens in analysis/assess.ts.
import type { MoveAssessment, CandidateEval } from '../analysis/assess';
import { parsePgn, legalMoves } from '../chess/rules';
import type { Color, GameRecord, SearchLine } from '../types';
import { winPctFor } from '../chess/eval';

export interface GuessPosition {
  ply: number;
  fen: string;
  color: Color;
  actualUci: string;
  actualSan: string;
  moveNumber: number;
}

/** Positions of a game worth guessing: skips the first few moves of theory and forced replies. */
export function guessPositions(game: GameRecord, opts: { side?: Color; fromPly?: number } = {}): GuessPosition[] {
  const fromPly = opts.fromPly ?? 9;
  let parsed;
  try {
    parsed = parsePgn(game.pgn);
  } catch {
    return [];
  }
  return parsed.moves
    .filter((m) => m.ply >= fromPly && (!opts.side || m.color === opts.side) && legalMoves(m.fenBefore).length > 1)
    .map((m) => ({ ply: m.ply, fen: m.fenBefore, color: m.color, actualUci: m.uci, actualSan: m.san, moveNumber: Math.ceil(m.ply / 2) }));
}

export interface GuessGrade {
  points: 0 | 1 | 2 | 3;
  title: string;
  detail: string;
}

/**
 * 3 = the engine's top choice (or equal within 0.5 points), 2 = a good alternative (within 5),
 * 1 = playable (within 10), 0 = worse. The game move is reported separately.
 */
export function gradeGuess(guess: MoveAssessment, actualUci: string): GuessGrade {
  const same = guess.uci === actualUci;
  const loss = guess.winLoss;
  const base = same ? 'That is the move played in the game. ' : '';
  if (guess.bestUci === guess.uci || loss <= 0.5) return { points: 3, title: 'Top choice', detail: `${base}${guess.san} is the engine's best move or equal to it.` };
  if (loss <= 5) return { points: 2, title: 'Good alternative', detail: `${base}${guess.san} costs only ${loss.toFixed(1)} win-percentage points against ${guess.bestSan ?? 'the best move'}.` };
  if (loss <= 10) return { points: 1, title: 'Playable', detail: `${base}${guess.san} gives up ${loss.toFixed(1)} points; ${guess.bestSan ?? 'the best move'} was better.` };
  return { points: 0, title: 'Missed it', detail: `${base}${guess.san} loses ${loss.toFixed(1)} points. ${guess.bestSan ? `The engine prefers ${guess.bestSan}` : ''}${guess.replyPvSan[0] ? `, because after ${guess.san} the reply ${guess.replyPvSan[0]} is strong.` : '.'}` };
}

export interface CandidateJudgement {
  verdict: 'found-best' | 'close' | 'missed';
  title: string;
  detail: string;
  bestSan: string | null;
  bestIncluded: boolean;
  /** Win-percentage points between the engine's favourite and the best move on your list. */
  gap: number;
  ranked: { uci: string; san: string; win: number; isEngineTop: boolean }[];
}

/**
 * Compare a shortlist with the engine's own lines. `lines` are the engine's candidate lines
 * (White's perspective, best first); `mine` are your moves evaluated with searchmoves.
 */
export function judgeCandidates(color: Color, lines: SearchLine[], mine: CandidateEval[], sanOf: (uci: string) => string): CandidateJudgement {
  const best = lines[0];
  const bestUci = best?.pv[0] ?? null;
  const bestWin = best ? winPctFor(best.score, color) : 50;
  const ranked = mine
    .map((m) => ({ uci: m.uci, san: m.san, win: m.win, isEngineTop: m.uci === bestUci }))
    .sort((a, b) => b.win - a.win);
  const top = ranked[0];
  const gap = top ? Math.max(0, bestWin - top.win) : bestWin;
  const bestSan = bestUci ? sanOf(bestUci) : null;
  const bestIncluded = !!bestUci && mine.some((m) => m.uci === bestUci);
  if (!top) return { verdict: 'missed', title: 'No candidates', detail: 'Pick one to three moves before revealing the engine\'s view.', bestSan, bestIncluded, gap, ranked };
  if (bestIncluded || gap <= 1) return { verdict: 'found-best', title: 'Best move on your list', detail: `Your list contained ${bestIncluded ? bestSan : top.san}, which is the engine's top-level choice.`, bestSan, bestIncluded, gap, ranked };
  if (gap <= 6) return { verdict: 'close', title: 'Close', detail: `Your best candidate (${top.san}) is ${gap.toFixed(1)} win-percentage points behind ${bestSan}. Playable, but check ${bestSan} next time.`, bestSan, bestIncluded, gap, ranked };
  return { verdict: 'missed', title: 'The best move was not on your list', detail: `${bestSan} is ${gap.toFixed(1)} points better than ${top.san}. Look at what ${bestSan} does that your candidates do not.`, bestSan, bestIncluded, gap, ranked };
}
