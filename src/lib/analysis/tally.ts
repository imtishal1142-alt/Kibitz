// How many moves of each grade you have played across your analysed games, and where the brilliant ones are.
import { CLASS_ORDER } from '../chess/classify';
import type { GameRecord, MoveClass, GameAnalysis } from '../types';
import { emptyCounts } from './gameAnalysis';
import { moveLabel } from './explain';

export interface GradeMove {
  gameId: string;
  ply: number;
  label: string;
  san: string;
  opponent?: string;
  date: string;
  dateLabel?: string;
  endTime: number;
  /** Win chance after the move, for the mover, in percent. */
  winAfter: number;
}

export interface GradeTally {
  games: number;
  moves: number;
  counts: Record<MoveClass, number>;
  /** Every brilliant move you played, newest game first. */
  brilliant: GradeMove[];
}

/** Only your own moves in games where the app knows which side you were. Demo games are the caller's business. */
export function gradeTally(entries: { game: GameRecord; analysis: GameAnalysis }[]): GradeTally {
  const counts = emptyCounts();
  const brilliant: GradeMove[] = [];
  let games = 0;
  let moves = 0;
  for (const { game, analysis } of entries) {
    const color = game.userColor;
    if (!color) continue;
    games++;
    for (const m of analysis.moves) {
      if (m.color !== color) continue;
      moves++;
      counts[m.cls]++;
      if (m.cls === 'brilliant') {
        brilliant.push({ gameId: game.id, ply: m.ply, label: moveLabel(m), san: m.san, opponent: game.opponent, date: game.date, dateLabel: game.dateLabel, endTime: game.endTime, winAfter: m.winAfter });
      }
    }
  }
  brilliant.sort((a, b) => b.endTime - a.endTime || a.ply - b.ply);
  return { games, moves, counts, brilliant };
}

export const TALLY_ORDER: MoveClass[] = [...CLASS_ORDER, 'forced'];
