import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { performanceRating } from '../src/lib/strength/estimate';
import { BackupError, clearAllData, exportBackup, importBackup, parseBackup, storageUsage } from '../src/lib/storage/backup';
import { addAttempt, addGames, addStrength, kvSet, listAttempts, listGames, listNotebook, listStrength, putNotebook } from '../src/lib/storage/repos';
import { getPrefs, resetPrefs, setPrefs } from '../src/lib/storage/prefs';
import { gameFromPgn } from '../src/lib/games/records';

const pgn = (w: string, moves: string) => `[Event "t"]\n[White "${w}"]\n[Black "Opp"]\n[Result "*"]\n\n${moves} *`;

describe('performance rating', () => {
  it('equals the average opponent at a 50% score', () => {
    const p = performanceRating([
      { opponent: 1400, score: 1, at: 0 },
      { opponent: 1600, score: 0, at: 1 },
    ])!;
    expect(p.rating).toBe(1500);
    expect(p.avgOpponent).toBe(1500);
    expect(p.capped).toBe(false);
  });
  it('adds about 191 points at a 75% score (400*log10(3))', () => {
    const p = performanceRating([1, 1, 1, 0].map((score, at) => ({ opponent: 1500, score, at })))!;
    expect(p.rating).toBe(Math.round(1500 + 400 * Math.log10(3)));
  });
  it('caps perfect and zero scores at +/-800 and says so', () => {
    expect(performanceRating([{ opponent: 1500, score: 1, at: 0 }])).toMatchObject({ rating: 2300, capped: true });
    expect(performanceRating([{ opponent: 1500, score: 0, at: 0 }])).toMatchObject({ rating: 700, capped: true });
    expect(performanceRating([])).toBeNull();
  });
  it('counts a draw as half a point', () => {
    expect(performanceRating([{ opponent: 1800, score: 0.5, at: 0 }])!.rating).toBe(1800);
  });
});

describe('backup and restore', () => {
  beforeEach(async () => {
    await clearAllData();
    resetPrefs();
  });

  const seed = async () => {
    await addGames([gameFromPgn(pgn('Me', '1. e4 e5 2. Nf3 Nc6'), { source: 'pgn' }), gameFromPgn(pgn('Me', '1. d4 d5 2. c4 e6'), { source: 'pgn' })]);
    await putNotebook({ id: 'nb1', fen: 'start', title: 'T', note: 'n', tags: ['a'], variations: [], createdAt: 1, updatedAt: 2 });
    await addAttempt({ puzzleId: 'p1', at: 111, ok: true, ms: 2000, hints: 0, revealed: false });
    await addStrength({ at: 5, timeClass: 'rapid', games: 10, rating: 1500, low: 1400, high: 1600, level: 0.8, method: 'test' });
    await kvSet('puzzleRating', 1337);
    setPrefs({ boardTheme: 'walnut', dailyGoal: 17 });
  };

  it('round-trips through JSON and restores everything into an empty database', async () => {
    await seed();
    const file = parseBackup(JSON.stringify(await exportBackup()));
    expect(file.app).toBe('kibitz');
    await clearAllData();
    expect(await listGames()).toHaveLength(0);
    const counts = await importBackup(file, 'replace');
    expect(counts.games).toBe(2);
    expect(await listGames()).toHaveLength(2);
    expect((await listNotebook())[0]?.title).toBe('T');
    expect(await listAttempts()).toHaveLength(1);
    expect(await listStrength()).toHaveLength(1);
    expect(getPrefs()).toMatchObject({ boardTheme: 'walnut', dailyGoal: 17 });
    const usage = await storageUsage();
    expect(usage.counts.kv).toBe(1);
  });

  it('merging the same backup twice never duplicates games, attempts or strength snapshots', async () => {
    await seed();
    const file = parseBackup(JSON.stringify(await exportBackup()));
    await importBackup(file, 'merge');
    await importBackup(file, 'merge');
    expect(await listGames()).toHaveLength(2);
    expect(await listAttempts()).toHaveLength(1);
    expect(await listStrength()).toHaveLength(1);
    expect(await listNotebook()).toHaveLength(1);
  });

  it('leaves the evaluation cache out unless asked', async () => {
    const without = await exportBackup();
    expect(without.stores.evalCache).toBeUndefined();
    const withCache = await exportBackup({ includeEvalCache: true });
    expect(withCache.stores.evalCache).toEqual([]);
  });

  it('rejects files that are not valid backups with a readable reason', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"app":"other"}')).toThrow(/Kibitz backup/);
    expect(() => parseBackup('{"app":"kibitz","schema":99,"stores":{}}')).toThrow(/Unsupported backup version/);
    expect(() => parseBackup('{"app":"kibitz","schema":1,"stores":{"nonsense":[]}}')).toThrow(/Unknown data section/);
    expect(() => parseBackup('{"app":"kibitz","schema":1,"stores":{"games":"x"}}')).toThrow(/malformed/);
  });

  it('clearAllData can keep or reset preferences', async () => {
    await seed();
    await clearAllData({ keepPrefs: true });
    expect(await listGames()).toHaveLength(0);
    expect(getPrefs().dailyGoal).toBe(17);
    await clearAllData();
    expect(getPrefs().dailyGoal).toBe(10);
  });
});

describe('dates on games', () => {
  const dated = (date: string) => gameFromPgn(`[Event "t"]\n[Date "${date}"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4 e5 *`, { source: 'pgn' });
  it('keeps exact dates exact and labels partial or missing ones honestly', () => {
    expect(dated('2024.03.05').dateLabel).toBeUndefined();
    expect(dated('1858.??.??').dateLabel).toBe('1858');
    expect(dated('1858.11.??').dateLabel).toBe('Nov 1858');
    expect(dated('????.??.??').dateLabel).toBe('Date unknown');
    expect(gameFromPgn('[Event "t"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. e4 e5 *', { source: 'pgn' }).dateLabel).toBe('Date unknown');
  });
});
