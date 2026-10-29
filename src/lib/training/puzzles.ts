// Personalised puzzles built from the user's own mistakes. Every puzzle is verified by the engine:
//  * the start position comes from a real game and is replayed through chess.js,
//  * the solution is the engine's best line at higher depth (3 candidate lines),
//  * the move actually played in the game must be measurably worse (checked again, not trusted),
//  * accepted alternatives are the other candidate lines that are about as good,
//  * mating solutions are replayed to confirm they really end in checkmate.
import type { Engine } from '../engine/engine';
import type { EvalCacheLike } from '../analysis/gameAnalysis';
import { evaluatePosition } from '../analysis/gameAnalysis';
import { explainMove } from '../analysis/explain';
import { describeMove } from '../analysis/tactics';
import { forMover, winPctFor } from '../chess/eval';
import { fenKey, isLegalUci, phaseOf, sideToMove, terminalState, uciLineToSan } from '../chess/rules';
import type { Color, GameAnalysis, GameRecord, MoveAnalysis, PuzzleRecord } from '../types';

export const THEME_LABEL: Record<string, string> = {
  mate: 'Checkmate',
  fork: 'Fork',
  pin: 'Pin',
  skewer: 'Skewer',
  'discovered-attack': 'Discovered attack',
  'win-material': 'Win material',
  promotion: 'Promotion',
  defense: 'Defence',
  endgame: 'Endgame',
  tactic: 'Tactic',
};

export interface PuzzleOptions {
  depth?: number; // verification depth (default 16)
  cache?: EvalCacheLike;
  signal?: AbortSignal;
  now?: number;
}

export type Rejection = 'not-user-move' | 'no-best-move' | 'engine-disagrees' | 'no-clear-solution' | 'already-lost' | 'illegal-line' | 'cancelled' | 'terminal';

export function puzzleCandidates(game: GameRecord, a: GameAnalysis, max = 8): MoveAnalysis[] {
  if (!game.userColor) return [];
  return a.moves
    .filter((m) => m.color === game.userColor && m.bestUci && (m.winLoss >= 15 || m.flags.includes('missed-mate')))
    .sort((x, y) => y.winLoss - x.winLoss)
    .slice(0, max);
}

function themesFor(fen: string, bestUci: string, mateIn: number | undefined, defense: boolean): string[] {
  const f = describeMove(fen, bestUci);
  const out: string[] = [];
  if (mateIn) out.push('mate');
  if (f?.fork) out.push('fork');
  if (f?.pins.length) out.push('pin');
  if (f?.skewers.length) out.push('skewer');
  if (f?.discovered.length) out.push('discovered-attack');
  if (f?.capture && f.capture.gain >= 2) out.push('win-material');
  if (f?.promotion) out.push('promotion');
  if (defense && !out.length) out.push('defense');
  if (phaseOf(fen) === 'endgame') out.push('endgame');
  if (!out.length) out.push('tactic');
  return out;
}

export function initialDifficulty(opts: { mateIn?: number; quiet: boolean; unique: boolean; gap: number; plies: number }): number {
  let d = 1100;
  if (opts.mateIn) d += 80 * opts.mateIn;
  d += 60 * Math.max(0, opts.plies - 1);
  if (opts.quiet) d += 150;
  if (opts.unique && opts.gap < 20) d += 100;
  if (!opts.unique) d -= 100;
  return Math.max(800, Math.min(2200, d));
}

async function playedWin(engine: Engine, fen: string, uci: string, color: Color, lines: { pv: string[]; score: import('../types').Score }[], depth: number, signal?: AbortSignal): Promise<number | null> {
  const known = lines.find((l) => l.pv[0] === uci);
  if (known) return winPctFor(known.score, color);
  const r = await engine.search({ fen, depth, searchmoves: [uci], multipv: 1, signal });
  if (r.cancelled || !r.lines[0]) return null;
  return winPctFor(r.lines[0].score, color);
}

