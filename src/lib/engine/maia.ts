// Maia opponents: networks trained to play like people of one rating band (see lc0net.ts). One network per band.
import { movePriors } from './lc0net';
import type { Lc0Net, MovePrior } from './lc0net';

export const MAIA_RATINGS = [1100, 1300, 1500, 1700, 1900] as const;
export type MaiaRating = (typeof MAIA_RATINGS)[number];

export const nearestMaia = (r: number): MaiaRating => MAIA_RATINGS.reduce((best, x) => (Math.abs(x - r) < Math.abs(best - r) ? x : best), MAIA_RATINGS[0]);

/**
 * Sample one move from the network's probabilities. Moves in the long tail (beyond the most likely moves that together
 * cover `topP` of the probability) are never picked, so the opponent plays like a person who sometimes errs, not like a
 * random-move generator. `rand` returns [0, 1).
 */
export function sampleMove(priors: MovePrior[], rand: () => number = Math.random, topP = 0.97): string | null {
  if (!priors.length) return null;
  const kept: MovePrior[] = [];
  let cum = 0;
  for (const m of priors) {
    kept.push(m);
    cum += m.p;
    if (cum >= topP) break;
  }
  let r = rand() * kept.reduce((a, m) => a + m.p, 0);
  for (const m of kept) {
    r -= m.p;
    if (r < 0) return m.uci;
  }
  return kept[kept.length - 1]!.uci;
}

/** Choose a move for the side to move in `fens[0]` (up to eight positions, most recent first). */
export function chooseMaiaMove(net: Lc0Net, fens: string[], rand?: () => number): string | null {
  return sampleMove(movePriors(net, fens.slice(0, 8)), rand);
}
