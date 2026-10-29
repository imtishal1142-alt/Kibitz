// How the endgame lab has gone for each lesson: attempts, wins, and attempts since the last win.
import { kvGet, kvSet } from '../storage/repos';

const KEY = 'endgames.v1';

export interface EndgameRecord {
  attempts: number;
  wins: number;
  /** Attempts since the last achieved goal (resets to 0 on a win). */
  sinceWin: number;
  lastWin?: number;
}
export type EndgameRecords = Record<string, EndgameRecord>;

/** Pure update: returns a new map with this attempt recorded. */
export function applyEndgameResult(map: EndgameRecords, id: string, achieved: boolean, now: number): EndgameRecords {
  const cur = map[id] ?? { attempts: 0, wins: 0, sinceWin: 0 };
  const next: EndgameRecord = achieved ? { attempts: cur.attempts + 1, wins: cur.wins + 1, sinceWin: 0, lastWin: now } : { ...cur, attempts: cur.attempts + 1, sinceWin: cur.sinceWin + 1 };
  return { ...map, [id]: next };
}

export const loadEndgames = async (): Promise<EndgameRecords> => (await kvGet<EndgameRecords>(KEY)) ?? {};

export async function recordEndgame(id: string, achieved: boolean): Promise<EndgameRecord> {
  const next = applyEndgameResult(await loadEndgames(), id, achieved, Date.now());
  await kvSet(KEY, next);
  return next[id]!;
}

export function describeRecord(r: EndgameRecord | undefined): string {
  if (!r || r.attempts === 0) return 'Not tried yet';
  return `Goal reached ${r.wins} of ${r.attempts} attempt${r.attempts === 1 ? '' : 's'}`;
}
