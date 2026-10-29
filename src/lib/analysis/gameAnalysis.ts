// Full-game analysis with the real engine. No evaluation in this file is invented: every score
// comes from an engine search (or from the rules for checkmate/stalemate positions).
import type { Engine } from '../engine/engine';
import { cp } from '../chess/eval';
import { moveAccuracy, winPct } from '../chess/eval';
import { classifyMove, lossClassOf, momentImportance } from '../chess/classify';
import { refineGrades } from './grades';
import { detectOpening, loadOpenings } from '../chess/openings';
import { fenKey, legalMoves, parsePgn, parseTimeControl, phaseOf, terminalState, uciLineToSan } from '../chess/rules';
import type { CachedEval } from '../storage/db';
import { forEachAnalysis, getCachedEval, getGame, putCachedEval, saveAnalysis } from '../storage/repos';
import type { Color, GameAnalysis, GameRecord, MoveAnalysis, MoveClass, PositionEval, SearchLine, SideSummary } from '../types';

/** 2: grades gained brilliant, great, book and miss, and each move carries `lossCls`. */
export const ANALYSIS_VERSION = 2;
const PV_KEEP = 12;

/** Cache identity of an engine: lite builds (#lite-wasm, #lite-mt) share one. */
export const shareableEngineId = (id: string): string => id.replace(/#lite-(wasm|mt)$/, '#lite');

export interface EvalCacheLike {
  get(key: string): Promise<CachedEval | undefined>;
  put(entry: CachedEval): Promise<void>;
}

export const idbEvalCache: EvalCacheLike = { get: getCachedEval, put: putCachedEval };

export function memoryEvalCache(): EvalCacheLike & { size(): number } {
  const m = new Map<string, CachedEval>();
  return {
    get: async (k) => m.get(k),
    put: async (e) => void m.set(e.key, e),
    size: () => m.size,
  };
}

export interface EvalOptions {
  depth: number;
  multipv: number;
  cache?: EvalCacheLike;
  signal?: AbortSignal;
  onInfo?: (depth: number, lines: SearchLine[]) => void;
}

export class AnalysisCancelled extends Error {
  constructor() {
    super('Analysis cancelled');
    this.name = 'AnalysisCancelled';
  }
}

const trimLines = (lines: SearchLine[]): SearchLine[] => lines.map((l) => ({ ...l, pv: l.pv.slice(0, PV_KEEP) }));

/**
 * Evaluate one position (White's perspective). Terminal positions are decided by the rules.
 * Returns null if the search was cancelled before producing a result.
 */
export async function evaluatePosition(engine: Engine, fen: string, opts: EvalOptions): Promise<PositionEval | null> {
  const engineId = `${engine.info.name || 'engine'}${engine.tag ? `#${engine.tag}` : ''}`;
  const term = terminalState(fen);
  if (term.over) {
    const score = term.kind === 'checkmate' ? cp(term.winner === 'w' ? 10000 : -10000) : cp(0);
    return {
      fen,
      depth: 0,
      multipv: 1,
      engine: engineId,
      terminal: term.kind === 'checkmate' ? 'checkmate' : term.kind === 'stalemate' ? 'stalemate' : 'draw',
      lines: [{ multipv: 1, score, depth: 0, pv: [] }],
    };
  }
  // Builds of the same engine and network (single- and multi-threaded Lite) give the same kind of answer, so they share
  // cache entries. Older entries keyed by the exact build are still read.
  const fk = fenKey(fen);
  const key = `${fk}|${shareableEngineId(engineId)}`;
  if (opts.cache) {
    const hit = (await opts.cache.get(key)) ?? (key !== `${fk}|${engineId}` ? await opts.cache.get(`${fk}|${engineId}`) : undefined);
    if (hit && hit.depth >= opts.depth && hit.multipv >= opts.multipv) {
      return { fen, depth: hit.depth, multipv: hit.multipv, engine: engineId, lines: hit.lines };
    }
  }
  const res = await engine.search({
    fen,
    depth: opts.depth,
    multipv: opts.multipv,
    signal: opts.signal,
    onInfo: opts.onInfo ? (s) => opts.onInfo!(s.depth, s.lines) : undefined,
  });
  if (res.cancelled || !res.lines.length) return null;
  const lines = trimLines(res.lines);
  if (opts.cache) await opts.cache.put({ key, depth: res.depth, multipv: Math.max(opts.multipv, lines.length), lines, at: Date.now() });
  return { fen, depth: res.depth, multipv: lines.length, engine: engineId, lines };
}

export interface AnalyzeProgress {
  done: number;
  total: number;
  fen: string;
}

export interface AnalyzeOptions {
  depth: number;
  multipv: number;
  cache?: EvalCacheLike;
  signal?: AbortSignal;
  onProgress?: (p: AnalyzeProgress) => void;
}

export const emptyCounts = (): Record<MoveClass, number> => ({ brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, miss: 0, mistake: 0, blunder: 0, forced: 0 });

export function summarize(moves: MoveAnalysis[], color: Color): SideSummary {
  const mine = moves.filter((m) => m.color === color);
  const scored = mine.filter((m) => m.cls !== 'forced');
  const counts = emptyCounts();
  for (const m of mine) counts[m.cls]++;
  const phase = { opening: { moves: 0, sum: 0 }, middlegame: { moves: 0, sum: 0 }, endgame: { moves: 0, sum: 0 } };
  for (const m of scored) {
    const p = phase[phaseOf(m.fenBefore)];
    p.moves++;
    p.sum += m.winLoss;
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    moves: mine.length,
    acpl: avg(scored.map((m) => m.cpLoss)),
    accuracy: avg(scored.map((m) => moveAccuracy(m.winLoss))),
    counts,
    byPhase: {
      opening: { moves: phase.opening.moves, avgWinLoss: phase.opening.moves ? phase.opening.sum / phase.opening.moves : 0 },
      middlegame: { moves: phase.middlegame.moves, avgWinLoss: phase.middlegame.moves ? phase.middlegame.sum / phase.middlegame.moves : 0 },
      endgame: { moves: phase.endgame.moves, avgWinLoss: phase.endgame.moves ? phase.endgame.sum / phase.endgame.moves : 0 },
    },
  };
}

/** Build per-move analysis from per-position evaluations. Pure: used by the pipeline and by tests. */
export function buildMoveAnalyses(game: ReturnType<typeof parsePgn>, positions: PositionEval[], timeControl?: string, openingPlies = 0): MoveAnalysis[] {
  const inc = parseTimeControl(timeControl)?.inc ?? 0;
  const lastClock: Partial<Record<Color, number>> = {};
  const base = game.moves.map((m, idx) => {
    const before = positions[idx]!;
    const after = positions[idx + 1]!;
    const top = before.lines[0]!;
    const second = before.lines[1];
    const bestUci = before.terminal ? null : (top.pv[0] ?? null);
    const check = bestUci ? uciLineToSan(m.fenBefore, top.pv, 10) : null;
    const playedRank = before.lines.findIndex((l) => l.pv[0] === m.uci);
    const legalCount = legalMoves(m.fenBefore).length;
    const c = classifyMove({
      color: m.color,
      evalBefore: top.score,
      evalAfter: after.lines[0]!.score,
      playedIsBest: bestUci === m.uci,
      legalMoveCount: legalCount,
      secondBest: second?.score,
    });
    let spentMs: number | undefined;
    if (m.clockMs !== undefined) {
      const prev = lastClock[m.color];
      if (prev !== undefined) spentMs = Math.max(0, prev + inc * 1000 - m.clockMs);
      lastClock[m.color] = m.clockMs;
    }
    return {
      ply: m.ply,
      color: m.color,
      san: m.san,
      uci: m.uci,
      fenBefore: m.fenBefore,
      fenAfter: m.fenAfter,
      evalBefore: top.score,
      evalAfter: after.lines[0]!.score,
      bestUci,
      bestSan: check?.sans[0] ?? null,
      bestPvSan: check?.sans ?? [],
      secondUci: second?.pv[0],
      secondSan: second?.pv.length ? (uciLineToSan(m.fenBefore, second.pv, 1).sans[0] ?? undefined) : undefined,
      secondScore: second?.score,
      playedRank: playedRank >= 0 ? playedRank + 1 : null,
      winBefore: c.winBefore,
      winAfter: c.winAfter,
      winLoss: c.winLoss,
      cpLoss: c.cpLoss,
      cls: c.cls,
      flags: c.flags,
      clockMs: m.clockMs,
      spentMs,
    };
  });
  return refineGrades(base, positions, openingPlies);
}

export function keyMomentsOf(moves: MoveAnalysis[], max = 10): number[] {
  return moves
    .map((m) => ({ ply: m.ply, v: momentImportance(m), cls: lossClassOf(m) }))
    .filter((x) => x.v >= 10 && (x.cls === 'mistake' || x.cls === 'blunder' || x.v >= 15))
    .sort((a, b) => b.v - a.v)
    .slice(0, max)
    .map((x) => x.ply);
}

/** Analyse every position of a game. Resolves null if cancelled via `signal`. */
export async function analyzeGame(game: GameRecord, engine: Engine, opts: AnalyzeOptions): Promise<GameAnalysis | null> {
  const parsed = parsePgn(game.pgn);
  await loadOpenings().catch(() => undefined);
  const total = parsed.fens.length;
  const positions: PositionEval[] = [];
  for (let i = 0; i < total; i++) {
    if (opts.signal?.aborted) return null;
    const fen = parsed.fens[i]!;
    const pe = await evaluatePosition(engine, fen, { depth: opts.depth, multipv: opts.multipv, cache: opts.cache, signal: opts.signal });
    if (!pe) return null;
    positions.push(pe);
    opts.onProgress?.({ done: i + 1, total, fen });
  }
  const opening = detectOpening(parsed.fens);
  const moves = buildMoveAnalyses(parsed, positions, game.timeControl, opening?.plies ?? 0);
  return {
    gameId: game.id,
    engine: engine.info.name,
    depth: opts.depth,
    multipv: opts.multipv,
    createdAt: Date.now(),
    positions,
    moves,
    summary: { w: summarize(moves, 'w'), b: summarize(moves, 'b') },
    opening: opening ? { eco: opening.eco, name: opening.name, plies: opening.plies } : undefined,
    keyMoments: keyMomentsOf(moves),
    version: ANALYSIS_VERSION,
  };
}

/**
 * Bring an analysis made by an older version up to date without searching again: every evaluation it needs is already
 * stored in `positions`, so the grades are simply recomputed. Returns the input untouched when it is already current.
 */
export async function upgradeAnalysis(game: GameRecord, a: GameAnalysis): Promise<GameAnalysis> {
  if (a.version >= ANALYSIS_VERSION) return a;
  await loadOpenings().catch(() => undefined);
  const parsed = parsePgn(game.pgn);
  if (parsed.moves.length !== a.moves.length || a.positions.length !== parsed.fens.length) return a;
  const opening = detectOpening(parsed.fens);
  const moves = buildMoveAnalyses(parsed, a.positions, game.timeControl, opening?.plies ?? 0);
  return {
    ...a,
    moves,
    summary: { w: summarize(moves, 'w'), b: summarize(moves, 'b') },
    opening: opening ? { eco: opening.eco, name: opening.name, plies: opening.plies } : a.opening,
    keyMoments: keyMomentsOf(moves),
    version: ANALYSIS_VERSION,
  };
}

/** Upgrade every stored analysis that predates the current format. Safe to run on every start. Returns how many were changed. */
export async function migrateStoredAnalyses(): Promise<number> {
  let n = 0;
  await forEachAnalysis(async (a) => {
    if (a.version >= ANALYSIS_VERSION) return;
    const game = await getGame(a.gameId);
    if (!game) return;
    try {
      const up = await upgradeAnalysis(game, a);
      if (up !== a) {
        await saveAnalysis(up);
        n++;
      }
    } catch {
      // A game that cannot be re-read keeps its old analysis; readers tolerate the older format.
    }
  });
  return n;
}

/** Evaluation series (White's win %) for the graph. */
export function evalSeries(a: GameAnalysis): number[] {
  return a.positions.map((p) => winPct(p.lines[0]?.score ?? cp(0)));
}

/** Short, factual, deterministic recommendations derived from the numbers (no invented claims). */
export function gameRecommendations(a: GameAnalysis, userColor: Color | undefined): string[] {
  const out: string[] = [];
  const colors: Color[] = userColor ? [userColor] : ['w', 'b'];
  for (const c of colors) {
    const s = a.summary[c];
    const who = userColor ? 'You' : c === 'w' ? 'White' : 'Black';
    const worstPhase = (['opening', 'middlegame', 'endgame'] as const)
      .filter((p) => s.byPhase[p].moves >= 4)
      .sort((x, y) => s.byPhase[y].avgWinLoss - s.byPhase[x].avgWinLoss)[0];
    if (s.counts.blunder > 0) out.push(`${who} made ${s.counts.blunder} blunder${s.counts.blunder > 1 ? 's' : ''}. Before each move, list the opponent's checks, captures and threats: that habit prevents most blunders.`);
    if (worstPhase && s.byPhase[worstPhase].avgWinLoss > 4) out.push(`${who} lost the most ground in the ${worstPhase} (average ${s.byPhase[worstPhase].avgWinLoss.toFixed(1)} win-percentage points per move).`);
    const missed = a.moves.filter((m) => m.color === c && (m.flags.includes('missed-win') || m.flags.includes('missed-mate')));
    if (missed.length) out.push(`${who} missed ${missed.length} winning chance${missed.length > 1 ? 's' : ''} (move${missed.length > 1 ? 's' : ''} ${missed.map((m) => `${Math.ceil(m.ply / 2)}${m.color === 'w' ? '.' : '...'}${m.san}`).join(', ')}). Review them in the Mistakes tab.`);
    if (!s.counts.blunder && !s.counts.mistake && !s.counts.miss) out.push(`${who} played without a mistake or blunder at this depth (accuracy ${s.accuracy.toFixed(0)}%).`);
  }
  return out;
}