export async function buildPuzzle(engine: Engine, game: GameRecord, move: MoveAnalysis, analysis: GameAnalysis, opts: PuzzleOptions = {}): Promise<{ puzzle?: PuzzleRecord; rejected?: Rejection }> {
  const depth = opts.depth ?? 16;
  if (!game.userColor || move.color !== game.userColor) return { rejected: 'not-user-move' };
  if (terminalState(move.fenBefore).over) return { rejected: 'terminal' };
  const color = move.color;
  const pos = await evaluatePosition(engine, move.fenBefore, { depth, multipv: 3, cache: opts.cache, signal: opts.signal });
  if (!pos) return { rejected: 'cancelled' };
  const best = pos.lines[0];
  const bestUci = best?.pv[0];
  if (!best || !bestUci) return { rejected: 'no-best-move' };
  const bestWin = winPctFor(best.score, color);
  const second = pos.lines[1];
  const secondWin = second ? winPctFor(second.score, color) : 0;
  const gap = bestWin - secondWin;
  if (bestWin < 30) return { rejected: 'already-lost' };
  const pw = await playedWin(engine, move.fenBefore, move.uci, color, pos.lines, depth, opts.signal);
  if (pw === null) return { rejected: 'cancelled' };
  if (bestUci === move.uci || bestWin - pw < 12) return { rejected: 'engine-disagrees' };
  const mScore = forMover(best.score, color);
  const mateIn = mScore.kind === 'mate' && mScore.mate > 0 ? mScore.mate : undefined;
  const unique = gap >= 10 || mateIn !== undefined && !(second && forMover(second.score, color).kind === 'mate');
  if (!unique && bestWin - pw < 25) return { rejected: 'no-clear-solution' };

  const plies = mateIn ? 2 * mateIn - 1 : 3;
  const line = uciLineToSan(move.fenBefore, best.pv, plies);
  if (!line.valid || !line.ucis.length) return { rejected: 'illegal-line' };
  let solution = line.ucis;
  let solutionSan = line.sans;
  let verifiedMate = mateIn;
  if (mateIn) {
    const end = line.fens[line.fens.length - 1]!;
    const ts = terminalState(end);
    if (!(ts.over && ts.kind === 'checkmate' && ts.winner === color)) {
      // PV truncated before the mate: fall back to a plain "best move" puzzle.
      verifiedMate = undefined;
      solution = line.ucis.slice(0, 1);
      solutionSan = line.sans.slice(0, 1);
    }
  } else {
    solution = line.ucis.slice(0, 1);
    solutionSan = line.sans.slice(0, 1);
  }

  const accepted = [bestUci];
  for (const l of pos.lines.slice(1)) {
    const u = l.pv[0];
    if (!u) continue;
    const ms = forMover(l.score, color);
    if (verifiedMate !== undefined) {
      // A mating puzzle accepts only other moves that also mate, and no more slowly.
      if (ms.kind === 'mate' && ms.mate > 0 && ms.mate <= verifiedMate) accepted.push(u);
    } else if (winPctFor(l.score, color) >= bestWin - 4) accepted.push(u);
  }
  const expl = explainMove(move, analysis);
  const defense = ['hanging-piece', 'missed-threat', 'mate-threat', 'back-rank', 'fork', 'pin-skewer', 'discovered-attack'].includes(expl.category);
  const themes = themesFor(move.fenBefore, bestUci, verifiedMate, defense);
  const facts = describeMove(move.fenBefore, bestUci);
  const quiet = !!facts && !facts.capture && !facts.check;
  return {
    puzzle: {
      id: `${game.id}#${move.ply}`,
      fen: move.fenBefore,
      sideToMove: sideToMove(move.fenBefore),
      solution,
      accepted,
      theme: themes[0]!,
      themes,
      gameId: game.id,
      ply: move.ply,
      playedUci: move.uci,
      playedSan: move.san,
      solutionSan,
      winBefore: bestWin,
      gap,
      mateIn: verifiedMate,
      unique,
      difficulty: initialDifficulty({ mateIn: verifiedMate, quiet, unique, gap, plies: solution.length }),
      depth: pos.depth,
      createdAt: opts.now ?? Date.now(),
    },
  };
}

export interface GenerateResult {
  puzzles: PuzzleRecord[];
  rejected: number;
  reasons: Partial<Record<Rejection, number>>;
  cancelled: boolean;
}

