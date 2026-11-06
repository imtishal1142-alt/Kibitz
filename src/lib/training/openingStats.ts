// What YOUR games say about one library opening: how often you reached it, how it went, and the mistakes you made in it.
import { Chess } from 'chess.js';
import { lossClassOf, isSevere } from '../chess/classify';
import { fenKey } from '../chess/rules';
import { moveLabel } from '../analysis/explain';
import type { GameAnalysis, GameRecord } from '../types';
import type { OpeningLesson } from './openingLibrary';
import { sansOf } from './repertoire';

export interface OpeningMistake {
  gameId: string;
  ply: number;
  label: string;
  bestSan: string | null;
  winLoss: number;
}

export interface OpeningStats {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  analysed: number;
  mistakes: OpeningMistake[];
}

/** Position key of the end of the library line; a game "reached" the opening if that position occurs in its first moves. */
export function lineKey(o: OpeningLesson): string {
  const c = new Chess();
  for (const s of o.line) c.move(s);
  return fenKey(c.fen());
}

const MAX_PLY = 24;

function reaches(g: GameRecord, key: string): boolean {
  const c = new Chess();
  const sans = sansOf(g).slice(0, MAX_PLY);
  for (const san of sans) {
    try {
      c.move(san);
    } catch {
      return false;
    }
    if (fenKey(c.fen()) === key) return true;
  }
  return false;
}

export function openingStats(o: OpeningLesson, games: GameRecord[], analyses: GameAnalysis[]): OpeningStats {
  const key = lineKey(o);
  const byId = new Map(analyses.map((a) => [a.gameId, a]));
  const out: OpeningStats = { games: 0, wins: 0, draws: 0, losses: 0, analysed: 0, mistakes: [] };
  for (const g of games) {
    if (!g.userColor || g.userColor !== o.side) continue;
    if (!reaches(g, key)) continue;
    out.games++;
    if (g.userOutcome === 'win') out.wins++;
    else if (g.userOutcome === 'loss') out.losses++;
    else if (g.userOutcome === 'draw') out.draws++;
    const a = byId.get(g.id);
    if (!a) continue;
    out.analysed++;
    for (const m of a.moves) {
      if (m.color !== g.userColor || m.ply > MAX_PLY) continue;
      if (isSevere(lossClassOf(m))) out.mistakes.push({ gameId: g.id, ply: m.ply, label: moveLabel(m), bestSan: m.bestSan, winLoss: m.winLoss });
    }
  }
  out.mistakes.sort((a, b) => b.winLoss - a.winLoss);
  return out;
}
