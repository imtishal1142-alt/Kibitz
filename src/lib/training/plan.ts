// Today's suggested training, derived only from data the app actually has.
import type { Weakness } from '../analysis/weaknesses';

export interface PlanItem {
  id: string;
  title: string;
  detail: string;
  to: string; // in-app route
  minutes: number;
}

export interface PlanInput {
  weaknesses: Weakness[];
  duePuzzles: number;
  newPuzzles: number;
  puzzlesToday: number;
  dailyGoal: number;
  unanalysedGames: number;
  gamesTotal: number;
  repertoireLines: number;
  deviations: number;
}

export function trainingPlan(i: PlanInput): PlanItem[] {
  const out: PlanItem[] = [];
  if (i.gamesTotal === 0) {
    out.push({ id: 'import', title: 'Bring in some games', detail: 'Import your Chess.com games or paste a PGN. Everything personal here is built from your own games.', to: '/chesscom', minutes: 5 });
    return out;
  }
  if (i.unanalysedGames > 0) out.push({ id: 'analyse', title: `Analyse ${i.unanalysedGames} unanalysed game${i.unanalysedGames === 1 ? '' : 's'}`, detail: 'Analysis finds your mistakes; puzzles, weaknesses and strength estimates all depend on it.', to: '/library', minutes: Math.min(30, 2 * i.unanalysedGames) });
  const left = Math.max(0, i.dailyGoal - i.puzzlesToday);
  if (i.duePuzzles > 0) out.push({ id: 'review', title: `Review ${Math.min(i.duePuzzles, Math.max(left, 5))} due puzzle${i.duePuzzles === 1 ? '' : 's'}`, detail: 'Puzzles you missed come back on a schedule until you solve them reliably.', to: '/puzzles', minutes: 5 });
  else if (i.newPuzzles > 0 && left > 0) out.push({ id: 'new-puzzles', title: `Solve ${Math.min(left, i.newPuzzles)} new puzzle${left === 1 ? '' : 's'} from your games`, detail: `Today's goal is ${i.dailyGoal}; you have done ${i.puzzlesToday}.`, to: '/puzzles', minutes: 8 });
  const top = i.weaknesses.find((w) => w.evidence === 'established') ?? i.weaknesses[0];
  if (top) out.push({ id: `weak-${top.category}`, title: `Work on: ${top.label}`, detail: `${top.count} occurrence${top.count === 1 ? '' : 's'} in ${top.games} games (${top.evidence}). ${top.exercise}`.trim(), to: '/insights', minutes: 10 });
  if (i.deviations > 0 && i.repertoireLines > 0) out.push({ id: 'repertoire', title: 'Repair your repertoire', detail: `You left your own repertoire in ${i.deviations} game${i.deviations === 1 ? '' : 's'}. Drill those lines.`, to: '/openings', minutes: 8 });
  else if (i.repertoireLines === 0 && i.gamesTotal >= 5) out.push({ id: 'repertoire-start', title: 'Build an opening repertoire', detail: 'The Openings trainer can suggest lines from the openings you already play.', to: '/openings', minutes: 8 });
  if (!out.length) out.push({ id: 'play', title: 'Play a game and review it', detail: 'You are up to date. Play a game, then run the post-game review.', to: '/play', minutes: 20 });
  return out;
}
