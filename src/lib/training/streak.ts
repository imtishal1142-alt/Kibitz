// Practice streaks, from the training calendar only.
import type { CalendarDay } from '../types';

/**
 * A day counts when the person did deliberate training that day: a puzzle, a review, a lesson, a retest, or a game played.
 * Analysing games does not count, because the app does that in the background.
 */
export const activeDay = (d: CalendarDay): boolean => d.puzzles + d.reviews + d.lessons + d.played + (d.retests ?? 0) + (d.gamesReviewed ?? 0) > 0;

const parseKey = (k: string): Date => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12);
};
const keyOf = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (key: string, n: number): string => {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return keyOf(d);
};

export interface StreakInfo {
  /** Consecutive active days ending today, or ending yesterday when today has no activity yet (the streak is still alive). */
  current: number;
  longest: number;
  activeToday: boolean;
  /** The last seven days, oldest first, ending today. */
  week: { date: string; active: boolean }[];
  /** Active days in the last 30 days. */
  last30: number;
}

export function streakInfo(days: CalendarDay[], today: string): StreakInfo {
  const active = new Set(days.filter(activeDay).map((d) => d.date));
  const activeToday = active.has(today);
  let cur = 0;
  let k = activeToday ? today : addDays(today, -1);
  while (active.has(k)) {
    cur++;
    k = addDays(k, -1);
  }
  const sorted = [...active].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 6);
    return { date, active: active.has(date) };
  });
  let last30 = 0;
  for (let i = 0; i < 30; i++) if (active.has(addDays(today, -i))) last30++;
  return { current: cur, longest, activeToday, week, last30 };
}