export async function generatePuzzles(
  engine: Engine,
  entries: { game: GameRecord; analysis: GameAnalysis }[],
  opts: PuzzleOptions & { existingIds?: Set<string>; maxTotal?: number; perGame?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<GenerateResult> {
  const tasks: { game: GameRecord; analysis: GameAnalysis; move: MoveAnalysis }[] = [];
  for (const e of entries) {
    for (const m of puzzleCandidates(e.game, e.analysis, opts.perGame ?? 6)) {
      if (!opts.existingIds?.has(`${e.game.id}#${m.ply}`)) tasks.push({ ...e, move: m });
    }
  }
  tasks.sort((a, b) => b.move.winLoss - a.move.winLoss);
  const out: GenerateResult = { puzzles: [], rejected: 0, reasons: {}, cancelled: false };
  const seen = new Set<string>();
  let done = 0;
  for (const t of tasks) {
    if (opts.signal?.aborted) {
      out.cancelled = true;
      break;
    }
    if (out.puzzles.length >= (opts.maxTotal ?? 40)) break;
    const key = fenKey(t.move.fenBefore);
    if (seen.has(key)) {
      done++;
      continue;
    }
    const res = await buildPuzzle(engine, t.game, t.move, t.analysis, opts);
    done++;
    opts.onProgress?.(done, tasks.length);
    if (res.puzzle) {
      seen.add(key);
      out.puzzles.push(res.puzzle);
    } else if (res.rejected === 'cancelled') {
      out.cancelled = true;
      break;
    } else if (res.rejected) {
      out.rejected++;
      out.reasons[res.rejected] = (out.reasons[res.rejected] ?? 0) + 1;
    }
  }
  return out;
}

export interface PuzzleHint {
  level: 1 | 2 | 3;
  text: string;
}

const PIECE_WORD: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

/** Progressive hints that never reveal more than needed: theme, then the piece, then the target square. */
export function puzzleHints(p: PuzzleRecord): PuzzleHint[] {
  const f = describeMove(p.fen, p.solution[0]!);
  const from = p.solution[0]!.slice(0, 2);
  const to = p.solution[0]!.slice(2, 4);
  return [
    { level: 1, text: p.mateIn ? `There is a forced checkmate in ${p.mateIn}.` : p.unique ? `Theme: ${THEME_LABEL[p.theme] ?? p.theme}. One move stands out.` : 'Your game move lost ground. Find a move that avoids the problem.' },
    { level: 2, text: `Move the ${PIECE_WORD[f?.piece ?? 'p']} on ${from}.` },
    { level: 3, text: `It goes to ${to}.` },
  ];
}

export interface MoveCheck {
  ok: boolean;
  how: 'listed' | 'engine' | 'wrong';
  win?: number;
  bestWin?: number;
}

/**
 * Is `uci` an acceptable first move? Listed solutions pass instantly. Otherwise the engine is asked:
 * a move is accepted when it keeps at least (best - 5) win-percentage points and, for mating puzzles,
 * still mates in no more moves than the book solution.
 */
export async function checkPuzzleMove(engine: Engine, p: PuzzleRecord, uci: string, depth = 14): Promise<MoveCheck> {
  if (p.accepted.includes(uci)) return { ok: true, how: 'listed' };
  if (!isLegalUci(p.fen, uci)) return { ok: false, how: 'wrong' };
  const color = p.sideToMove;
  // The engine runs one search at a time (a newer request supersedes an older one), so these are sequential.
  const searched = await (async () => {
    try {
      const best = await engine.search({ fen: p.fen, depth, multipv: 1 });
      const cand = await engine.search({ fen: p.fen, depth, searchmoves: [uci], multipv: 1 });
      return { best, cand };
    } catch {
      return null;
    }
  })();
  const bestLine = searched?.best;
  const cand = searched?.cand;
  if (!bestLine?.lines[0] || !cand?.lines[0]) return { ok: false, how: 'wrong' };
  const bestWin = winPctFor(bestLine.lines[0].score, color);
  const win = winPctFor(cand.lines[0].score, color);
  const cs = forMover(cand.lines[0].score, color);
  if (p.mateIn) {
    const okMate = cs.kind === 'mate' && cs.mate > 0 && cs.mate <= p.mateIn;
    return { ok: okMate, how: okMate ? 'engine' : 'wrong', win, bestWin };
  }
  const ok = win >= bestWin - 5;
  return { ok, how: ok ? 'engine' : 'wrong', win, bestWin };
}
