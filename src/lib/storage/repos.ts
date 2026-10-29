// High-level persistence API over IndexedDB. Components and services never touch `idb` directly.
import { getDb } from './db';
import { notify } from './events';
import type { CachedEval } from './db';
import type {
  ArchiveMeta,
  CalendarDay,
  ChessComProfile,
  GameAnalysis,
  GameRecord,
  NotebookEntry,
  PuzzleAttempt,
  PuzzleRecord,
  PuzzleSrs,
  Reflection,
  RepertoireLine,
  StrengthEstimate,
} from '../types';

/* ------------------------------- games ------------------------------- */

export interface AddResult {
  added: number;
  duplicates: number;
  addedIds: string[];
}

/** Insert games, skipping any whose id OR fingerprint already exists. */
export async function addGames(games: GameRecord[]): Promise<AddResult> {
  const db = await getDb();
  const tx = db.transaction('games', 'readwrite');
  const store = tx.objectStore('games');
  const idx = store.index('by-fingerprint');
  const result: AddResult = { added: 0, duplicates: 0, addedIds: [] };
  const seenInBatch = new Set<string>();
  for (const g of games) {
    if (seenInBatch.has(g.fingerprint) || seenInBatch.has(g.id)) {
      result.duplicates++;
      continue;
    }
    seenInBatch.add(g.fingerprint);
    seenInBatch.add(g.id);
    const byFp = await idx.getKey(g.fingerprint);
    const byId = byFp === undefined ? await store.getKey(g.id) : byFp;
    if (byId !== undefined) {
      result.duplicates++;
      continue;
    }
    await store.add(g);
    result.added++;
    result.addedIds.push(g.id);
  }
  await tx.done;
  if (result.added) notify('games');
  return result;
}

export async function putGame(game: GameRecord): Promise<void> {
  const db = await getDb();
  await db.put('games', game);
  notify('games');
}

export async function getGame(id: string): Promise<GameRecord | undefined> {
  return (await getDb()).get('games', id);
}

export async function listGames(): Promise<GameRecord[]> {
  const rows = await (await getDb()).getAll('games');
  return rows.sort((a, b) => b.endTime - a.endTime);
}

export async function countGames(): Promise<number> {
  return (await getDb()).count('games');
}

export async function updateGame(id: string, patch: Partial<GameRecord>): Promise<GameRecord | undefined> {
  const db = await getDb();
  const tx = db.transaction('games', 'readwrite');
  const cur = await tx.store.get(id);
  if (!cur) {
    await tx.done;
    return undefined;
  }
  const next = { ...cur, ...patch, id: cur.id, fingerprint: cur.fingerprint };
  await tx.store.put(next);
  await tx.done;
  notify('games');
  return next;
}

/** Delete games together with everything derived from them. */
export async function deleteGames(ids: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['games', 'analyses', 'puzzles', 'puzzleSrs', 'reflections'], 'readwrite');
  for (const id of ids) {
    await tx.objectStore('games').delete(id);
    await tx.objectStore('analyses').delete(id);
    const puzzles = await tx.objectStore('puzzles').index('by-game').getAllKeys(id);
    for (const pid of puzzles) {
      await tx.objectStore('puzzles').delete(pid);
      await tx.objectStore('puzzleSrs').delete(pid);
    }
    const refl = await tx.objectStore('reflections').index('by-game').getAllKeys(id);
    for (const rid of refl) await tx.objectStore('reflections').delete(rid);
  }
  await tx.done;
  notify('games', 'analyses', 'puzzles', 'puzzleSrs', 'reflections');
}

/* ------------------------------ analyses ------------------------------ */

export async function saveAnalysis(a: GameAnalysis): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['analyses', 'analysisLite', 'games'], 'readwrite');
  await tx.objectStore('analyses').put(a);
  await tx.objectStore('analysisLite').put(lite(a));
  const g = await tx.objectStore('games').get(a.gameId);
  if (g) {
    await tx.objectStore('games').put({
      ...g,
      analyzed: 1,
      eco: g.eco ?? a.opening?.eco,
      opening: g.opening ?? a.opening?.name,
    });
  }
  await tx.done;
  notify('analyses', 'games');
}

export async function getAnalysis(gameId: string): Promise<GameAnalysis | undefined> {
  return (await getDb()).get('analyses', gameId);
}

const lite = (a: GameAnalysis): GameAnalysis => ({ ...a, positions: [] });

