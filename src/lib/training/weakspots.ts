// Positions from your own games where a mistake was made, offered as starting points for practice games against
// the engine. A position qualifies when it was still contested (neither side clearly winning) before your mistake:
// playing on from a position that was already lost teaches little.
import { isSevere, lossClassOf } from '../chess/classify';
import { moveLabel } from '../analysis/explain';
import type { GameAnalysis, GameRecord } from '../types';

export const WEAK_SPOT_RULES = { minWinBefore: 40, maxWinBefore: 90 } as const;

export interface WeakSpot {
  key: string;
  gameId: string;
  ply: number;
  fen: string;
  color: 'w' | 'b';
  label: string;
  san: string;
  winLoss: number;
  winBefore: number;
  opponent?: string;
  endTime: number;
}

/** Your serious mistakes from still-contested positions, biggest loss first (ties: newest game first). */
export function weakSpots(entries: { game: GameRecord; analysis: GameAnalysis }[], limit = 12): WeakSpot[] {
  const out: WeakSpot[] = [];
  for (const { game, analysis } of entries) {
    const color = game.userColor;
    if (!color) continue;
    for (const m of analysis.moves) {
      if (m.color !== color || !isSevere(lossClassOf(m))) continue;
      if (m.winBefore < WEAK_SPOT_RULES.minWinBefore || m.winBefore > WEAK_SPOT_RULES.maxWinBefore) continue;
      out.push({ key: `${game.id}:${m.ply}`, gameId: game.id, ply: m.ply, fen: m.fenBefore, color, label: moveLabel(m), san: m.san, winLoss: m.winLoss, winBefore: m.winBefore, opponent: game.opponent, endTime: game.endTime });
    }
  }
  return out.sort((a, b) => b.winLoss - a.winLoss || b.endTime - a.endTime).slice(0, limit);
}

/** The link that starts a practice game from a position. */
export const practiceLink = (fen: string, color: 'w' | 'b'): string => `/play?fen=${encodeURIComponent(fen)}&color=${color}`;
