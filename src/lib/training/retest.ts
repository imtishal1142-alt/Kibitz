// Re-testing your own mistakes on a schedule. A mistake you fixed once is not necessarily one you have learned, so
// each position comes back after 1, 3, 7, 14 and 30 days (the same Leitner boxes as the puzzles) until it is solid.
import { kvGet, kvSet } from '../storage/repos';
import type { PuzzleSrs } from '../types';
import { nextSrs, isDue } from './srs';

/** A retried move counts as learned when it loses at most this many win-chance points (an "excellent" move or better). */
export const RETEST_OK_LOSS = 3;
const KEY = 'retest.v1';

export type RetestMap = Record<string, PuzzleSrs>;
export const retestKey = (gameId: string, ply: number): string => `${gameId}:${ply}`;

export const loadRetests = async (): Promise<RetestMap> => (await kvGet<RetestMap>(KEY)) ?? {};

/** The new schedule entry after a retry. A first-ever result creates the entry (unseen mistakes have none). */
export function applyRetest(map: RetestMap, key: string, ok: boolean, ms: number, now: number): RetestMap {
  const cur = map[key] ?? { puzzleId: key, box: 0, due: now, attempts: 0, successes: 0, streak: 0 };
  return { ...map, [key]: nextSrs(cur, ok, ms, now) };
}

/** Records one retry and saves. Returns the updated entry. */
export async function recordRetest(gameId: string, ply: number, ok: boolean, ms = 0, now = Date.now()): Promise<PuzzleSrs> {
  const key = retestKey(gameId, ply);
  const next = applyRetest(await loadRetests(), key, ok, ms, now);
  await kvSet(KEY, next);
  return next[key]!;
}

export interface Retestable {
  key: string;
  winLoss: number;
}

export interface RetestQueue<T> {
  /** Retried before and now due again, most overdue first. */
  due: T[];
  /** Never retried, largest loss first. */
  fresh: T[];
  /** Retried and waiting for their next date. */
  later: T[];
  /** Retried at least once and solved in the last box: considered learned. */
  learned: number;
}

export function queueRetests<T extends Retestable>(items: T[], map: RetestMap, now: number): RetestQueue<T> {
  const due: T[] = [];
  const fresh: T[] = [];
  const later: T[] = [];
  let learned = 0;
  for (const it of items) {
    const s = map[it.key];
    if (!s || s.attempts === 0) fresh.push(it);
    else if (isDue(s, now)) due.push(it);
    else later.push(it);
    if (s && s.box >= 5 && s.streak > 0) learned++;
  }
  due.sort((a, b) => map[a.key]!.due - map[b.key]!.due);
  fresh.sort((a, b) => b.winLoss - a.winLoss);
  later.sort((a, b) => map[a.key]!.due - map[b.key]!.due);
  return { due, fresh, later, learned };
}
