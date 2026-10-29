// One-off, engine-verified judgements about a single position or move. These power the training
// tools (Guess the Move, Candidate Move trainer, Blunder Prevention, Endgame Lab, play-mode
// feedback). The numbers come from the engine and the classification from the same documented
// thresholds the game analysis uses, so a move is never graded differently in two places.
import { Chess } from 'chess.js';
import type { Engine } from '../engine/engine';
import { classifyMove } from '../chess/classify';
import { winPctFor } from '../chess/eval';
import { findIllegality, isLegalUci, legalMoves, sideToMove, uciLineToSan, uciToSan } from '../chess/rules';
import type { Color, MoveClass, MoveFlag, PositionEval, Score, SearchLine } from '../types';
import { evaluatePosition } from './gameAnalysis';
import type { EvalCacheLike } from './gameAnalysis';
import { describeMove, whatItDoes } from './tactics';

export interface AssessOptions {
  depth?: number;
  multipv?: number;
  cache?: EvalCacheLike;
  signal?: AbortSignal;
}

export interface MoveAssessment {
  uci: string;
  san: string;
  color: Color;
  fenAfter: string;
  evalBefore: Score; // best play before the move, White's perspective
  evalAfter: Score; // after the move, White's perspective
  winBefore: number; // mover's win % with best play
  winAfter: number;
  winLoss: number;
  cpLoss: number;
  cls: MoveClass;
  flags: MoveFlag[];
  bestUci: string | null;
  bestSan: string | null;
  bestPvSan: string[];
  playedRank: number | null; // 1 = engine's first choice
  /** Engine line that follows the move (the opponent's best reply first). */
  replyPvSan: string[];
  /** What the move does, from verified board facts. */
  does: string[];
  depth: number;
  lines: SearchLine[]; // candidate lines before the move
}

const EMPTY_SQUARE_FEN = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

/** Grade a single move in a position. Returns null if the search was cancelled. */
export async function assessMove(engine: Engine, fen: string, uci: string, opts: AssessOptions = {}): Promise<MoveAssessment | null> {
  const depth = opts.depth ?? 14;
  if (!isLegalUci(fen, uci)) throw new Error(`Illegal move ${uci} in ${EMPTY_SQUARE_FEN(fen)}`);
  const color = sideToMove(fen);
  const before = await evaluatePosition(engine, fen, { depth, multipv: opts.multipv ?? 2, cache: opts.cache, signal: opts.signal });
  if (!before) return null;
  const resolved = new Chess(fen);
  const mv = resolved.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  const fenAfter = resolved.fen();
  const after = await evaluatePosition(engine, fenAfter, { depth, multipv: 1, cache: opts.cache, signal: opts.signal });
  if (!after) return null;

  const top = before.lines[0]!;
  const bestUci = before.terminal ? null : (top.pv[0] ?? null);
  const bestCheck = bestUci ? uciLineToSan(fen, top.pv, 8) : null;
  const rank = before.lines.findIndex((l) => l.pv[0] === uci);
  const c = classifyMove({
    color,
    evalBefore: top.score,
    evalAfter: after.lines[0]!.score,
    playedIsBest: bestUci === uci,
    legalMoveCount: legalMoves(fen).length,
    secondBest: before.lines[1]?.score,
  });
  const reply = after.lines[0]!.pv.length ? uciLineToSan(fenAfter, after.lines[0]!.pv, 8) : null;
  const facts = describeMove(fen, uci);
  return {
    uci,
    san: mv.san,
    color,
    fenAfter,
    evalBefore: top.score,
    evalAfter: after.lines[0]!.score,
    winBefore: c.winBefore,
    winAfter: c.winAfter,
    winLoss: c.winLoss,
    cpLoss: c.cpLoss,
    cls: c.cls,
    flags: c.flags,
    bestUci,
    bestSan: bestCheck?.sans[0] ?? null,
    bestPvSan: bestCheck?.sans ?? [],
    playedRank: rank >= 0 ? rank + 1 : null,
    replyPvSan: reply?.sans ?? [],
    does: facts ? whatItDoes(facts) : [],
    depth: Math.min(before.depth, after.depth),
    lines: before.lines,
  };
}

/** The same position with the other side to move (a "null move"), or null when that is not legal. */
export function nullMoveFen(fen: string): string | null {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) return null;
  const chess = new Chess(fen);
  if (chess.inCheck()) return null;
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-'; // an en-passant right does not survive a pass
  const flipped = parts.join(' ');
  return findIllegality(flipped) ? null : flipped;
}