/**
 * Every analysis WITHOUT its per-position engine lines (`positions` is empty), which is what lists, statistics and
 * the home screen need. Reading the full records meant copying tens of megabytes out of IndexedDB on every screen and
 * on every finished game. If the lite copy has fallen out of step with the full one (first run after an upgrade, a
 * restore, deleted games) it is rebuilt here, one record at a time.
 */
export async function listAnalyses(): Promise<GameAnalysis[]> {
  const db = await getDb();
  const [full, small] = await Promise.all([db.getAllKeys('analyses'), db.getAllKeys('analysisLite')]);
  if (full.length !== small.length || full.some((k, i) => k !== small[i])) {
    const have = new Set(small);
    const want = new Set(full);
    for (const k of small) if (!want.has(k)) await db.delete('analysisLite', k);
    for (const k of full) {
      if (have.has(k)) continue;
      const a = await db.get('analyses', k);
      if (a) await db.put('analysisLite', lite(a));
    }
  }
  return db.getAll('analysisLite');
}

/** Full records, including positions, one at a time (for work that must see the engine lines, such as upgrades). */
export async function forEachAnalysis(fn: (a: GameAnalysis) => Promise<void>): Promise<void> {
  const db = await getDb();
  for (const k of await db.getAllKeys('analyses')) {
    const a = await db.get('analyses', k);
    if (a) await fn(a);
  }
}

export async function deleteAnalysis(gameId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['analyses', 'analysisLite', 'games'], 'readwrite');
  await tx.objectStore('analyses').delete(gameId);
  await tx.objectStore('analysisLite').delete(gameId);
  const g = await tx.objectStore('games').get(gameId);
  if (g) await tx.objectStore('games').put({ ...g, analyzed: 0 });
  await tx.done;
  notify('analyses', 'games');
}

/* ----------------------------- eval cache ----------------------------- */

export async function getCachedEval(key: string): Promise<CachedEval | undefined> {
  return (await getDb()).get('evalCache', key);
}

export async function putCachedEval(entry: CachedEval): Promise<void> {
  await (await getDb()).put('evalCache', entry);
}

export async function clearEvalCache(): Promise<void> {
  await (await getDb()).clear('evalCache');
}

/** Keep the cache bounded: drop the oldest entries beyond `max`. */
export async function pruneEvalCache(max = 40_000): Promise<number> {
  const db = await getDb();
  const n = await db.count('evalCache');
  if (n <= max) return 0;
  const tx = db.transaction('evalCache', 'readwrite');
  let toDrop = n - max;
  let cursor = await tx.store.index('by-at').openCursor();
  let dropped = 0;
  while (cursor && toDrop > 0) {
    await cursor.delete();
    toDrop--;
    dropped++;
    cursor = await cursor.continue();
  }
  await tx.done;
  return dropped;
}

/* ------------------------------- puzzles ------------------------------ */

export async function putPuzzles(puzzles: PuzzleRecord[]): Promise<number> {
  const db = await getDb();
  const tx = db.transaction(['puzzles', 'puzzleSrs'], 'readwrite');
  let added = 0;
  for (const p of puzzles) {
    if (await tx.objectStore('puzzles').getKey(p.id)) continue;
    await tx.objectStore('puzzles').put(p);
    await tx.objectStore('puzzleSrs').put({ puzzleId: p.id, box: 0, due: 0, attempts: 0, successes: 0, streak: 0 });
    added++;
  }
  await tx.done;
  return added;
  notify('puzzles', 'puzzleSrs');
}

export async function listPuzzles(): Promise<PuzzleRecord[]> {
  return (await getDb()).getAll('puzzles');
}

export async function getPuzzle(id: string): Promise<PuzzleRecord | undefined> {
  return (await getDb()).get('puzzles', id);
}

export async function updatePuzzle(p: PuzzleRecord): Promise<void> {
  await (await getDb()).put('puzzles', p);
  notify('puzzles');
}

export async function listSrs(): Promise<PuzzleSrs[]> {
  return (await getDb()).getAll('puzzleSrs');
}

export async function getSrs(id: string): Promise<PuzzleSrs | undefined> {
  return (await getDb()).get('puzzleSrs', id);
}

export async function putSrs(s: PuzzleSrs): Promise<void> {
  await (await getDb()).put('puzzleSrs', s);
  notify('puzzleSrs');
}

