// Evaluation math. CONVENTION: every Score that leaves the engine layer is from WHITE's
// point of view (positive = good for White). Use `forMover` to convert for display
// from the player's point of view.
import type { Color, Score } from '../types';

export const cp = (value: number): Score => ({ kind: 'cp', cp: Math.round(value) });
export const mate = (n: number): Score => ({ kind: 'mate', mate: n });

/** Convert a score from the side-to-move's view (UCI) to White's view. */
export function uciToWhite(score: Score, turn: Color): Score {
  if (turn === 'w') return score;
  return score.kind === 'cp' ? { kind: 'cp', cp: -score.cp } : { kind: 'mate', mate: -score.mate };
}

/** Convert White-view score to the given colour's view. */
export function forMover(score: Score, color: Color): Score {
  return uciToWhite(score, color); // the transform is its own inverse
}

/** Centipawn value capped to +-1000 (mates count as +-1000). Used for ACPL statistics. */
export function cappedCp(score: Score, cap = 1000): number {
  if (score.kind === 'mate') return score.mate > 0 ? cap : -cap;
  return Math.max(-cap, Math.min(cap, score.cp));
}

/**
 * Expected score (win chance) for White in percent, from a centipawn value.
 * This is the logistic curve fitted by Lichess to 2.3M games: 50 + 50*(2/(1+e^(-0.00368208 cp)) - 1).
 * It is a model of *human* outcomes, not a property of the engine.
 */
export function cpToWinPct(centipawns: number): number {
  const c = Math.max(-1500, Math.min(1500, centipawns));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
}

/** White's win chance 0..100 for a White-view score. Mates are 100 / 0. */
export function winPct(score: Score): number {
  if (score.kind === 'mate') return score.mate > 0 ? 100 : 0;
  return cpToWinPct(score.cp);
}

export function winPctFor(score: Score, color: Color): number {
  const w = winPct(score);
  return color === 'w' ? w : 100 - w;
}

/** Per-move accuracy 0..100 from win-percentage points lost (curve published by Lichess). */
export function moveAccuracy(winLoss: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, winLoss)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

export function isMate(score: Score): score is { kind: 'mate'; mate: number } {
  return score.kind === 'mate';
}

/** "+0.35", "-1.20", "#3", "-#2". Always from the view given by `score` (White's unless converted). */
export function formatScore(score: Score, opts: { signed?: boolean } = {}): string {
  const signed = opts.signed ?? true;
  if (score.kind === 'mate') {
    const n = Math.abs(score.mate);
    return `${score.mate < 0 ? '-' : signed ? '+' : ''}#${n}`;
  }
  const pawns = score.cp / 100;
  const s = Math.abs(pawns).toFixed(2);
  if (pawns === 0) return '0.00';
  return `${pawns < 0 ? '-' : signed ? '+' : ''}${s}`;
}

/** Position of the evaluation bar: share of the bar that is White's, 0..1. */
export function evalBarShare(score: Score): number {
  return winPct(score) / 100;
}

/** Plain-language verdict for a White-view score. Deliberately hedged for shallow searches. */
export function describeScore(score: Score, depth: number): string {
  if (score.kind === 'mate') {
    const who = score.mate > 0 ? 'White' : 'Black';
    return `${who} has a forced mate in ${Math.abs(score.mate)} (engine, depth ${depth}).`;
  }
  const a = Math.abs(score.cp);
  const who = score.cp > 0 ? 'White' : 'Black';
  const shallow = depth < 12 ? ' (shallow search - treat as provisional)' : '';
  if (a < 25) return `Roughly equal${shallow}.`;
  if (a < 75) return `${who} is slightly better${shallow}.`;
  if (a < 200) return `${who} is clearly better${shallow}.`;
  if (a < 500) return `${who} is much better${shallow}.`;
  return `${who} is very likely winning${shallow}.`;
}