export interface Threat {
  uci: string;
  san: string;
  pvSan: string[];
  /** Win-percentage points the opponent gains if you "pass" and they get to play this. */
  swing: number;
  does: string[];
  text: string;
}

export interface ThreatReport {
  fen: string;
  toMove: Color;
  inCheck: boolean;
  threat: Threat | null;
  note: string;
  depth: number;
}

/** A threat counts as real when passing would cost at least this many win-percentage points. */
export const THREAT_SWING = 10;

/**
 * What would the opponent do if it were their move right now? We ask the engine about the same
 * position with the turn handed over and compare how good that is for them with how good the
 * position is for them when it is really your move. Only a difference counts as a threat.
 */
export async function findThreat(engine: Engine, fen: string, opts: AssessOptions = {}): Promise<ThreatReport | null> {
  const depth = opts.depth ?? 14;
  const me = sideToMove(fen);
  const foe: Color = me === 'w' ? 'b' : 'w';
  const names = { w: 'White', b: 'Black' } as const;
  const chess = new Chess(fen);
  if (chess.inCheck()) return { fen, toMove: me, inCheck: true, threat: null, note: `${names[me]} is in check and must answer it first.`, depth: 0 };
  const flipped = nullMoveFen(fen);
  if (!flipped) return { fen, toMove: me, inCheck: false, threat: null, note: 'This position cannot be analysed for threats.', depth: 0 };
  const now: PositionEval | null = await evaluatePosition(engine, fen, { depth, multipv: 1, cache: opts.cache, signal: opts.signal });
  if (!now) return null;
  const passed = await evaluatePosition(engine, flipped, { depth, multipv: 1, cache: opts.cache, signal: opts.signal });
  if (!passed) return null;
  const line = passed.lines[0]!;
  const foeNow = winPctFor(now.lines[0]!.score, foe);
  const foePassed = winPctFor(line.score, foe);
  const swing = foePassed - foeNow;
  const used = Math.min(now.depth, passed.depth);
  const first = line.pv[0];
  if (!first || swing < THREAT_SWING) {
    return {
      fen,
      toMove: me,
      inCheck: false,
      threat: null,
      note: `Nothing urgent: if ${names[me]} passed, ${names[foe]} would gain only ${Math.max(0, swing).toFixed(0)} win-percentage points at depth ${used}.`,
      depth: used,
    };
  }
  const check = uciLineToSan(flipped, line.pv, 6);
  const facts = describeMove(flipped, first);
  const does = facts ? whatItDoes(facts) : [];
  const san = uciToSan(flipped, first) ?? first;
  const text = `${names[foe]} threatens ${san}${does.length ? `, which ${does.slice(0, 2).join(' and ')}` : ''}. If ${names[me]} ignored it, ${names[foe]}'s winning chances would rise by about ${swing.toFixed(0)} points (engine depth ${used}).`;
  return { fen, toMove: me, inCheck: false, threat: { uci: first, san, pvSan: check.sans, swing, does, text }, note: text, depth: used };
}

export interface CandidateEval {
  uci: string;
  san: string;
  score: Score; // White's perspective, after the engine is forced to start with this move
  win: number; // mover's win %
  pvSan: string[];
  depth: number;
}

/**
 * Evaluate specific moves by restricting the engine to them (`searchmoves`). Used by the
 * Candidate Move trainer to compare your shortlist with the engine's own favourites.
 */
export async function evaluateCandidates(engine: Engine, fen: string, ucis: string[], opts: AssessOptions = {}): Promise<CandidateEval[] | null> {
  const depth = opts.depth ?? 14;
  const color = sideToMove(fen);
  const out: CandidateEval[] = [];
  for (const uci of ucis) {
    if (!isLegalUci(fen, uci)) continue;
    const res = await engine.search({ fen, depth, searchmoves: [uci], multipv: 1, signal: opts.signal });
    if (res.cancelled || !res.lines[0]) return null;
    const line = res.lines[0];
    out.push({ uci, san: uciToSan(fen, uci) ?? uci, score: line.score, win: winPctFor(line.score, color), pvSan: uciLineToSan(fen, line.pv, 8).sans, depth: res.depth });
  }
  return out;
}
