// Backup, restore and "clear my data".
import { closeDb, getDb, STORE_NAMES } from './db';
import { notify } from './events';
import type { StoreName } from './db';
import { getPrefs, resetPrefs, setPrefs } from './prefs';
import type { Prefs } from './prefs';
import { addGames } from './repos';
import type { GameRecord } from '../types';

export interface BackupFile {
  app: 'kibitz';
  schema: 1;
  exportedAt: string;
  prefs: Partial<Prefs>;
  stores: Partial<Record<StoreName, unknown[]>>;
}

/** kv keys with this prefix describe this device, not your data: they are neither exported nor imported. */
export const DEVICE_PREFIX = 'device.';

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export async function exportBackup(opts: { includeEvalCache?: boolean } = {}): Promise<BackupFile> {
  const db = await getDb();
  const stores: BackupFile['stores'] = {};
  for (const name of STORE_NAMES) {
    if (name === 'evalCache' && !opts.includeEvalCache) continue;
    if (name === 'kv') {
      const keys = await db.getAllKeys('kv');
      const entries: [string, unknown][] = [];
      // Keys starting "device." belong to this device (a chosen backup folder, for one) and are never exported.
      for (const k of keys) if (!String(k).startsWith(DEVICE_PREFIX)) entries.push([String(k), await db.get('kv', k)]);
      stores.kv = entries;
    } else {
      stores[name] = await db.getAll(name);
    }
  }
  return { app: 'kibitz', schema: 1, exportedAt: new Date().toISOString(), prefs: getPrefs(), stores };
}

export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('That file is not valid JSON.');
  }
  const d = data as Partial<BackupFile> | null;
  if (!d || typeof d !== 'object' || d.app !== 'kibitz') throw new BackupError('This does not look like a Kibitz backup file.');
  if (d.schema !== 1) throw new BackupError(`Unsupported backup version (${String(d.schema)}). Update the app and try again.`);
  if (!d.stores || typeof d.stores !== 'object') throw new BackupError('The backup contains no data.');
  for (const [k, v] of Object.entries(d.stores)) {
    if (!(STORE_NAMES as readonly string[]).includes(k)) throw new BackupError(`Unknown data section "${k}" in backup.`);
    if (!Array.isArray(v)) throw new BackupError(`Section "${k}" is malformed.`);
  }
  return d as BackupFile;
}

export async function importBackup(file: BackupFile, mode: 'merge' | 'replace'): Promise<Record<string, number>> {
  const db = await getDb();
  const deviceRows: [string, unknown][] = [];
  if (mode === 'replace') {
    for (const k of await db.getAllKeys('kv')) if (String(k).startsWith(DEVICE_PREFIX)) deviceRows.push([String(k), await db.get('kv', String(k))]);
    await clearAllData({ keepPrefs: true });
    for (const [k, v] of deviceRows) await db.put('kv', v, k);
  }
  const counts: Record<string, number> = {};
  for (const name of STORE_NAMES) {
    const rows = file.stores[name];
    if (!rows?.length) continue;
    if (name === 'games') {
      const res = await addGames(rows as GameRecord[]);
      counts[name] = res.added;
      continue;
    }
    // Auto-numbered stores have no natural key, so a merge compares content to avoid doubling up on a re-import.
    const seen = new Set<string>();
    if (mode === 'merge' && (name === 'attempts' || name === 'strength')) {
      for (const r of await db.getAll(name)) {
        const { id: _i, ...rest } = r as { id?: number };
        void _i;
        seen.add(JSON.stringify(rest));
      }
    }
    const tx = db.transaction(name, 'readwrite');
    const store = tx.store as unknown as { put: (v: unknown, k?: unknown) => Promise<unknown>; add: (v: unknown) => Promise<unknown> };
    let n = 0;
    for (const row of rows) {
      if (name === 'kv') {
        const [k, v] = row as [string, unknown];
        if (k.startsWith(DEVICE_PREFIX)) continue;
        await store.put(v, k);
      } else if (name === 'attempts' || name === 'strength') {
        const { id: _id, ...rest } = row as { id?: number };
        void _id;
        const sig = JSON.stringify(rest);
        if (seen.has(sig)) continue;
        seen.add(sig);
        await store.add(rest);
      } else {
        await store.put(row);
      }
      n++;
    }
    await tx.done;
    counts[name] = n;
    if (name === 'analyses') await db.clear('analysisLite'); // rebuilt from the full records on next read
  }
  if (file.prefs && mode === 'replace') setPrefs(file.prefs);
  notify(...STORE_NAMES);
  return counts;
}

export async function clearStores(names: StoreName[]): Promise<void> {
  const db = await getDb();
  for (const n of names) await db.clear(n);
  if (names.includes('analyses')) await db.clear('analysisLite');
  notify(...names);
}

export async function clearAllData(opts: { keepPrefs?: boolean } = {}): Promise<void> {
  const db = await getDb();
  for (const n of STORE_NAMES) await db.clear(n);
  await db.clear('analysisLite');
  if (!opts.keepPrefs) resetPrefs();
  notify(...STORE_NAMES);
}

/** Hard reset: deletes the whole database. Used by "Delete everything". */
export async function deleteDatabase(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('kibitz');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  resetPrefs();
  notify(...STORE_NAMES);
}

export async function storageUsage(): Promise<{ counts: Record<string, number>; usage?: number; quota?: number }> {
  const db = await getDb();
  const counts: Record<string, number> = {};
  for (const n of STORE_NAMES) counts[n] = await db.count(n);
  let usage: number | undefined;
  let quota: number | undefined;
  try {
    const est = await navigator.storage?.estimate?.();
    usage = est?.usage;
    quota = est?.quota;
  } catch {
    /* not available */
  }
  return { counts, usage, quota };
}
