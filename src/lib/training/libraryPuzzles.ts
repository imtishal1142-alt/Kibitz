// Library puzzle pack: positions found by engine self-play from the opening library, kept only when one move clearly stands
// out (checked at depth 13 with two lines). They are separate from the person's own-game puzzles (ids start with "lib-").
import { uciLineToSan } from '../chess/rules';
import type { Color, PuzzleRecord } from '../types';

export interface LibraryPuzzle {
  id: string;
  fen: string;
  side: Color;
  solution: string[];
  themes: string[];
  level: 1 | 2 | 3;
  mateIn?: number;
}

/** Practice rating each level starts at (an internal sorting value, not a claim about real Elo). */
export const LEVEL_RATING: Record<number, number> = { 1: 900, 2: 1200, 3: 1500 };

export async function loadLibraryPuzzles(): Promise<LibraryPuzzle[]> {
  const m = await import('../../data/libraryPuzzles.json');
  return m.default as LibraryPuzzle[];
}

export function toRecord(p: LibraryPuzzle, now = Date.now()): PuzzleRecord {
  const sans = uciLineToSan(p.fen, p.solution, p.solution.length).sans;
  return {
    id: `lib-${p.id}`,
    fen: p.fen,
    sideToMove: p.side,
    solution: p.solution,
    accepted: [p.solution[0]!],
    theme: p.themes[0] ?? 'tactic',
    themes: p.themes,
    gameId: 'library',
    ply: 0,
    playedUci: '',
    playedSan: '',
    solutionSan: sans,
    winBefore: 50,
    gap: 28,
    mateIn: p.mateIn,
    unique: true,
    difficulty: LEVEL_RATING[p.level] ?? 1200,
    depth: 13,
    createdAt: now,
  };
}
