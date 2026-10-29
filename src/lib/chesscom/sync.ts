// Import and incremental synchronisation of a public Chess.com profile.
//
//  * Archives are visited newest first so recent games appear early.
//  * Every month is persisted as soon as it is downloaded, so cancelling or hitting a rate limit
//    never loses finished work and a later sync resumes where it stopped.
//  * A month that had already ended when it was downloaded is "final" and is never fetched again,
//    which makes later syncs cheap (only the current and any not-yet-final months are requested).
//  * Duplicates are prevented by game id AND by a content fingerprint.
import type { ArchiveMeta, ChessComProfile } from '../types';
import { addGames, getArchiveMeta, getProfile, putArchiveMeta, putProfile } from '../storage/repos';
import { ChessComClient, ChessComError, validateUsername } from './client';
import { archiveMonth, mapChessComGame, mapProfile } from './mapper';
import type { SkipReason } from './mapper';

export interface SyncProgress {
  phase: 'profile' | 'archives' | 'games' | 'done';
  archiveIndex: number;
  archiveTotal: number;
  month?: string;
  gamesSeen: number;
  added: number;
  duplicates: number;
  skippedCached: number;
}

export interface SyncResult {
  username: string;
  profile?: ChessComProfile;
  archivesTotal: number;
  archivesFetched: number;
  archivesSkippedCached: number;
  gamesSeen: number;
  added: number;
  duplicates: number;
  skipped: Partial<Record<SkipReason, number>>;
  errors: string[];
  cancelled: boolean;
  stoppedEarly?: 'rate-limited' | 'network' | 'server';
  startedAt: number;
  finishedAt: number;
}

export interface SyncOptions {
  username: string;
  client?: ChessComClient;
  signal?: AbortSignal;
  /** Re-download months even if they are marked final. */
  force?: boolean;
  /** Only look at the most recent N archive months (0 = all). */
  maxMonths?: number;
  onProgress?: (p: SyncProgress) => void;
  now?: () => number;
}

export async function syncChessCom(opts: SyncOptions): Promise<SyncResult> {
  const now = opts.now ?? Date.now;
  const check = validateUsername(opts.username);
  if (!check.ok) throw new ChessComError('invalid-username', check.error);
  const username = check.username;
  const client = opts.client ?? new ChessComClient();
  const result: SyncResult = {
    username,
    archivesTotal: 0,
    archivesFetched: 0,
    archivesSkippedCached: 0,
    gamesSeen: 0,
    added: 0,
    duplicates: 0,
    skipped: {},
    errors: [],
    cancelled: false,
    startedAt: now(),
    finishedAt: now(),
  };
  const progress = (phase: SyncProgress['phase'], archiveIndex: number, month?: string) =>
    opts.onProgress?.({ phase, archiveIndex, archiveTotal: result.archivesTotal, month, gamesSeen: result.gamesSeen, added: result.added, duplicates: result.duplicates, skippedCached: result.archivesSkippedCached });

  try {
    progress('profile', 0);
    const rawProfile = await client.getProfile(username, opts.signal).catch((e) => {
      if (e instanceof ChessComError && e.code === 'not-found') {
        throw new ChessComError('not-found', `No Chess.com player named "${username}" was found. Check the spelling (usernames are not case-sensitive).`, 404);
      }
      throw e;
    });
    const stats = await client.getStats(username, opts.signal).catch((e) => {
      if (e instanceof ChessComError && (e.code === 'cancelled' || e.code === 'rate-limited')) throw e;
      return undefined; // ratings are optional: the profile may hide them or have none
    });
    const previous = await getProfile(username);
    const profile = mapProfile(username, rawProfile, stats, now());
    profile.lastSync = previous?.lastSync;
    await putProfile(profile);
    result.profile = profile;

    progress('archives', 0);
    let archives = await client.getArchives(username, opts.signal);
    archives = [...archives].sort().reverse(); // newest first
    if (opts.maxMonths && opts.maxMonths > 0) archives = archives.slice(0, opts.maxMonths);
    result.archivesTotal = archives.length;

    for (let i = 0; i < archives.length; i++) {
      if (opts.signal?.aborted) {
        result.cancelled = true;
        break;
      }
      const url = archives[i]!;
      const ym = archiveMonth(url);
      const label = ym ? `${ym.year}-${String(ym.month).padStart(2, '0')}` : url;
      const meta = await getArchiveMeta(url);
      if (meta?.final && !opts.force) {
        result.archivesSkippedCached++;
        progress('games', i + 1, label);
        continue;
      }
      progress('games', i, label);
      let month;
      try {
        month = await client.getMonth(url, opts.signal);
      } catch (e) {
        if (e instanceof ChessComError) {
          if (e.code === 'cancelled') {
            result.cancelled = true;
            break;
          }
          result.errors.push(`${label}: ${e.message}`);
          if (e.code === 'rate-limited' || e.code === 'network' || e.code === 'server') {
            result.stoppedEarly = e.code;
            break;
          }
          continue;
        }
        throw e;
      }
      const games = [];
      for (const raw of month.games ?? []) {
        result.gamesSeen++;
        const m = mapChessComGame(raw, username);
        if (m.game) games.push(m.game);
        else if (m.skipped) result.skipped[m.skipped] = (result.skipped[m.skipped] ?? 0) + 1;
      }
      const res = await addGames(games);
      result.added += res.added;
      result.duplicates += res.duplicates;
      result.archivesFetched++;
      const fetchedAt = now();
      const monthEnd = ym ? Date.UTC(ym.year, ym.month, 1) + 24 * 3600 * 1000 : Number.POSITIVE_INFINITY;
      const metaOut: ArchiveMeta = { url, fetchedAt, games: (month.games ?? []).length, final: fetchedAt > monthEnd };
      await putArchiveMeta(metaOut);
      progress('games', i + 1, label);
    }
    if (!result.cancelled && !result.stoppedEarly) {
      profile.lastSync = now();
      await putProfile(profile);
      result.profile = profile;
    }
  } finally {
    result.finishedAt = now();
  }
  progress('done', result.archivesTotal);
  return result;
}
