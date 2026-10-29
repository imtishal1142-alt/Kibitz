// Playing-strength estimation.
//
// WHAT THIS IS: a statistical estimate of the rating at which your RESULTS against your actual
// opponents are most likely, plus a cross-check from engine-measured move quality.
// WHAT THIS IS NOT: a validated predictor of FIDE/Chess.com rating from move quality. No external
// calibration dataset (games of players with known ratings plus engine evaluations) was available
// when this was built, so move quality is never converted into Elo with a made-up formula.
//
// Three numbers are kept strictly apart and never merged:
//   1. the official rating (from Chess.com),
//   2. the results-based estimate (this file, `estimateFromResults`),
//   3. move-quality statistics and an optional, experimental quality-implied rating.
import type { GameAnalysis, GameRecord, TimeClass } from '../types';
import { lossClassOf } from '../chess/classify';
import { moveAccuracy } from '../chess/eval';
import { isPersonal } from '../games/records';

const K = Math.LN10 / 400;
const expectedScore = (r: number, opp: number) => 1 / (1 + 10 ** ((opp - r) / 400));

export interface ResultSample {
  opponent: number;
  score: number; // 1, 0.5 or 0
  at: number; // epoch ms
}

export interface RatingEstimate {
  rating: number;
  low: number;
  high: number;
  level: number;
  sd: number;
  effectiveGames: number;
  games: number;
}

const Z: Record<number, number> = { 0.5: 0.674, 0.8: 1.2816, 0.9: 1.6449, 0.95: 1.96 };

export interface EstimateOptions {
  level?: 0.5 | 0.8 | 0.9 | 0.95;
  /** Games lose half their weight every `halfLifeDays` days. 0 disables recency weighting. */
  halfLifeDays?: number;
  now?: number;
  /** Prior standard deviation (Elo) around the mean opponent rating. */
  priorSd?: number;
}

/**
 * Maximum-a-posteriori rating under the Elo logistic model with a weak Gaussian prior centred on
 * the mean opponent rating (people are matched against similar opponents). Draws count 0.5. The
 * interval is the Laplace (normal) approximation to the posterior. The prior stops perfect or
 * hopeless score streaks from sending the estimate to infinity and fades as games accumulate.
 */
export function estimateFromResults(samples: ResultSample[], opts: EstimateOptions = {}): RatingEstimate | null {
  if (!samples.length) return null;
  const level = opts.level ?? 0.8;
  const priorSd = opts.priorSd ?? 400;
  const half = opts.halfLifeDays ?? 120;
  const now = opts.now ?? Math.max(...samples.map((s) => s.at));
  const w = samples.map((s) => (half > 0 ? 0.5 ** (Math.max(0, now - s.at) / (half * 86_400_000)) : 1));
  const wSum = w.reduce((a, b) => a + b, 0);
  const mu0 = samples.reduce((a, s, i) => a + s.opponent * w[i]!, 0) / wSum;
  let r = mu0;
  for (let it = 0; it < 60; it++) {
    let g = -(r - mu0) / priorSd ** 2;
    let h = -1 / priorSd ** 2;
    samples.forEach((s, i) => {
      const p = expectedScore(r, s.opponent);
      g += w[i]! * K * (s.score - p);
      h -= w[i]! * K * K * p * (1 - p);
    });
    const step = Math.max(-150, Math.min(150, g / h));
    r -= step;
    if (Math.abs(step) < 1e-4) break;
  }
  let info = 1 / priorSd ** 2;
  samples.forEach((s, i) => {
    const p = expectedScore(r, s.opponent);
    info += w[i]! * K * K * p * (1 - p);
  });
  const sd = Math.sqrt(1 / info);
  const z = Z[level] ?? 1.2816;
  return { rating: Math.round(r), low: Math.round(r - z * sd), high: Math.round(r + z * sd), level, sd, effectiveGames: wSum, games: samples.length };
}

