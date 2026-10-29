import { isLesson } from '../chess/classify';
import type { Color, GameAnalysis, MoveAnalysis } from '../types';

/** Moves the guided review stops at, in game order: for your side the ones to learn from and the ones to be proud of. */
export function reviewSteps(analysis: GameAnalysis, userColor?: Color): number[] {
  const worth = (m: MoveAnalysis) => isLesson(m.cls) || m.cls === 'brilliant' || m.cls === 'great';
  return analysis.moves.filter((m) => (userColor ? m.color === userColor : true) && worth(m)).map((m) => m.ply);
}
