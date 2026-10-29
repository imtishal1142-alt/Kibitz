// Time use, from the clock times stored in a game's PGN (`[%clk ...]`). Only games that carry clocks can be read.
//
// Everything here is a count and a ratio over the analysed moves; the wording that goes with them says what the
// numbers do and do not show. A move played fast and wrong is not proof of rushing (the player may simply not have
// seen it), so notes talk about patterns across several moves and always carry the sample size.
import { isSevere, lossClassOf } from '../chess/classify';
import { formatClock } from '../chess/rules';
import type { Color, GameAnalysis, GameRecord, MoveClass } from '../types';

export const TIME_RULES = {
  /** A move made with less than this on the clock counts as played in time trouble. */
  lowClockMs: 30_000,
  /** A move that took less than this counts as fast. */
  fastMs: 3_000,
  /** A move counts as a long think when it took at least this long and this many times your median. */
  longThinkMs: 20_000,
  longThinkFactor: 3,
  /** Fewest timed moves of yours before a game's time report says anything about patterns. */
  minMoves: 10,
  /** Fewest moves in a bucket before an error rate is quoted for it. */
  minBucket: 5,
} as const;

export interface TimedMove {
  ply: number;
  san: string;
  spentMs: number | null;
  clockMs: number | null;
  cls: MoveClass;
  winLoss: number;
}

export interface Bucket {
  moves: number;
  severe: number;
}

export interface SideTime {
  /** True when the game has clock times for this side. */
  hasClocks: boolean;
  moves: TimedMove[];
  medianMs: number | null;
  totalMs: number;
  low: Bucket;
  fast: Bucket;
  rest: Bucket;
  /** Longest thinks that count as long thinks (see TIME_RULES). */
  longThinks: TimedMove[];
  /** Serious errors made fast or on a low clock. */
  rushedErrors: TimedMove[];
  /** Lowest clock reading seen. */
  minClockMs: number | null;
  notes: string[];
}

