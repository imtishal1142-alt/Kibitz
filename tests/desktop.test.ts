import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupsToRemove } from '../src/lib/storage/autoBackup';

const { isBackupName, toRemove, writeBackup } = createRequire(import.meta.url)('../electron/backup.cjs') as {
  isBackupName: (n: unknown) => boolean;
  toRemove: (names: string[], keep: number) => string[];
  writeBackup: (folder: string, name: string, text: string, keep: number) => { folder: string; removed: string[] };
};

describe('desktop backup writer', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kibitz-bk-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('accepts only the exact backup file name, so the page cannot write anywhere else', () => {
    expect(isBackupName('kibitz-backup-2026-10-26.json')).toBe(true);
    for (const bad of ['../kibitz-backup-2026-10-26.json', 'kibitz-backup-2026-10-26.json/../x', 'kibitz-backup-final.json', '/etc/passwd', 'a/kibitz-backup-2026-10-26.json', '', 42, null]) expect(isBackupName(bad)).toBe(false);
    expect(() => writeBackup(dir, '../escape.json', '{}', 7)).toThrow(/not a backup file name/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('writes the file, leaves no temporary file, and removes only older backups beyond the newest 7', () => {
    writeFileSync(join(dir, 'photo.jpg'), 'x');
    for (let d = 1; d <= 9; d++) writeFileSync(join(dir, `kibitz-backup-2026-01-0${d}.json`), '{}');
    const res = writeBackup(dir, 'kibitz-backup-2026-10-26.json', '{"app":"kibitz"}', 7);
    expect(res.removed).toHaveLength(3);
    const left = readdirSync(dir).sort();
    expect(left).toContain('photo.jpg');
    expect(left.filter((n) => n.endsWith('.tmp'))).toEqual([]);
    expect(left.filter(isBackupName)).toHaveLength(7);
    expect(readFileSync(join(dir, 'kibitz-backup-2026-10-26.json'), 'utf8')).toBe('{"app":"kibitz"}');
    // Writing the same day again replaces it instead of adding another.
    writeBackup(dir, 'kibitz-backup-2026-10-26.json', '{"app":"kibitz","n":2}', 7);
    expect(readdirSync(dir).filter(isBackupName)).toHaveLength(7);
  });

  it('refuses empty content or a missing folder, and uses the same rotation as the browser', () => {
    expect(() => writeBackup(dir, 'kibitz-backup-2026-10-26.json', '', 7)).toThrow(/empty/);
    expect(() => writeBackup(join(dir, 'missing'), 'kibitz-backup-2026-10-26.json', '{}', 7)).toThrow(/does not exist/);
    mkdirSync(join(dir, 'sub'));
    const names = Array.from({ length: 12 }, (_, i) => `kibitz-backup-2026-02-${String(i + 1).padStart(2, '0')}.json`);
    expect(toRemove(names, 7)).toEqual(backupsToRemove(names, 7));
  });
});
