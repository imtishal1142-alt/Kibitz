// Progress over time, from the games you have analysed. The pure functions take plain records so they can be tested
// with known numbers; `collectHistory` produces those records from stored analyses.
import { lossClassOf } from '../chess/classify';
import type { GameAnalysis, GameRecord } from '../types';
import { explainMove } from './explain';
import type { Category } from './explain';
import { CATEGORY_LABEL } from './explain';
import { puzzleThemeOf, userMistakes } from './weaknesses';

export interface GameStat {
  gameId: string;
  endTime: number;
  moves: number;
  accuracy: number;
  blunders: number;
  mistakes: number;
}
export interface MistakeRec {
  gameId: string;
  endTime: number;
  category: Category;
}

export function collectHistory(entries: { game: GameRecord; analysis: GameAnalysis }[]): { stats: GameStat[]; mistakes: MistakeRec[] } {
  const stats: GameStat[] = [];
  const mistakes: MistakeRec[] = [];
  for (const { game, analysis } of entries) {
    const c = game.userColor;
    if (!c) continue;
    const s = analysis.summary[c];
    const mine = analysis.moves.filter((m) => m.color === c);
    stats.push({
      gameId: game.id,
      endTime: game.endTime,
      moves: s.moves,
      accuracy: s.accuracy,
      blunders: mine.filter((m) => lossClassOf(m) === 'blunder').length,
      mistakes: mine.filter((m) => lossClassOf(m) === 'mistake').length,
    });
    for (const m of userMistakes(analysis, c)) {
      const ex = explainMove(m, analysis);
      if (ex.category !== 'sound') mistakes.push({ gameId: game.id, endTime: game.endTime, category: ex.category });
    }
  }
  return { stats, mistakes };
}

export const monthKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export interface MonthBucket {
  month: string;
  games: number;
  moves: number;
  /** Mean accuracy of your moves that month (weighted by moves). */
  accuracy: number;
  /** Per 100 of your moves. */
  blunderRate: number;
  mistakeRate: number;
  /** Mistakes of each category per 100 of your moves. */
  categories: Partial<Record<Category, number>>;
}

export function bucketByMonth(stats: GameStat[], mistakes: MistakeRec[]): MonthBucket[] {
  const by = new Map<string, { games: number; moves: number; acc: number; bl: number; mi: number; cat: Map<Category, number> }>();
  for (const g of stats) {
    const k = monthKey(g.endTime);
    const b = by.get(k) ?? { games: 0, moves: 0, acc: 0, bl: 0, mi: 0, cat: new Map() };
    b.games++;
    b.moves += g.moves;
    b.acc += g.accuracy * g.moves;
    b.bl += g.blunders;
    b.mi += g.mistakes;
    by.set(k, b);
  }
  const monthOfGame = new Map(stats.map((g) => [g.gameId, monthKey(g.endTime)]));
  for (const m of mistakes) {
    const b = by.get(monthOfGame.get(m.gameId) ?? '');
    if (b) b.cat.set(m.category, (b.cat.get(m.category) ?? 0) + 1);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, b]) => ({
      month,
      games: b.games,
      moves: b.moves,
      accuracy: b.moves ? b.acc / b.moves : 0,
      blunderRate: b.moves ? (b.bl / b.moves) * 100 : 0,
      mistakeRate: b.moves ? (b.mi / b.moves) * 100 : 0,
      categories: Object.fromEntries([...b.cat.entries()].map(([c, n]) => [c, b.moves ? (n / b.moves) * 100 : 0])),
    }));
}

/** Thresholds for the "is practice working?" check. Below them the app says there is not enough to tell. */
export const PRACTICE_RULES = {
  windowDays: 30,
  earlierDays: 60,
  minPractice: 10,
  minGamesEach: 6,
  minMovesEach: 150,
  minEarlierCount: 4,
  /** Not improving: the recent rate is at least this fraction of the earlier rate. */
  stalledAbove: 0.9,
  /** Improving: the recent rate is at most this fraction. */
  improvedBelow: 0.6,
} as const;

export interface PracticeFinding {
  category: Category;
  label: string;
  verdict: 'not-improving' | 'improving';
  practiceAttempts: number;
  earlierRate: number;
  recentRate: number;
  earlierCount: number;
  recentCount: number;
  message: string;
}

const DAY = 24 * 3600 * 1000;

/**
 * Practice that is not moving the needle. For each kind of mistake that has a matching puzzle theme, compare how often
 * it happened per 100 moves in the last 30 days with the 60 days before, and set that beside the practice done on it.
 * It reports only what the numbers support and says so when they cannot: it never claims that practice caused a change.
 */
export function practiceFindings(stats: GameStat[], mistakes: MistakeRec[], practiceByTheme: Record<string, number>, now: number): PracticeFinding[] {
  const R = PRACTICE_RULES;
  const recentFrom = now - R.windowDays * DAY;
  const earlierFrom = recentFrom - R.earlierDays * DAY;
  const recent = stats.filter((g) => g.endTime >= recentFrom && g.endTime <= now);
  const earlier = stats.filter((g) => g.endTime >= earlierFrom && g.endTime < recentFrom);
  const movesOf = (xs: GameStat[]) => xs.reduce((n, g) => n + g.moves, 0);
  const recentMoves = movesOf(recent);
  const earlierMoves = movesOf(earlier);
  if (recent.length < R.minGamesEach || earlier.length < R.minGamesEach || recentMoves < R.minMovesEach || earlierMoves < R.minMovesEach) return [];
  const idsRecent = new Set(recent.map((g) => g.gameId));
  const idsEarlier = new Set(earlier.map((g) => g.gameId));
  const out: PracticeFinding[] = [];
  const cats = new Set(mistakes.map((m) => m.category));
  for (const category of cats) {
    const theme = puzzleThemeOf(category);
    const practiceAttempts = theme ? (practiceByTheme[theme] ?? 0) : 0;
    if (!theme || practiceAttempts < R.minPractice) continue;
    const earlierCount = mistakes.filter((m) => m.category === category && idsEarlier.has(m.gameId)).length;
    const recentCount = mistakes.filter((m) => m.category === category && idsRecent.has(m.gameId)).length;
    if (earlierCount < R.minEarlierCount) continue;
    const earlierRate = (earlierCount / earlierMoves) * 100;
    const recentRate = (recentCount / recentMoves) * 100;
    const label = CATEGORY_LABEL[category];
    const nums = `${earlierRate.toFixed(1)} per 100 moves before, ${recentRate.toFixed(1)} in the last ${R.windowDays} days`;
    if (recentRate >= earlierRate * R.stalledAbove) {
      out.push({ category, label, verdict: 'not-improving', practiceAttempts, earlierRate, recentRate, earlierCount, recentCount, message: `You have done ${practiceAttempts} ${theme} puzzle attempts in the last ${R.windowDays} days, but "${label.toLowerCase()}" mistakes are not falling (${nums}). Puzzles alone may not carry over to your games; try the exercise built for it in the weakness card, and slow down at the moment it happens. This is a small sample, so treat it as a prompt, not a verdict.` });
    } else if (recentRate <= earlierRate * R.improvedBelow) {
      out.push({ category, label, verdict: 'improving', practiceAttempts, earlierRate, recentRate, earlierCount, recentCount, message: `"${label}" mistakes are down (${nums}) while you practised it ${practiceAttempts} times. Keep going. Small samples can mislead, but this is the direction you want.` });
    }
  }
  return out.sort((a, b) => (a.verdict === b.verdict ? b.earlierRate - a.earlierRate : a.verdict === 'not-improving' ? -1 : 1));
}
