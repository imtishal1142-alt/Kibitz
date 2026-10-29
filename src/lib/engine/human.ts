// A human-like opponent: it looks at the engine's best few moves and sometimes plays one that is a little worse.
//
// Stockfish's own weakening options play odd moves (a rook hung for nothing). People mostly make *plausible*
// mistakes: a move that looks fine but gives up a bit. This mode asks a full-strength engine for its top moves
// (MultiPV) and picks one with probability that falls off with how much winning chance it gives up (a softmax).
// A weaker setting means a warmer softmax and a wider band of moves it may choose from. It never picks a move that
// gives up more than `maxLoss` points when a better one exists, so it does not hang pieces for no reason.
// Nothing here claims a rating: the setting is a 0 to 20 "carefulness" slider.
import { winPctFor } from '../chess/eval';
import type { Color, SearchLine } from '../types';

export const HUMAN_MULTIPV = 5;

export interface HumanParams {
  /** Softmax temperature in win-percentage points: higher means more willing to pick a worse move. */
  temperature: number;
  /** Largest win-chance loss (points) the opponent will accept from the best move. */
  maxLoss: number;
}

/** Map the 0..20 carefulness slider to the sampling parameters. 20 is almost always the best move. */
export function humanParams(carefulness: number): HumanParams {
  const c = Math.max(0, Math.min(20, carefulness));
  const t = 1 - c / 20; // 1 = careless, 0 = careful
  return { temperature: 0.4 + 9.6 * t * t, maxLoss: 3 + 27 * t };
}

export interface HumanChoice {
  uci: string;
  /** Win-chance points given up compared with the engine's first choice. */
  loss: number;
  /** Rank in the engine's list (1 = its first choice). */
  rank: number;
}

/**
 * Choose a move from the engine's candidate lines (scores are from White's point of view).
 * `rand` returns a number in [0, 1); inject it to make the choice reproducible.
 */
export function pickHumanMove(lines: SearchLine[], mover: Color, carefulness: number, rand: () => number = Math.random, bias?: (uci: string) => number): HumanChoice | null {
  const cands = lines
    .filter((l) => l.pv[0])
    .map((l) => ({ uci: l.pv[0]!, rank: l.multipv, win: winPctFor(l.score, mover) }))
    .sort((a, b) => a.rank - b.rank);
  if (!cands.length) return null;
  const best = Math.max(...cands.map((c) => c.win));
  const { temperature, maxLoss } = humanParams(carefulness);
  let pool = cands.map((c) => ({ ...c, loss: Math.max(0, best - c.win) })).filter((c) => c.loss <= maxLoss);
  if (!pool.length) pool = [{ ...cands[0]!, loss: Math.max(0, best - cands[0]!.win) }];
  const weights = pool.map((c) => Math.exp(-c.loss / temperature) * (bias ? Math.max(0.05, bias(c.uci)) : 1));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]!;
    if (r < 0) return { uci: pool[i]!.uci, loss: pool[i]!.loss, rank: pool[i]!.rank };
  }
  const last = pool[pool.length - 1]!;
  return { uci: last.uci, loss: last.loss, rank: last.rank };
}
