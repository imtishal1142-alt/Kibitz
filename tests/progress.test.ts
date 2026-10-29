import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { PRACTICE_RULES, bucketByMonth, monthKey, practiceFindings } from '../src/lib/analysis/progress';
import type { GameStat, MistakeRec } from '../src/lib/analysis/progress';
import { buildSession, weaknessRoute } from '../src/lib/training/session';
import { addDays, streakInfo } from '../src/lib/training/streak';
import { RETEST_OK_LOSS, applyRetest, loadRetests, queueRetests, recordRetest, retestKey } from '../src/lib/training/retest';
import type { CalendarDay } from '../src/lib/types';

const day = (date: string, over: Partial<CalendarDay> = {}): CalendarDay => ({ date, puzzles: 0, puzzlesCorrect: 0, reviews: 0, gamesAnalyzed: 0, lessons: 0, minutes: 0, played: 0, ...over });
const DAY = 24 * 3600 * 1000;

describe('streaks', () => {
  it('counts consecutive active days, keeps a streak alive until the end of today, and finds the longest run', () => {
    const days = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-24'].map((d) => day(d, { puzzles: 2 }));
    days.push(day('2026-10-23')); // present but inactive
    const alive = streakInfo(days, '2026-10-25'); // nothing yet today; yesterday was active
    expect(alive.current).toBe(1);
    expect(alive.activeToday).toBe(false);
    expect(alive.longest).toBe(3);
    const today = streakInfo([...days, day('2026-10-25', { retests: 1 })], '2026-10-25');
    expect(today.current).toBe(2);
    expect(today.activeToday).toBe(true);
    expect(streakInfo(days, '2026-10-27').current).toBe(0); // missed a full day
    expect(today.week).toHaveLength(7);
    expect(today.week.at(-1)).toEqual({ date: '2026-10-25', active: true });
    expect(today.last30).toBe(5);
  });
  it('does date arithmetic across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('re-testing mistakes', () => {
  const now = Date.UTC(2026, 9, 25);
  it('schedules by Leitner box and resets on a miss', () => {
    let m = applyRetest({}, 'g:5', true, 4000, now);
    expect(m['g:5']!.box).toBe(1);
    expect(m['g:5']!.due).toBe(now + 1 * DAY);
    m = applyRetest(m, 'g:5', true, 1000, now + DAY);
    expect(m['g:5']!.box).toBe(2);
    m = applyRetest(m, 'g:5', false, 1000, now + 5 * DAY);
    expect(m['g:5']!.box).toBe(0);
    expect(m['g:5']!.streak).toBe(0);
    expect(RETEST_OK_LOSS).toBeGreaterThan(0);
  });
  it('queues due before new before later, and persists', async () => {
    const items = [
      { key: 'a', winLoss: 30 },
      { key: 'b', winLoss: 12 },
      { key: 'c', winLoss: 20 },
      { key: 'd', winLoss: 25 },
    ];
    let map = applyRetest({}, 'b', true, 0, now); // due in a day
    map = applyRetest(map, 'c', false, 0, now - 2 * DAY); // retry window long past: due
    const q = queueRetests(items, map, now + 2 * DAY);
    expect(q.due.map((i) => i.key)).toEqual(['c', 'b']);
    expect(q.fresh.map((i) => i.key)).toEqual(['a', 'd']); // largest loss first
    expect(queueRetests(items, map, now).later.map((i) => i.key)).toEqual(['b']);
    await recordRetest('game1', 7, true, 0, now);
    expect((await loadRetests())[retestKey('game1', 7)]!.box).toBe(1);
  });
});

describe('today\'s session', () => {
  const base = { gamesTotal: 10, analysedGames: 8, duePuzzles: 3, freshPuzzles: 9, dailyGoal: 10, retestable: 5, weakness: { category: 'hanging-piece' as const, label: 'Hanging a piece' }, unreviewed: { id: 'g1', title: 'You vs Rival' }, reflectedToday: false };
  it('builds the steps from the data, with targets and progress from today\'s calendar', () => {
    const s = buildSession({ ...base, today: day('2026-10-25', { puzzles: 8, retests: 1, lessons: 1 }) });
    expect(s.steps.map((x) => x.id)).toEqual(['puzzles', 'retest', 'review', 'weakness', 'reflect']);
    const byId = Object.fromEntries(s.steps.map((x) => [x.id, x]));
    expect(byId.puzzles).toMatchObject({ target: 8, done: 8, complete: true });
    expect(byId.retest).toMatchObject({ target: 3, done: 1, complete: false });
    expect(byId.weakness!.complete).toBe(true);
    expect(byId.weakness!.to).toBe('/train/prevention');
    expect(s.next!.id).toBe('retest');
    expect(s.complete).toBe(false);
    expect(s.doneCount).toBe(2);
  });
  it('does not count a reflection as the weakness exercise, and completes when everything is done', () => {
    const s = buildSession({ ...base, reflectedToday: true, today: day('d', { lessons: 1 }) });
    expect(s.steps.find((x) => x.id === 'weakness')!.complete).toBe(false);
    const all = buildSession({ ...base, reflectedToday: true, today: day('d', { puzzles: 9, retests: 3, gamesReviewed: 1, lessons: 2 }) });
    expect(all.complete).toBe(true);
    expect(all.next).toBeNull();
  });
  it('asks for games first, then analysis, and skips what has no data', () => {
    expect(buildSession({ ...base, gamesTotal: 0, analysedGames: 0 }).steps.map((x) => x.id)).toEqual(['import']);
    expect(buildSession({ ...base, analysedGames: 0 }).steps.map((x) => x.id)).toEqual(['analyse']);
    expect(buildSession({ ...base, duePuzzles: 0, freshPuzzles: 0, retestable: 0, weakness: null, unreviewed: null }).steps).toEqual([]);
    expect(weaknessRoute('endgame-technique')).toBe('/train/endgames');
  });
});

describe('progress by month', () => {
  const t = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
  const stat = (id: string, endTime: number, moves: number, accuracy: number, blunders = 0, mistakes = 0): GameStat => ({ gameId: id, endTime, moves, accuracy, blunders, mistakes });
  it('weights accuracy by moves and gives rates per 100 moves', () => {
    const stats = [stat('a', t(2026, 8, 3), 40, 80, 2, 1), stat('b', t(2026, 8, 20), 60, 90, 1, 3), stat('c', t(2026, 9, 2), 50, 85, 0, 0)];
    const mistakes: MistakeRec[] = [
      { gameId: 'a', endTime: t(2026, 8, 3), category: 'hanging-piece' },
      { gameId: 'b', endTime: t(2026, 8, 20), category: 'hanging-piece' },
    ];
    const b = bucketByMonth(stats, mistakes);
    expect(b.map((x) => x.month)).toEqual(['2026-08', '2026-09']);
    expect(b[0]!.games).toBe(2);
    expect(b[0]!.accuracy).toBeCloseTo((80 * 40 + 90 * 60) / 100, 8);
    expect(b[0]!.blunderRate).toBeCloseTo(3, 8);
    expect(b[0]!.mistakeRate).toBeCloseTo(4, 8);
    expect(b[0]!.categories['hanging-piece']).toBeCloseTo(2, 8);
    expect(b[1]!.categories['hanging-piece']).toBeUndefined();
    expect(monthKey(t(2026, 1, 31))).toBe('2026-01');
  });
});

describe('is practice working?', () => {
  const now = Date.UTC(2026, 9, 25, 12);
  const games = (n: number, from: number, step: number, prefix: string): GameStat[] => Array.from({ length: n }, (_, i) => ({ gameId: `${prefix}${i}`, endTime: from + i * step, moves: 40, accuracy: 80, blunders: 0, mistakes: 0 }));
  const earlier = games(8, now - 80 * DAY, 5 * DAY, 'e'); // 80..45 days ago
  const recent = games(8, now - 25 * DAY, 3 * DAY, 'r');
  const mk = (prefix: string, n: number): MistakeRec[] => Array.from({ length: n }, (_, i) => ({ gameId: `${prefix}${i % 8}`, endTime: 0, category: 'hanging-piece' as const }));
  const stats = [...earlier, ...recent];

  it('flags practice that is not changing the mistake rate, with its numbers and a caution', () => {
    const f = practiceFindings(stats, [...mk('e', 8), ...mk('r', 8)], { defense: 25 }, now);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ category: 'hanging-piece', verdict: 'not-improving', practiceAttempts: 25 });
    expect(f[0]!.message).toMatch(/25 defense puzzle attempts/);
    expect(f[0]!.message).toMatch(/small sample/);
  });
  it('reports real improvement, and stays quiet when the evidence is thin', () => {
    expect(practiceFindings(stats, [...mk('e', 8), ...mk('r', 2)], { defense: 25 }, now)[0]!.verdict).toBe('improving');
    expect(practiceFindings(stats, [...mk('e', 8), ...mk('r', 6)], { defense: 25 }, now)).toEqual([]); // in between
    expect(practiceFindings(stats, [...mk('e', 8), ...mk('r', 8)], { defense: PRACTICE_RULES.minPractice - 1 }, now)).toEqual([]);
    expect(practiceFindings(stats, [...mk('e', 3), ...mk('r', 3)], { defense: 25 }, now)).toEqual([]);
    expect(practiceFindings(recent, mk('r', 8), { defense: 25 }, now)).toEqual([]); // nothing to compare with
  });
});
