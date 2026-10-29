// Captured pieces and material balance, derived from the position alone.
import { Chess } from 'chess.js';
import type { Color } from '../types';

const START: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const ORDER = ['q', 'r', 'b', 'n', 'p'] as const;
const GLYPH: Record<Color, Record<string, string>> = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕' },
  b: { p: '♟︎', n: '♞', b: '♝', r: '♜', q: '♛' },
};

export interface CapturedInfo {
  /** Pieces each side has captured (so `w` lists Black pieces that White has taken). */
  byWhite: string[];
  byBlack: string[];
  /** Positive when White is ahead in material (pawn = 1). */
  balance: number;
}

/**
 * Pieces missing from the board relative to the starting set. A promotion makes a promoted piece
 * look "extra" and a pawn "missing"; the balance stays correct because it is computed from what is
 * on the board, not from what was captured.
 */
export function capturedPieces(fen: string): CapturedInfo {
  const counts: Record<Color, Record<string, number>> = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  let total = { w: 0, b: 0 };
  try {
    for (const row of new Chess(fen).board()) {
      for (const sq of row) {
        if (!sq || sq.type === 'k') continue;
        counts[sq.color][sq.type]!++;
        total[sq.color] += VALUE[sq.type]!;
      }
    }
  } catch {
    total = { w: 0, b: 0 };
  }
  const missing = (c: Color): string[] => {
    const out: string[] = [];
    for (const t of ORDER) {
      const gone = Math.max(0, START[t]! - counts[c][t]!);
      for (let i = 0; i < gone; i++) out.push(GLYPH[c][t]!);
    }
    return out;
  };
  return { byWhite: missing('b'), byBlack: missing('w'), balance: total.w - total.b };
}
