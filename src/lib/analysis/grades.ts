// Refined grades: brilliant, great, book and miss.
//
// The loss-based grade (best ... blunder) comes from classify.ts and says how much winning chance a move gave up.
// This file adds four labels that need context the loss alone does not carry: material given up on purpose, whether
// the move was the only one that worked, whether it is still opening theory, and whether it wasted the chance the
// opponent's previous mistake offered. Every rule is deterministic and uses only engine output and the rules of chess.
// The original loss-based grade is kept in `lossCls`; accuracy and statistics never depend on these labels.
import { Chess } from 'chess.js';
import { forMover } from '../chess/eval';
import { materialCount } from '../chess/rules';
import type { MoveAnalysis, MoveClass, PositionEval } from '../types';

export const GRADE_RULES = {
  /** brilliant: at most this many win-chance points lost. */
  brilliantMaxLoss: 2,
  /** brilliant: material the mover is down, in pawns, after the exchanges along the engine's line settle. */
  brilliantMinSacrifice: 2,
  /** brilliant: the mover must keep at least this much win chance (not a desperate gamble)... */
  brilliantMinAfter: 45,
  /** ...and must not already have had more than this (sacrificing when completely winning proves nothing). */
  brilliantMaxBefore: 90,
  /** brilliant: when already winning, a sacrifice of at least this much that forces mate still counts. */
  brilliantMatingSacrifice: 5,
  /** great: the second-best move must be at least this much worse (the `critical` flag uses the same 15). */
  greatMinGap: 15,
  /** great: not when the mover was already this close to certain victory. */
  greatMaxBefore: 97,
  /** miss: the opponent's previous move lost at least this much. */
  missOpponentLoss: 10,
  /** miss: the mover must have been at least this well off after the opponent's error. */
  missMinBefore: 60,
} as const;

const PLY_LOOKAHEAD = 6;

/**
 * Material change for `color` along an engine line (the played move first), measured once the exchanges have settled.
 * Returns null when the line is cut off in the middle of an exchange (a capture is still pending), so a caller never
 * decides on half a sequence.
 */
export function settledMaterial(fenBefore: string, ucis: string[], color: 'w' | 'b'): number | null {
  try {
    const chess = new Chess(fenBefore);
    const bal = (fen: string) => {
      const m = materialCount(fen);
      return color === 'w' ? m.diff : -m.diff;
    };
    const start = bal(chess.fen());
    const line = ucis.slice(0, PLY_LOOKAHEAD + 1);
    let last = start;
    let pendingCapture = false;
    for (let i = 0; i < line.length; i++) {
      const u = line[i]!;
      const mv = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u.slice(4, 5) : undefined });
      last = bal(chess.fen());
      pendingCapture = !!mv.captured || !!mv.promotion;
      // After at least our move and the reply, a quiet move means the dust has settled.
      if (i >= 1 && !pendingCapture) return last - start;
    }
    // The line ended. That is settled only if it ended on a quiet move (or the game ended).
    if (pendingCapture && !chess.isGameOver()) return null;
    return last - start;
  } catch {
    return null;
  }
}

const isLossGood = (c: MoveClass) => c === 'best' || c === 'excellent' || c === 'good';

/**
 * Refine the loss-based grades of a whole game. `positions[i]` is the evaluation after ply i (positions[0] is the start).
 * `openingPlies` is the depth of the deepest named opening position in the game (0 when none was recognised).
 * Returns new objects with `cls` refined and `lossCls` holding the original grade.
 */
export function refineGrades(moves: MoveAnalysis[], positions: PositionEval[], openingPlies: number): MoveAnalysis[] {
  return moves.map((m, i) => {
    const lossCls = m.lossCls ?? m.cls;
    const out: MoveAnalysis = { ...m, lossCls, cls: lossCls };
    if (lossCls === 'forced') return out;
    const prev = i > 0 ? moves[i - 1] : undefined;
    const prevLoss = prev ? (prev.lossCls ?? prev.cls) : undefined;
    const rank = m.playedRank;

    // 1. Book: the position is in the opening list and the move holds up.
    if (m.ply <= openingPlies && isLossGood(lossCls)) {
      out.cls = 'book';
      return out;
    }

    // 2. Brilliant: a sound sacrifice.
    if ((lossCls === 'best' || lossCls === 'excellent') && m.winLoss <= GRADE_RULES.brilliantMaxLoss && (rank === null ? false : rank <= 2) && m.winAfter >= GRADE_RULES.brilliantMinAfter) {
      const pv = positions[m.ply]?.lines[0]?.pv ?? [];
      const mat = settledMaterial(m.fenBefore, [m.uci, ...pv], m.color);
      // Sacrificing when already close to certain victory proves nothing, unless a rook or more is given up to force mate.
      const aft = forMover(m.evalAfter, m.color);
      const forcesMate = aft.kind === 'mate' && aft.mate > 0;
      const notAlreadyWon = m.winBefore <= GRADE_RULES.brilliantMaxBefore || (forcesMate && mat !== null && mat <= -GRADE_RULES.brilliantMatingSacrifice);
      if (notAlreadyWon && mat !== null && mat <= -GRADE_RULES.brilliantMinSacrifice) {
        out.cls = 'brilliant';
        return out;
      }
    }

    // 3. Great: the only move that worked, and not a mere recapture.
    if (lossCls === 'best' && m.flags.includes('critical') && m.winBefore < GRADE_RULES.greatMaxBefore) {
      const prevTo = prev?.uci.slice(2, 4);
      const recapture = !!prev && /x/.test(prev.san) && m.uci.slice(2, 4) === prevTo && /x/.test(m.san);
      if (!recapture) {
        out.cls = 'great';
        return out;
      }
    }

    // 4. Miss: the opponent just erred and this move let the chance go.
    if ((lossCls === 'inaccuracy' || lossCls === 'mistake') && prev && prevLoss && prev.winLoss >= GRADE_RULES.missOpponentLoss && m.winBefore >= GRADE_RULES.missMinBefore) {
      out.cls = 'miss';
      return out;
    }

    return out;
  });
}

/** Highest ply of the opening list that applies to the game (0 = none). */
export const bookDepth = (opening: { plies: number } | null | undefined): number => opening?.plies ?? 0;
