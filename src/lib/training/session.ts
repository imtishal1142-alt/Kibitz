// Today's guided session: a short, ordered list of things to do, each with a target and live progress taken from
// what you actually did today (the training calendar). Nothing here is stored; it is rebuilt from your data every time.
import type { Category } from '../analysis/explain';
import type { CalendarDay } from '../types';

export interface SessionInput {
  gamesTotal: number;
  analysedGames: number;
  duePuzzles: number;
  freshPuzzles: number;
  dailyGoal: number;
  /** Mistakes ready to be re-tested: due again, or never retried. */
  retestable: number;
  weakness?: { category: Category; label: string } | null;
  /** The newest analysed game of yours that has not been taken through the guided review. */
  unreviewed?: { id: string; title: string } | null;
  reflectedToday: boolean;
  today?: CalendarDay;
  /** Local date (YYYY-MM-DD). When given, one rotating "something different" exercise is added each day. */
  dateKey?: string;
}

export interface SessionStep {
  id: string;
  title: string;
  detail: string;
  to: string;
  done: number;
  target: number;
  minutes: number;
  complete: boolean;
}

export interface Session {
  steps: SessionStep[];
  minutes: number;
  doneCount: number;
  complete: boolean;
  next: SessionStep | null;
}

/** Where the exercise for a weakness lives. */
export function weaknessRoute(c: Category): string {
  switch (c) {
    case 'hanging-piece':
    case 'missed-threat':
      return '/train/prevention';
    case 'missed-tactic':
    case 'missed-win':
    case 'poor-exchange':
      return '/train/mistakes';
    case 'pawn-structure':
    case 'positional':
    case 'king-safety':
      return '/train/candidates';
    case 'development':
      return '/openings';
    case 'endgame-technique':
      return '/train/endgames';
    case 'calculation':
    case 'time-pressure':
      return '/train/guess';
    default:
      return '/puzzles';
  }
}

/** The exercises the daily rotation draws from: different skills on different days, so a session never becomes one routine. */
export const VARIETY: { to: string; title: string; detail: string; minutes: number }[] = [
  { to: '/train/guess', title: 'Guess the move', detail: 'Play through one of your games and guess each move before it is shown.', minutes: 6 },
  { to: '/train/endgames', title: 'An endgame lesson', detail: 'One core endgame idea, checked by the engine.', minutes: 6 },
  { to: '/train/candidates', title: 'Candidate moves', detail: 'Name your candidate moves before the engine shows its lines.', minutes: 5 },
  { to: '/train/prevention', title: 'Blunder prevention', detail: 'Find the threat before choosing a move.', minutes: 5 },
  { to: '/openings', title: 'Opening check', detail: 'Look at where you left your repertoire and fix one line.', minutes: 5 },
];

function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

const step = (id: string, title: string, detail: string, to: string, done: number, target: number, minutes: number): SessionStep => ({ id, title, detail, to, done: Math.min(done, target), target, minutes, complete: done >= target });

export function buildSession(i: SessionInput): Session {
  const steps: SessionStep[] = [];
  const t = i.today;
  if (i.gamesTotal === 0) {
    steps.push(step('import', 'Bring in some games', 'Everything here is built from your own games. Import from Chess.com or paste a PGN.', '/chesscom', 0, 1, 5));
  } else if (i.analysedGames === 0) {
    steps.push(step('analyse', 'Analyse your games', 'Analysis finds your mistakes; every other step depends on it.', '/library', 0, 1, 5));
  } else {
    const puzzles = i.duePuzzles + i.freshPuzzles;
    if (puzzles > 0) {
      const target = Math.max(1, Math.min(i.dailyGoal, 8, puzzles));
      steps.push(step('puzzles', `Solve ${target} puzzle${target === 1 ? '' : 's'} from your games`, i.duePuzzles > 0 ? `${i.duePuzzles} are due for review; the rest are new.` : 'New positions where you went wrong.', '/puzzles', t?.puzzles ?? 0, target, Math.max(3, target)));
    }
    if (i.retestable > 0) {
      const target = Math.min(3, i.retestable);
      steps.push(step('retest', `Re-test ${target} of your old mistakes`, 'Find a better move than the one you played. Mistakes come back on a schedule until they stick.', '/train/mistakes', t?.retests ?? 0, target, target * 2));
    }
    if (i.unreviewed) steps.push(step('review', 'Review your latest game', `${i.unreviewed.title}: step through the key moments and retry the mistakes.`, `/analysis/${i.unreviewed.id}?review=1`, t?.gamesReviewed ?? 0, 1, 8));
    if (i.weakness) {
      const lessons = Math.max(0, (t?.lessons ?? 0) - (i.reflectedToday ? 1 : 0));
      steps.push(step('weakness', `Work on: ${i.weakness.label}`, 'Your most costly recurring mistake. This opens the exercise built for it.', weaknessRoute(i.weakness.category), lessons, 1, 5));
    }
    if (i.dateKey) {
      const wRoute = i.weakness ? weaknessRoute(i.weakness.category) : null;
      const pool = VARIETY.filter((v) => v.to !== wRoute);
      const pick = pool[((dayNumber(i.dateKey) % pool.length) + pool.length) % pool.length]!;
      const avail = Math.max(0, (t?.lessons ?? 0) - (i.reflectedToday ? 1 : 0) - (i.weakness ? 1 : 0));
      steps.push(step('variety', `Something different: ${pick.title}`, pick.detail, pick.to, avail, 1, pick.minutes));
    }
    if (i.unreviewed) steps.push(step('reflect', 'Write a short reflection', 'Three questions about that game. It takes a few minutes and it sticks.', `/train/reflect/${i.unreviewed.id}`, i.reflectedToday ? 1 : 0, 1, 3));
  }
  const next = steps.find((s) => !s.complete) ?? null;
  return { steps, minutes: steps.reduce((n, s) => n + s.minutes, 0), doneCount: steps.filter((s) => s.complete).length, complete: steps.length > 0 && !next, next };
}