const emptyBucket = (): Bucket => ({ moves: 0, severe: 0 });
const pct = (b: Bucket) => (b.moves ? (b.severe / b.moves) * 100 : 0);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};
const secs = (ms: number) => (ms < 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 1000)} s`);

/** The time report of one side of one analysed game. */
export function timeReport(analysis: GameAnalysis, color: Color): SideTime {
  const mine = analysis.moves.filter((m) => m.color === color);
  const moves: TimedMove[] = mine.map((m) => ({ ply: m.ply, san: m.san, spentMs: m.spentMs ?? null, clockMs: m.clockMs ?? null, cls: lossClassOf(m), winLoss: m.winLoss }));
  const hasClocks = moves.some((m) => m.clockMs !== null);
  const out: SideTime = { hasClocks, moves, medianMs: null, totalMs: 0, low: emptyBucket(), fast: emptyBucket(), rest: emptyBucket(), longThinks: [], rushedErrors: [], minClockMs: null, notes: [] };
  if (!hasClocks) return out;

  const spent = moves.flatMap((m) => (m.spentMs === null ? [] : [m.spentMs]));
  out.medianMs = median(spent);
  out.totalMs = spent.reduce((s, x) => s + x, 0);
  out.minClockMs = Math.min(...moves.flatMap((m) => (m.clockMs === null ? [] : [m.clockMs])));
  for (const m of moves) {
    const severe = isSevere(m.cls);
    const isLow = m.clockMs !== null && m.clockMs < TIME_RULES.lowClockMs;
    const isFast = m.spentMs !== null && m.spentMs < TIME_RULES.fastMs;
    const bucket = isLow ? out.low : isFast ? out.fast : out.rest;
    bucket.moves++;
    if (severe) bucket.severe++;
    if (severe && (isLow || isFast)) out.rushedErrors.push(m);
  }
  const med = out.medianMs ?? 0;
  out.longThinks = moves
    .filter((m) => m.spentMs !== null && m.spentMs >= TIME_RULES.longThinkMs && m.spentMs >= TIME_RULES.longThinkFactor * Math.max(med, 1000))
    .sort((a, b) => (b.spentMs ?? 0) - (a.spentMs ?? 0))
    .slice(0, 3);

  if (moves.length < TIME_RULES.minMoves) {
    out.notes.push(`Only ${moves.length} of your moves are in this game, too few to read a pattern from.`);
    return out;
  }
  if (out.low.moves > 0) {
    const sample = `${out.low.moves} move${out.low.moves === 1 ? '' : 's'} with under ${TIME_RULES.lowClockMs / 1000} s left`;
    if (out.low.moves >= TIME_RULES.minBucket && out.rest.moves >= TIME_RULES.minBucket) {
      out.notes.push(`${sample}: ${out.low.severe} serious error${out.low.severe === 1 ? '' : 's'} (${pct(out.low).toFixed(0)}%), against ${pct(out.rest).toFixed(0)}% on the other moves (${out.rest.moves} moves).`);
    } else {
      out.notes.push(`${sample}, ${out.low.severe} of them a mistake or blunder.`);
    }
  } else {
    out.notes.push(`You never dropped under ${TIME_RULES.lowClockMs / 1000} s (lowest clock ${formatClock(out.minClockMs ?? undefined)}).`);
  }
  if (out.fast.moves >= TIME_RULES.minBucket) {
    out.notes.push(`${out.fast.moves} moves took under ${TIME_RULES.fastMs / 1000} s (not counting time-trouble moves); ${out.fast.severe} of them were mistakes or blunders.`);
  }
  if (out.longThinks.length) {
    const t = out.longThinks[0]!;
    out.notes.push(`Your longest think was ${secs(t.spentMs ?? 0)} on ${Math.ceil(t.ply / 2)}${t.ply % 2 ? '.' : '...'}${t.san}, graded ${t.cls}. Your median move took ${secs(med)}.`);
  }
  return out;
}

export interface TimeTally {
  /** Games with clock times for your side. */
  games: number;
  moves: number;
  low: Bucket;
  fast: Bucket;
  rest: Bucket;
  /** Games in which you dropped under the low-clock line. */
  gamesInTrouble: number;
  /** Of those games, how many you lost. */
  lostInTrouble: number;
  notes: string[];
}

/** Across games: do mistakes cluster when the clock is low or the move was fast? Only games with clock times count. */
export function timeTally(entries: { game: GameRecord; analysis: GameAnalysis }[]): TimeTally {
  const t: TimeTally = { games: 0, moves: 0, low: emptyBucket(), fast: emptyBucket(), rest: emptyBucket(), gamesInTrouble: 0, lostInTrouble: 0, notes: [] };
  for (const { game, analysis } of entries) {
    if (!game.userColor) continue;
    const r = timeReport(analysis, game.userColor);
    if (!r.hasClocks) continue;
    t.games++;
    t.moves += r.moves.length;
    for (const k of ['low', 'fast', 'rest'] as const) {
      t[k].moves += r[k].moves;
      t[k].severe += r[k].severe;
    }
    if (r.low.moves > 0) {
      t.gamesInTrouble++;
      if (game.userOutcome === 'loss') t.lostInTrouble++;
    }
  }
  if (t.games === 0) return t;
  const n = (x: number, one: string, many = `${one}s`) => `${x} ${x === 1 ? one : many}`;
  if (t.low.moves >= TIME_RULES.minBucket && t.rest.moves >= TIME_RULES.minBucket) {
    const lo = pct(t.low);
    const re = pct(t.rest);
    const ratio = re > 0 ? lo / re : null;
    t.notes.push(
      `With under ${TIME_RULES.lowClockMs / 1000} s on the clock, ${lo.toFixed(0)}% of your moves were mistakes or blunders (${t.low.moves} moves), against ${re.toFixed(0)}% otherwise (${t.rest.moves} moves)${ratio && ratio >= 1.5 ? `: about ${ratio.toFixed(1)} times as often` : ''}.`,
    );
  } else {
    t.notes.push(`Only ${n(t.low.moves, 'move')} of yours came with under ${TIME_RULES.lowClockMs / 1000} s left, too few to compare error rates.`);
  }
  if (t.gamesInTrouble > 0) t.notes.push(`You dropped under ${TIME_RULES.lowClockMs / 1000} s in ${n(t.gamesInTrouble, 'game')} of ${t.games}, and lost ${t.lostInTrouble} of those.`);
  if (t.fast.moves >= TIME_RULES.minBucket) t.notes.push(`${n(t.fast.moves, 'move')} took under ${TIME_RULES.fastMs / 1000} s outside time trouble; ${pct(t.fast).toFixed(0)}% of them were mistakes or blunders, against ${pct(t.rest).toFixed(0)}% for the rest.`);
  return t;
}