export type Confidence = 'low' | 'moderate' | 'good';

export function confidenceOf(est: RatingEstimate | null): Confidence {
  if (!est) return 'low';
  if (est.sd <= 60) return 'good';
  if (est.sd <= 110) return 'moderate';
  return 'low';
}

/* ------------------------------ performance rating ------------------------------ */

export interface Performance {
  rating: number;
  avgOpponent: number;
  score: number; // fraction of the available points, 0..1
  games: number;
  /** True when a perfect or zero score hit the +/-800 cap, so the true figure is not identifiable. */
  capped: boolean;
}

/**
 * Classic performance rating: average opponent rating plus 400 * log10(score / (1 - score)), with the
 * adjustment capped at +/-800 (the FIDE convention for 100% and 0%). It describes what happened in these
 * games only: it has no prior, no recency weighting and no interval, so it swings wildly on small samples.
 * It is shown next to the model-based estimate, never merged with it.
 */
export function performanceRating(samples: ResultSample[]): Performance | null {
  if (!samples.length) return null;
  const n = samples.length;
  const avgOpponent = samples.reduce((a, s) => a + s.opponent, 0) / n;
  const score = samples.reduce((a, s) => a + s.score, 0) / n;
  const raw = score >= 1 ? Infinity : score <= 0 ? -Infinity : 400 * Math.log10(score / (1 - score));
  const delta = Math.max(-800, Math.min(800, raw));
  return { rating: Math.round(avgOpponent + delta), avgOpponent: Math.round(avgOpponent), score, games: n, capped: Math.abs(raw) >= 800 };
}

/* ------------------------------ backtest ------------------------------ */

export interface Backtest {
  n: number;
  modelBrier: number;
  officialBrier: number | null;
  coinFlipBrier: number;
  modelBeatsOfficial: boolean | null;
  description: string;
}

/**
 * Rolling-origin out-of-sample check on YOUR games: each game is predicted using only the games
 * that came before it. Lower Brier score = better calibrated predictions. The official-rating
 * baseline uses the ratings recorded in each game.
 */
export function backtest(games: GameRecord[], minPrior = 10, opts: EstimateOptions = {}): Backtest | null {
  const rows = games
    .filter((g) => g.userOutcome && g.opponentRating !== undefined)
    .sort((a, b) => a.endTime - b.endTime);
  if (rows.length < minPrior + 5) return null;
  let m = 0;
  let o = 0;
  let oN = 0;
  let c = 0;
  let n = 0;
  for (let i = minPrior; i < rows.length; i++) {
    const g = rows[i]!;
    const prior: ResultSample[] = rows.slice(0, i).map((x) => ({ opponent: x.opponentRating!, score: x.userOutcome === 'win' ? 1 : x.userOutcome === 'draw' ? 0.5 : 0, at: x.endTime }));
    const est = estimateFromResults(prior, { ...opts, now: g.endTime });
    if (!est) continue;
    const actual = g.userOutcome === 'win' ? 1 : g.userOutcome === 'draw' ? 0.5 : 0;
    m += (expectedScore(est.rating, g.opponentRating!) - actual) ** 2;
    c += (0.5 - actual) ** 2;
    if (g.userRating !== undefined) {
      o += (expectedScore(g.userRating, g.opponentRating!) - actual) ** 2;
      oN++;
    }
    n++;
  }
  if (!n) return null;
  const modelBrier = m / n;
  const officialBrier = oN === n ? o / oN : null;
  return {
    n,
    modelBrier,
    officialBrier,
    coinFlipBrier: c / n,
    modelBeatsOfficial: officialBrier === null ? null : modelBrier < officialBrier,
    description: `Each of ${n} games was predicted from earlier games only. Brier score (lower is better): this model ${modelBrier.toFixed(3)}${officialBrier !== null ? `, official ratings ${officialBrier.toFixed(3)}` : ''}, coin flip ${(c / n).toFixed(3)}.`,
  };
}

