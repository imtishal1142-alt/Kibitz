// Endgame Lab: classic theoretical endgames to practise against the engine.
//
// Every position's claim ("White wins", "Black can hold the draw") is checked against the real
// engine in tests/library.test.ts (depth 22). Stockfish is not a tablebase, so the claims are
// engine-verified rather than proven; the positions are small enough that this is reliable, but
// the app says so wherever it grades you.
import type { Color } from '../types';

export interface EndgameLesson {
  id: string;
  title: string;
  group: 'Basic mates' | 'King and pawn' | 'Rook endgames';
  fen: string;
  /** The side the learner plays. */
  user: Color;
  /** What the learner is trying to achieve. */
  goal: 'win' | 'draw';
  summary: string;
  idea: string;
  /** Plain-English reminder of what to look for, shown on request. */
  hint: string;
  level: 1 | 2 | 3;
}

export const ENDGAMES: EndgameLesson[] = [
  {
    id: 'kq-k',
    title: 'Queen and king against king',
    group: 'Basic mates',
    fen: '7Q/8/8/8/4k3/8/8/4K3 w - - 0 1',
    user: 'w',
    goal: 'win',
    summary: 'Checkmate with a queen. The engine defends as well as it can.',
    idea: 'Use the queen to shrink the box the enemy king lives in, a knight\'s move away from it, and only bring your own king up once the box is small. Avoid stalemate: always leave the enemy king a move or give check.',
    hint: 'Keep the queen a knight\'s move from the king. Do not give the king a stalemate square.',
    level: 1,
  },
  {
    id: 'kr-k',
    title: 'Rook and king against king',
    group: 'Basic mates',
    fen: '8/8/8/8/4k3/8/8/R3K3 w - - 0 1',
    user: 'w',
    goal: 'win',
    summary: 'The "box" method: push the king to the edge with the rook and your king together.',
    idea: 'The rook cuts the king off along a rank or file; your king walks up to take the opposition; the rook then gives the final check on the edge. Never leave the rook where the king can attack it for free.',
    hint: 'Cut the king off with the rook, then bring your own king to the same file and take the opposition.',
    level: 1,
  },
  {
    id: 'kpk-sixth',
    title: 'King in front of the pawn',
    group: 'King and pawn',
    fen: '3k4/8/3K4/3P4/8/8/8/8 w - - 0 1',
    user: 'w',
    goal: 'win',
    summary: 'Your king stands on the sixth rank in front of its pawn. Only some moves keep the win.',
    idea: 'With the king on the sixth rank in front of the pawn, White wins whoever is to move, as long as White does not step aside onto the wrong square. Moving to the side (Ke6 or Kc6) keeps the winning key squares; retreating or going to c5 lets the defender hold.',
    hint: 'Stay on the sixth rank and keep the pawn behind your king.',
    level: 2,
  },
  {
    id: 'kpk-key-square',
    title: 'Win with the opposition',
    group: 'King and pawn',
    fen: '8/8/3k4/8/3K4/3P4/8/8 b - - 0 1',
    user: 'w',
    goal: 'win',
    summary: 'Black has to move and your king holds the opposition. Convert it.',
    idea: 'When the kings face each other with one square between them and it is the defender\'s turn, the defender must give way. Take the key squares in front of the pawn, then push.',
    hint: 'Keep the king in front of the pawn and win the opposition again whenever it is lost.',
    level: 2,
  },
  {
    id: 'kpk-hold-f-pawn',
    title: 'Hold the draw against a pawn',
    group: 'King and pawn',
    fen: '8/5k2/8/5PK1/8/8/8/8 b - - 0 1',
    user: 'b',
    goal: 'draw',
    summary: 'You are Black. There is exactly one safe move; every other king move loses.',
    idea: 'Defend by keeping your king in front of the pawn and taking the opposition. Here that means going to the file of the pawn\'s promotion path, not stepping away from it.',
    hint: 'Keep the king directly in front of the pawn.',
    level: 2,
  },
  {
    id: 'kpk-hold-d-pawn',
    title: 'Hold the draw: the only move',
    group: 'King and pawn',
    fen: '8/3k4/8/3PK3/8/8/8/8 b - - 0 1',
    user: 'b',
    goal: 'draw',
    summary: 'You are Black and White has the better king. One move holds; find it.',
    idea: 'The defender\'s king must stay in front of the pawn and in opposition to the attacking king. Moving to the wrong side lets White reach the key squares.',
    hint: 'Stay directly in front of the pawn.',
    level: 2,
  },
  {
    id: 'rook-pawn-draw',
    title: 'The rook-pawn draw',
    group: 'King and pawn',
    fen: '7k/8/7K/7P/8/8/8/8 b - - 0 1',
    user: 'b',
    goal: 'draw',
    summary: 'A pawn on the edge file cannot win if the defender\'s king reaches the corner.',
    idea: 'A rook pawn has no room to get around the defender: with your king on g8 or h8 the attacker can never force it out, and a careless pawn push gives stalemate.',
    hint: 'Stay on g8 and h8. Do not wander away from the corner.',
    level: 1,
  },
  {
    id: 'lucena',
    title: 'The Lucena position',
    group: 'Rook endgames',
    fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    user: 'w',
    goal: 'win',
    summary: 'The most important winning rook endgame: build a "bridge" to shelter your king from checks.',
    idea: 'The pawn is on the seventh and your king is in front of it but cannot leave because of rook checks. Play Rd1, then bring the rook to the fourth rank and use it as a shield for the king to step out.',
    hint: 'First cut the enemy king off, then build a bridge on the fourth rank.',
    level: 3,
  },
  {
    id: 'philidor',
    title: 'The Philidor defence',
    group: 'Rook endgames',
    fen: '4k3/8/r7/3PK3/8/8/8/7R b - - 0 1',
    user: 'b',
    goal: 'draw',
    summary: 'The classic way to draw a rook ending a pawn down: keep the rook on the third rank.',
    idea: 'Hold the rook on your sixth rank (the "third rank" from the defender\'s side) so the enemy king cannot advance. Once the pawn pushes to the sixth, switch the rook to the back to check from behind.',
    hint: 'Keep your rook on the rank in front of the pawn until the pawn moves.',
    level: 3,
  },
];

export function endgameById(id: string): EndgameLesson | undefined {
  return ENDGAMES.find((e) => e.id === id);
}
