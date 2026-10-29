// Spaced repetition (Leitner boxes) and adaptive difficulty for puzzles.
import type { PuzzleAttempt, PuzzleRecord, PuzzleSrs } from '../types';

export const DAY = 24 * 3600 * 1000;
/** Days until the next review after a success, indexed by the NEW box (0 = relearning). */
export const BOX_DAYS = [0, 1, 3, 7, 14, 30] as const;
export const RETRY_MS = 10 * 60 * 1000;

export function nextSrs(s: PuzzleSrs, ok: boolean, ms: number, now: number): PuzzleSrs {
  const attempts = s.attempts + 1;
  const successes = s.successes + (ok ? 1 : 0);
  const box = ok ? Math.min(BOX_DAYS.length - 1, s.box + 1) : 0;
  const due = ok ? now + BOX_DAYS[box]! * DAY : now + RETRY_MS;
  const avgMs = s.avgMs === undefined ? ms : Math.round((s.avgMs * s.attempts + ms) / attempts);
  return { ...s, box, due, attempts, successes, lastAt: now, avgMs, streak: ok ? s.streak + 1 : 0 };
}

export function isDue(s: PuzzleSrs, now: number): boolean {
  return s.attempts > 0 && s.due <= now;
}

/** Elo-style update: both the player's puzzle rating and the puzzle's difficulty move. */
export function updateRatings(user: number, puzzle: number, ok: boolean): { user: number; puzzle: number } {
  const expected = 1 / (1 + 10 ** ((puzzle - user) / 400));
  const score = ok ? 1 : 0;
  return { user: Math.round(user + 24 * (score - expected)), puzzle: Math.round(puzzle + 12 * (expected - score)) };
}

export interface DailySet {
  due: PuzzleRecord[];
  fresh: PuzzleRecord[];
  ordered: PuzzleRecord[];
}

/**
 * Today's practice: overdue reviews first (most overdue first), then unseen puzzles whose
 * difficulty is closest to the player's current puzzle rating, mixing themes.
 */
export function buildDailySet(puzzles: PuzzleRecord[], srs: PuzzleSrs[], userRating: number, now: number, size: number): DailySet {
  const srsById = new Map(srs.map((s) => [s.puzzleId, s]));
  const due = puzzles
    .filter((p) => {
      const s = srsById.get(p.id);
      return s && isDue(s, now);
    })
    .sort((a, b) => srsById.get(a.id)!.due - srsById.get(b.id)!.due);
  const unseen = puzzles.filter((p) => (srsById.get(p.id)?.attempts ?? 0) === 0).sort((a, b) => Math.abs(a.difficulty - userRating) - Math.abs(b.difficulty - userRating));
  const fresh: PuzzleRecord[] = [];
  const seenThemes = new Map<string, number>();
  for (const p of unseen) {
    if (due.length + fresh.length >= size) break;
    if ((seenThemes.get(p.theme) ?? 0) >= Math.max(2, Math.ceil(size / 3))) continue; // keep the mix varied
    seenThemes.set(p.theme, (seenThemes.get(p.theme) ?? 0) + 1);
    fresh.push(p);
  }
  for (const p of unseen) {
    if (due.length + fresh.length >= size) break;
    if (!fresh.includes(p)) fresh.push(p);
  }
  return { due: due.slice(0, size), fresh, ordered: [...due.slice(0, size), ...fresh].slice(0, size) };
}

export interface PuzzleStats {
  attempts: number;
  solved: number;
  successRate: number;
  avgMs: number;
  byTheme: { theme: string; attempts: number; solved: number; rate: number }[];
  streakDays: number;
  last7: { date: string; attempts: number; solved: number }[];
}

export function puzzleStats(attempts: PuzzleAttempt[], puzzles: PuzzleRecord[], today = new Date()): PuzzleStats {
  const themeOf = new Map(puzzles.map((p) => [p.id, p.theme]));
  const solved = attempts.filter((a) => a.ok).length;
  const byTheme = new Map<string, { attempts: number; solved: number }>();
  for (const a of attempts) {
    const th = themeOf.get(a.puzzleId) ?? 'tactic';
    const cur = byTheme.get(th) ?? { attempts: 0, solved: 0 };
    cur.attempts++;
    if (a.ok) cur.solved++;
    byTheme.set(th, cur);
  }
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const perDay = new Map<string, { attempts: number; solved: number }>();
  for (const a of attempts) {
    const k = key(new Date(a.at));
    const cur = perDay.get(k) ?? { attempts: 0, solved: 0 };
    cur.attempts++;
    if (a.ok) cur.solved++;
    perDay.set(k, cur);
  }
  const last7: PuzzleStats['last7'] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const k = key(d);
    last7.push({ date: k, ...(perDay.get(k) ?? { attempts: 0, solved: 0 }) });
  }
  let streakDays = 0;
  for (let i = 0; i < 400; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    if (perDay.has(key(d))) streakDays++;
    else if (i > 0) break; // today may still be empty
  }
  const timed = attempts.filter((a) => a.ms > 0);
  return {
    attempts: attempts.length,
    solved,
    successRate: attempts.length ? solved / attempts.length : 0,
    avgMs: timed.length ? timed.reduce((s, a) => s + a.ms, 0) / timed.length : 0,
    byTheme: [...byTheme.entries()].map(([theme, v]) => ({ theme, ...v, rate: v.solved / v.attempts })).sort((a, b) => b.attempts - a.attempts),
    streakDays,
    last7,
  };
}