/* ---------------------- move-quality cross-check ---------------------- */

export interface QualityStats {
  analyzedGames: number;
  moves: number;
  accuracy: number;
  acpl: number;
  blunderRate: number; // per 100 moves
  mistakeRate: number;
  bestMoveRate: number;
}

export interface AnalyzedGame {
  game: GameRecord;
  analysis: GameAnalysis;
}

export function qualityStats(items: AnalyzedGame[]): QualityStats | null {
  const mine = items.filter((i) => i.game.userColor);
  if (!mine.length) return null;
  let moves = 0;
  let acc = 0;
  let acpl = 0;
  let blunders = 0;
  let mistakes = 0;
  let best = 0;
  for (const { game, analysis } of mine) {
    for (const mv of analysis.moves) {
      if (mv.color !== game.userColor || mv.cls === 'forced') continue;
      moves++;
      acc += moveAccuracy(mv.winLoss);
      acpl += mv.cpLoss;
      const lc = lossClassOf(mv);
      if (lc === 'blunder') blunders++;
      if (lc === 'mistake') mistakes++;
      if (lc === 'best') best++;
    }
  }
  if (!moves) return null;
  return { analyzedGames: mine.length, moves, accuracy: acc / moves, acpl: acpl / moves, blunderRate: (blunders / moves) * 100, mistakeRate: (mistakes / moves) * 100, bestMoveRate: (best / moves) * 100 };
}

