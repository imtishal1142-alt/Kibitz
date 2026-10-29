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
    if (i.unreviewed) steps.push(step('reflect', 'Write a short reflection', 'Three questions about that game. It takes a few minutes and it sticks.', `/train/reflect/${i.unreviewed.id}`, i.reflectedToday ? 1 : 0, 1, 3));
  }
  const next = steps.find((s) => !s.complete) ?? null;
  return { steps, minutes: steps.reduce((n, s) => n + s.minutes, 0), doneCount: steps.filter((s) => s.complete).length, complete: steps.length > 0 && !next, next };
}
