import type { GameAnalysis, GameRecord } from '../types';
import { isPersonal } from './records';

export interface GameEntry {
  game: GameRecord;
  analysis: GameAnalysis;
}

/** Games that have an analysis, joined with it. Demo games are left out unless asked for. */
export function analysedEntries(games: GameRecord[], analyses: GameAnalysis[], includeDemo = false): GameEntry[] {
  const byId = new Map(analyses.map((a) => [a.gameId, a]));
  const out: GameEntry[] = [];
  for (const g of games) {
    const a = byId.get(g.id);
    if (a && isPersonal(g, includeDemo)) out.push({ game: g, analysis: a });
  }
  return out;
}
