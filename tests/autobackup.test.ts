import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUTO_BACKUP_KEEP, backupFileName, backupsToRemove, chooseBackupFolder, isBackupDue, lastBackupAt, noteManualBackup, readAutoBackup, runAutoBackup } from '../src/lib/storage/autoBackup';
import { clearAllData, exportBackup, importBackup, parseBackup } from '../src/lib/storage/backup';
import { kvGet, kvSet } from '../src/lib/storage/repos';

describe('automatic backup rules', () => {
  it('is due after a day, or when there has never been one', () => {
    expect(isBackupDue(undefined, 1000)).toBe(true);
    expect(isBackupDue(1000, 1000 + 23 * 3600e3)).toBe(false);
    expect(isBackupDue(1000, 1000 + 24 * 3600e3)).toBe(true);
  });
  it('names files by day and removes only its own old files', () => {
    expect(backupFileName(new Date('2026-10-26T20:00:00Z'))).toBe('kibitz-backup-2026-10-26.json');
    const mine = Array.from({ length: 10 }, (_, i) => `kibitz-backup-2026-10-${String(10 + i).padStart(2, '0')}.json`);
    const others = ['holiday.jpg', 'kibitz-backup-final.json', 'kibitz-backup-2026-10-1.json', 'notes.json'];
    const victims = backupsToRemove([...others, ...mine.slice().reverse()]);
    expect(victims).toEqual(mine.slice(0, 10 - AUTO_BACKUP_KEEP));
    expect(backupsToRemove(others)).toEqual([]);
    expect(backupsToRemove(mine.slice(0, 3))).toEqual([]);
  });
});

describe('device keys and the desktop bridge', () => {
  const written: { name: string; text: string; keep: number }[] = [];
  beforeEach(async () => {
    await clearAllData();
    written.length = 0;
    (globalThis as unknown as { window: unknown }).window = {
      kibitz: { desktop: true, platform: 'test', version: '0', backup: { folder: async () => '/home/me/Chess backups', chooseFolder: async () => '/home/me/Chess backups', write: async (name: string, text: string, keep: number) => (written.push({ name, text, keep }), { folder: '/x', removed: [] }), reveal: async () => undefined } },
    };
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('writes one backup a day through the bridge, records it, and never exports its own settings', async () => {
    expect((await readAutoBackup()).support).toBe('desktop');
    expect((await readAutoBackup()).enabled).toBe(false);
    await runAutoBackup(); // off: nothing written
    expect(written).toHaveLength(0);

    const on = await chooseBackupFolder();
    expect(on.enabled).toBe(true);
    expect(on.folder).toBe('/home/me/Chess backups');
    const day = Date.parse('2026-10-26T10:00:00Z');
    const after = await runAutoBackup({ onlyIfDue: true, now: day });
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ name: 'kibitz-backup-2026-10-26.json', keep: AUTO_BACKUP_KEEP });
    expect(after.lastAt).toBe(day);
    expect(after.lastError).toBeUndefined();
    // Same day again: not due.
    await runAutoBackup({ onlyIfDue: true, now: day + 3600e3 });
    expect(written).toHaveLength(1);
    // The next day: due.
    await runAutoBackup({ onlyIfDue: true, now: day + 25 * 3600e3 });
    expect(written).toHaveLength(2);
    // The file is a real backup, and holds no device settings.
    const file = parseBackup(written[0]!.text);
    expect(JSON.stringify(file.stores.kv ?? [])).not.toMatch(/device\./);
    expect(await lastBackupAt()).toBe(day + 25 * 3600e3);
  });

  it('keeps device settings across a restore that replaces everything, and ignores them inside a backup file', async () => {
    await chooseBackupFolder();
    await kvSet('retest.v1', { a: 1 });
    const file = await exportBackup();
    file.stores.kv = [...(file.stores.kv ?? []), ['device.autobackup.state', { enabled: false }]];
    await importBackup(file, 'replace');
    expect(await kvGet('retest.v1')).toEqual({ a: 1 });
    expect((await readAutoBackup()).enabled).toBe(true);
  });

  it('records a failed write instead of throwing', async () => {
    await chooseBackupFolder();
    (globalThis as unknown as { window: { kibitz: { backup: { write: () => Promise<never> } } } }).window.kibitz.backup.write = async () => {
      throw new Error('disk full');
    };
    const st = await runAutoBackup();
    expect(st.lastError).toBe('disk full');
    expect(st.lastAt).toBeUndefined();
  });

  it('reminds only from manual downloads when there is no automatic backup', async () => {
    expect(await lastBackupAt()).toBeUndefined();
    await noteManualBackup(5);
    expect(await lastBackupAt()).toBe(5);
  });
});