export interface ImpliedRating {
  status: 'ok' | 'unavailable';
  reason?: string;
  rating?: number;
  low?: number;
  high?: number;
  slope?: number; // accuracy points per 100 rating points among opponents
  points?: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ols(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

/**
 * EXPERIMENTAL. Calibrates "accuracy vs rating" on YOUR OPPONENTS' moves (their ratings are known and
 * independent of ours), then asks which opponent rating would produce your average accuracy.
 * Needs >= 25 analysed games with a >= 100-point spread of opponent ratings and a clearly positive
 * slope; the interval comes from a 400-resample bootstrap over games. It inherits all limits of the
 * data: position difficulty, game state (winning sides play more accurately), engine depth, and a
 * small, possibly unrepresentative sample.
 */
export function qualityImpliedRating(items: AnalyzedGame[], level = 0.8, seed = 12345): ImpliedRating {
  const rows = items
    .filter((i) => i.game.userColor && i.game.opponentRating !== undefined)
    .map(({ game, analysis }) => {
      const sideAcc = (color: 'w' | 'b') => {
        const ms = analysis.moves.filter((m) => m.color === color && m.cls !== 'forced');
        return ms.length >= 8 ? ms.reduce((s, m) => s + moveAccuracy(m.winLoss), 0) / ms.length : null;
      };
      const me = game.userColor!;
      return { opp: game.opponentRating!, mine: sideAcc(me), theirs: sideAcc(me === 'w' ? 'b' : 'w') };
    })
    .filter((r): r is { opp: number; mine: number; theirs: number } => r.mine !== null && r.theirs !== null);
  if (rows.length < 25) return { status: 'unavailable', reason: `Needs at least 25 analysed games with long enough move lists (have ${rows.length}).` };
  const spread = Math.max(...rows.map((r) => r.opp)) - Math.min(...rows.map((r) => r.opp));
  if (spread < 100) return { status: 'unavailable', reason: 'Your opponents are too close in rating (under 100 points apart) to calibrate accuracy against rating.' };
  const fit = ols(rows.map((r) => r.opp), rows.map((r) => r.theirs));
  if (fit.b <= 0.004) return { status: 'unavailable', reason: 'In your games, opponents\' accuracy does not rise clearly with their rating, so accuracy cannot be converted to a rating.' };
  const myAcc = rows.reduce((s, r) => s + r.mine, 0) / rows.length;
  const rating = (myAcc - fit.a) / fit.b;
  const rand = mulberry32(seed);
  const boots: number[] = [];
  for (let b = 0; b < 400; b++) {
    const sample = rows.map(() => rows[Math.floor(rand() * rows.length)]!);
    const f = ols(sample.map((r) => r.opp), sample.map((r) => r.theirs));
    if (f.b <= 0.002) continue;
    const m = sample.reduce((s, r) => s + r.mine, 0) / sample.length;
    boots.push((m - f.a) / f.b);
  }
  boots.sort((x, y) => x - y);
  if (boots.length < 200) return { status: 'unavailable', reason: 'The accuracy-versus-rating relationship is too unstable in your sample.' };
  const lo = boots[Math.floor(((1 - level) / 2) * boots.length)]!;
  const hi = boots[Math.min(boots.length - 1, Math.floor((1 - (1 - level) / 2) * boots.length))]!;
  return { status: 'ok', rating: Math.round(rating), low: Math.round(lo), high: Math.round(hi), slope: fit.b * 100, points: rows.length };
}

/* ------------------------------ full report ------------------------------ */

export interface StrengthReport {
  timeClass: TimeClass | 'all';
  games: number;
  record: { win: number; draw: number; loss: number };
  results: RatingEstimate | null;
  performance: Performance | null;
  confidence: Confidence;
  official?: number;
  gapToOfficial?: number;
  quality: QualityStats | null;
  implied: ImpliedRating;
  backtest: Backtest | null;
  notes: string[];
  at: number;
}

export function buildStrengthReport(
  games: GameRecord[],
  analyses: Map<string, GameAnalysis>,
  timeClass: TimeClass | 'all',
  official: number | undefined,
  opts: { level?: 0.5 | 0.8 | 0.9 | 0.95; now?: number; includeDemo?: boolean } = {},
): StrengthReport {
  const pool = games.filter((g) => isPersonal(g, opts.includeDemo) && (timeClass === 'all' || g.timeClass === timeClass) && g.userOutcome && g.opponentRating !== undefined && g.rules !== 'chess960');
  const samples: ResultSample[] = pool.map((g) => ({ opponent: g.opponentRating!, score: g.userOutcome === 'win' ? 1 : g.userOutcome === 'draw' ? 0.5 : 0, at: g.endTime }));
  const record = { win: pool.filter((g) => g.userOutcome === 'win').length, draw: pool.filter((g) => g.userOutcome === 'draw').length, loss: pool.filter((g) => g.userOutcome === 'loss').length };
  const results = samples.length >= 5 ? estimateFromResults(samples, { level: opts.level, now: opts.now }) : null;
  const analyzed: AnalyzedGame[] = pool.flatMap((g) => {
    const a = analyses.get(g.id);
    return a ? [{ game: g, analysis: a }] : [];
  });
  const notes: string[] = [];
  if (samples.length < 5) notes.push(`Only ${samples.length} rated game${samples.length === 1 ? '' : 's'} in this category: at least 5 are needed for an estimate, and 30+ for a reasonably narrow range.`);
  if (results && results.effectiveGames < 20) notes.push('Few effective games (recent games count more): treat the range as wide and provisional.');
  if (timeClass === 'all') notes.push('Mixing time controls blends different skills; prefer a single time control when you have enough games.');
  notes.push('The estimate is on the rating scale of the opponents you actually played (Chess.com\'s, for imported games). It is a statistical estimate, not a certification.');
  const implied = qualityImpliedRating(analyzed, opts.level ?? 0.8);
  return {
    timeClass,
    games: pool.length,
    record,
    results,
    performance: performanceRating(samples),
    confidence: confidenceOf(results),
    official,
    gapToOfficial: results && official !== undefined ? results.rating - official : undefined,
    quality: qualityStats(analyzed),
    implied,
    backtest: backtest(pool, 10, { level: opts.level }),
    notes,
    at: opts.now ?? Date.now(),
  };
}
