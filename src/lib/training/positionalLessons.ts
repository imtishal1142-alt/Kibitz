// Positional ideas. Every diagram's claim is checked by the board detector in tests/positionallib.test.ts,
// so the squares highlighted on each diagram really do have the feature the lesson names.
import { positionFeatures } from '../analysis/positional';
import type { SideFeatures } from '../analysis/positional';

export type FeatureKey = 'isolated' | 'doubled' | 'backward' | 'passed' | 'outposts' | 'openFileRooks' | 'bishopPair' | 'badBishops' | 'kingShield' | 'halfOpenFileRooks';

export interface PositionalLesson {
  id: string;
  title: string;
  /** One-line definition. */
  what: string;
  why: string;
  /** What to do about it, for the side that has it and for the side facing it. */
  have: string;
  face: string;
  fen: string;
  /** Side whose feature the diagram shows. */
  side: 'w' | 'b';
  feature: FeatureKey;
  /** Squares to highlight; verified against the detector. */
  squares: string[];
}

export const POSITIONAL: PositionalLesson[] = [
  { id: 'isolated', title: 'Isolated pawn', what: 'A pawn with no friendly pawn on either neighbouring file.', why: 'Nothing can ever defend it with a pawn, so a piece has to guard it for the rest of the game, and the square in front of it is a permanent home for an enemy piece.', have: 'Use the activity it brings: open lines and attacking chances. Trade pieces only when you must, and aim at the enemy king before the endgame.', face: 'Blockade the square in front with a knight, trade pieces and head for an endgame where the pawn is a target.', fen: '4k3/pp3ppp/8/8/3P4/8/PP3PPP/4K3 w - - 0 1', side: 'w', feature: 'isolated', squares: ['d4'] },
  { id: 'doubled', title: 'Doubled pawns', what: 'Two pawns of the same colour on one file.', why: 'They cannot protect each other and the front one is often blocked, so the pair does the work of one pawn.', have: 'Look for compensation: an open file for a rook or the bishop pair. Do not accept them for nothing.', face: 'Attack the weak front pawn and try to fix the pawns where they stand.', fen: '4k3/pp3ppp/8/8/2P5/2P5/PP3PPP/4K3 w - - 0 1', side: 'w', feature: 'doubled', squares: ['c3', 'c4'] },
  { id: 'passed', title: 'Passed pawn', what: 'A pawn with no enemy pawn in front of it on its own or the neighbouring files.', why: 'Nothing but a piece can stop it, so it ties down the opponent and decides many endgames.', have: 'Push it when it is safe, support it with the king in the endgame, and keep a rook behind it.', face: 'Blockade it with a piece in front, ideally a knight, and keep your king close.', fen: '4k3/pp3p2/8/8/8/8/PP3PPP/4K3 w - - 0 1', side: 'w', feature: 'passed', squares: ['h2'] },
  { id: 'backward', title: 'Backward pawn', what: 'A pawn behind its neighbours that cannot safely advance because an enemy pawn controls the square ahead.', why: 'It cannot move without being captured, and it makes the square in front of it a weak square for the opponent.', have: 'Prepare a pawn break that frees it, or protect it with pieces and keep the position closed.', face: 'Put a rook or knight on the square in front, and double rooks on the file.', fen: '4k3/pp3p1p/8/4p3/2P1P3/3P4/PP3PPP/4K3 w - - 0 1', side: 'w', feature: 'backward', squares: ['d3'] },
  { id: 'outpost', title: 'Outpost', what: 'A square in the enemy half that your pawn protects and no enemy pawn can attack.', why: 'A knight there cannot be driven away and eyes the whole area, often worth more than a rook in the same spot.', have: 'Put a knight on it (a bishop also works) and bring more pieces to support it.', face: 'Trade the piece that wants to use the outpost, or change the pawn structure so a pawn can challenge it.', fen: '4k3/6p1/8/8/3N4/2P1P3/8/2B1KB2 w - - 0 1', side: 'w', feature: 'outposts', squares: ['d4'] },
  { id: 'open-file', title: 'Rook on an open file', what: 'A file with no pawns at all, or only enemy pawns (a half-open file).', why: 'Rooks need open lines. A rook on an open file reaches the seventh rank or the enemy back rank and ties the opponent to defence.', have: 'Take the file first, double your rooks on it, and enter on the seventh rank.', face: 'Contest the file with your own rook, or cover the squares where the rook would enter.', fen: '3r2k1/pp3ppp/8/8/8/8/PP3PPP/3R2K1 w - - 0 1', side: 'w', feature: 'openFileRooks', squares: ['d1'] },
  { id: 'bishop-pair', title: 'Bishop pair', what: 'Having both bishops when the opponent does not.', why: 'Two bishops cover both colours of square, and they grow stronger as the board opens up and pawns disappear.', have: 'Open the position with pawn breaks and avoid trading a bishop for a knight without a reason.', face: 'Keep the position closed, and aim to trade one of the bishops or fix pawns on its colour.', fen: '4k3/pp3ppp/8/8/8/2N5/PP3PPP/2B1KB2 w - - 0 1', side: 'w', feature: 'bishopPair', squares: ['c1', 'f1'] },
  { id: 'bad-bishop', title: 'Bad bishop', what: 'A bishop hemmed in by many of your own pawns on its colour of square.', why: 'Its own pawns block it, so it does less than a knight would. The pawns are fixed on one colour and the bishop cannot get past them.', have: 'Trade it for a good piece, or free it by moving pawns, or play it outside the pawn chain.', face: 'Keep the pawns fixed on that colour and trade your own good pieces for the active ones.', fen: '4k3/8/8/8/2P1P3/1P1P1P2/P3B3/4K3 w - - 0 1', side: 'w', feature: 'badBishops', squares: ['e2'] },
];

export function lessonFeatures(l: PositionalLesson): SideFeatures {
  return positionFeatures(l.fen)[l.side];
}

/** Squares the detector reports for a lesson's feature (for tests and highlights). */
export function detectedSquares(l: PositionalLesson): string[] {
  const f = lessonFeatures(l)[l.feature];
  if (Array.isArray(f)) {
    if (l.feature === 'doubled') return [];
    return f;
  }
  return [];
}