export async function addAttempt(a: PuzzleAttempt): Promise<void> {
  await (await getDb()).add('attempts', a);
  notify('attempts');
}

export async function listAttempts(sinceMs = 0): Promise<PuzzleAttempt[]> {
  const db = await getDb();
  return db.getAllFromIndex('attempts', 'by-at', IDBKeyRange.lowerBound(sinceMs));
}

export async function deletePuzzles(ids: string[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['puzzles', 'puzzleSrs'], 'readwrite');
  for (const id of ids) {
    await tx.objectStore('puzzles').delete(id);
    await tx.objectStore('puzzleSrs').delete(id);
  }
  await tx.done;
  notify('puzzles', 'puzzleSrs');
}

/* ----------------------- notebook / repertoire / etc ------------------ */

export async function listNotebook(): Promise<NotebookEntry[]> {
  return (await (await getDb()).getAll('notebook')).sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function putNotebook(e: NotebookEntry): Promise<void> {
  await (await getDb()).put('notebook', e);
  notify('notebook');
}
export async function deleteNotebook(id: string): Promise<void> {
  await (await getDb()).delete('notebook', id);
  notify('notebook');
}

export async function listRepertoire(): Promise<RepertoireLine[]> {
  return (await (await getDb()).getAll('repertoire')).sort((a, b) => a.createdAt - b.createdAt);
}
export async function putRepertoire(l: RepertoireLine): Promise<void> {
  await (await getDb()).put('repertoire', l);
  notify('repertoire');
}
export async function deleteRepertoire(id: string): Promise<void> {
  await (await getDb()).delete('repertoire', id);
  notify('repertoire');
}

export async function listReflections(gameId?: string): Promise<Reflection[]> {
  const db = await getDb();
  const rows = gameId ? await db.getAllFromIndex('reflections', 'by-game', gameId) : await db.getAll('reflections');
  return rows.sort((a, b) => b.at - a.at);
}
export async function putReflection(r: Reflection): Promise<void> {
  await (await getDb()).put('reflections', r);
  notify('reflections');
}

export async function addStrength(e: StrengthEstimate): Promise<void> {
  const { id: _id, ...rest } = e;
  void _id;
  await (await getDb()).add('strength', rest as StrengthEstimate);
  notify('strength');
}
export async function listStrength(): Promise<StrengthEstimate[]> {
  return (await (await getDb()).getAllFromIndex('strength', 'by-at')).reverse();
}

export const localDateKey = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function bumpCalendar(patch: Partial<Omit<CalendarDay, 'date'>>, date = localDateKey()): Promise<CalendarDay> {
  const db = await getDb();
  const tx = db.transaction('calendar', 'readwrite');
  const cur = (await tx.store.get(date)) ?? { date, puzzles: 0, puzzlesCorrect: 0, reviews: 0, gamesAnalyzed: 0, lessons: 0, minutes: 0, played: 0 };
  const next: CalendarDay = { ...cur };
  for (const [k, v] of Object.entries(patch) as [keyof Omit<CalendarDay, 'date'>, number][]) next[k] = (cur[k] ?? 0) + v;
  await tx.store.put(next);
  await tx.done;
  notify('calendar');
  return next;
}
export async function listCalendar(): Promise<CalendarDay[]> {
  return (await getDb()).getAll('calendar');
}

export async function getProfile(username: string): Promise<ChessComProfile | undefined> {
  return (await getDb()).get('profiles', username.toLowerCase());
}
export async function putProfile(p: ChessComProfile): Promise<void> {
  await (await getDb()).put('profiles', { ...p, username: p.username.toLowerCase() });
  notify('profiles');
}
export async function listProfiles(): Promise<ChessComProfile[]> {
  return (await getDb()).getAll('profiles');
}

export async function getArchiveMeta(url: string): Promise<ArchiveMeta | undefined> {
  return (await getDb()).get('archives', url);
}
export async function putArchiveMeta(m: ArchiveMeta): Promise<void> {
  await (await getDb()).put('archives', m);
  notify('archives');
}
export async function listArchiveMeta(): Promise<ArchiveMeta[]> {
  return (await getDb()).getAll('archives');
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await (await getDb()).get('kv', key)) as T | undefined;
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await getDb()).put('kv', value, key);
  notify('kv');
}
export async function kvDelete(key: string): Promise<void> {
  await (await getDb()).delete('kv', key);
  notify('kv');
}
