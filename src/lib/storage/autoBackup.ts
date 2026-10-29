// Automatic backups to a folder you choose.
//
//  * Desktop app: the shell writes into the folder through a small bridge (see electron/).
//  * Chromium browsers (Chrome, Edge, and others with the File System Access API): you pick a folder once, the
//    browser keeps permission to it, and a backup file is written there at most once a day. Browsers may ask you to
//    allow access again after a restart; the app then shows an "Allow" button instead of writing silently.
//  * Other browsers (Firefox, Safari): there is no way to write files in the background, so the app can only remind
//    you to download a backup by hand.
//
// A backup is the same JSON file the manual "Download backup" button gives. Only files named
// kibitz-backup-YYYY-MM-DD.json are ever replaced or deleted (the newest 7 are kept); nothing else in the folder is touched.
import { exportBackup } from './backup';
import { kvGet, kvSet } from './repos';

export const AUTO_BACKUP_INTERVAL_MS = 24 * 3600 * 1000;
export const AUTO_BACKUP_KEEP = 7;
const STATE_KEY = 'device.autobackup.state';
const HANDLE_KEY = 'device.autobackup.handle';
const MANUAL_KEY = 'device.backup.lastManual';

export type BackupSupport = 'desktop' | 'folder' | 'none';

export interface AutoBackupState {
  support: BackupSupport;
  enabled: boolean;
  folder?: string;
  lastAt?: number;
  lastFile?: string;
  lastError?: string;
  /** The browser wants you to allow folder access again (needs a click). */
  needsPermission?: boolean;
}

interface Stored {
  enabled: boolean;
  folder?: string;
  lastAt?: number;
  lastFile?: string;
  lastError?: string;
}

// The File System Access API is not in every TypeScript DOM lib, so the parts used are declared here.
interface DirHandle {
  name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }> }>;
  removeEntry(name: string): Promise<void>;
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string }>;
  queryPermission(d: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(d: { mode: 'readwrite' }): Promise<PermissionState>;
}
const picker = (): (() => Promise<DirHandle>) | null => {
  const f = (globalThis as unknown as { showDirectoryPicker?: (o: { mode: 'readwrite' }) => Promise<DirHandle> }).showDirectoryPicker;
  return f ? () => f.call(globalThis, { mode: 'readwrite' }) : null;
};

export const supportKind = (): BackupSupport => (typeof window !== 'undefined' && window.kibitz?.desktop ? 'desktop' : picker() ? 'folder' : 'none');

const BACKUP_NAME = /^kibitz-backup-(\d{4}-\d{2}-\d{2})\.json$/;
export const backupFileName = (d: Date): string => `kibitz-backup-${d.toISOString().slice(0, 10)}.json`;

/** Which automatic backup files to delete so that only the newest `keep` remain. Files with other names are never listed. */
export function backupsToRemove(names: string[], keep = AUTO_BACKUP_KEEP): string[] {
  return names
    .filter((n) => BACKUP_NAME.test(n))
    .sort()
    .slice(0, Math.max(0, names.filter((n) => BACKUP_NAME.test(n)).length - keep));
}

export const isBackupDue = (lastAt: number | undefined, now: number, interval = AUTO_BACKUP_INTERVAL_MS): boolean => lastAt === undefined || now - lastAt >= interval;

const load = async (): Promise<Stored> => (await kvGet<Stored>(STATE_KEY)) ?? { enabled: false };
const save = (s: Stored) => kvSet(STATE_KEY, s);

export async function readAutoBackup(): Promise<AutoBackupState> {
  const support = supportKind();
  const s = await load();
  const st: AutoBackupState = { support, enabled: s.enabled, folder: s.folder, lastAt: s.lastAt, lastFile: s.lastFile, lastError: s.lastError };
  if (support === 'desktop') st.folder = (await window.kibitz!.backup.folder()) ?? undefined;
  if (support === 'folder' && s.enabled) {
    const h = await kvGet<DirHandle>(HANDLE_KEY);
    if (!h) st.enabled = false;
    else st.needsPermission = (await h.queryPermission({ mode: 'readwrite' }).catch(() => 'denied' as PermissionState)) !== 'granted';
  }
  return st;
}

/** Ask the person for a folder and switch automatic backups on. Must be called from a click. */
export async function chooseBackupFolder(): Promise<AutoBackupState> {
  const support = supportKind();
  if (support === 'desktop') {
    const folder = await window.kibitz!.backup.chooseFolder();
    if (folder) await save({ ...(await load()), enabled: true, folder, lastError: undefined });
  } else if (support === 'folder') {
    const pick = picker()!;
    let h: DirHandle;
    try {
      h = await pick();
    } catch {
      return readAutoBackup(); // cancelled
    }
    await kvSet(HANDLE_KEY, h);
    await save({ ...(await load()), enabled: true, folder: h.name, lastError: undefined });
  }
  return readAutoBackup();
}

export async function disableAutoBackup(): Promise<AutoBackupState> {
  await save({ ...(await load()), enabled: false });
  return readAutoBackup();
}

/** Re-grant folder access after the browser forgot it. Must be called from a click. */
export async function regrantFolder(): Promise<AutoBackupState> {
  const h = await kvGet<DirHandle>(HANDLE_KEY);
  if (h) await h.requestPermission({ mode: 'readwrite' }).catch(() => undefined);
  return readAutoBackup();
}

/**
 * Write a backup now. With `onlyIfDue` it does nothing unless a day has passed since the last one (used at start-up).
 * Never throws: a failure is stored and shown in Settings.
 */
export async function runAutoBackup(opts: { onlyIfDue?: boolean; now?: number } = {}): Promise<AutoBackupState> {
  const now = opts.now ?? Date.now();
  const s = await load();
  const support = supportKind();
  if (!s.enabled || support === 'none') return readAutoBackup();
  if (opts.onlyIfDue && !isBackupDue(s.lastAt, now)) return readAutoBackup();
  try {
    const name = backupFileName(new Date(now));
    const text = JSON.stringify(await exportBackup());
    if (support === 'desktop') {
      await window.kibitz!.backup.write(name, text, AUTO_BACKUP_KEEP);
    } else {
      const h = await kvGet<DirHandle>(HANDLE_KEY);
      if (!h) throw new Error('The backup folder is no longer available. Choose it again.');
      if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted') {
        // Cannot ask without a click: leave a note and let Settings show the Allow button.
        return { ...(await readAutoBackup()), needsPermission: true };
      }
      const f = await h.getFileHandle(name, { create: true });
      const w = await f.createWritable();
      await w.write(text);
      await w.close();
      const names: string[] = [];
      for await (const e of h.values()) if (e.kind === 'file') names.push(e.name);
      for (const old of backupsToRemove(names)) await h.removeEntry(old).catch(() => undefined);
    }
    await save({ ...s, lastAt: now, lastFile: name, lastError: undefined });
  } catch (e) {
    await save({ ...s, lastError: e instanceof Error ? e.message : 'The backup could not be written.' });
  }
  return readAutoBackup();
}

/** Remember that a backup file was downloaded by hand (used for the reminder). */
export const noteManualBackup = (now = Date.now()) => kvSet(MANUAL_KEY, now);

/** When the newest backup of any kind was made, if ever. */
export async function lastBackupAt(): Promise<number | undefined> {
  const manual = await kvGet<number>(MANUAL_KEY);
  const auto = (await load()).lastAt;
  const all = [manual, auto].filter((x): x is number => typeof x === 'number');
  return all.length ? Math.max(...all) : undefined;
}
