// Positional features of a position, found from the board by plain definitions (stated in the Positional lessons):
// isolated, doubled, backward and passed pawns, outposts, open files, the bishop pair, bad bishops, king cover and space.
// Nothing here is an engine verdict; it describes what is on the board, and the review uses it to say what a move changed.
import { Chess } from 'chess.js';
import type { Color, Square } from 'chess.js';
import { normalizeFen } from '../chess/rules';

export interface SideFeatures {
  isolated: Square[];
  doubled: string[]; // files holding more than one pawn
  backward: Square[];
  passed: Square[];
  outposts: Square[];
  openFileRooks: Square[];
  halfOpenFileRooks: Square[];
  bishopPair: boolean;
  badBishops: Square[];
  /** Pawns directly in front of the king (the king's file and its neighbours, up to two ranks ahead). */
  kingShield: number;
  kingInCentre: boolean;
  /** Minor pieces still on their starting squares. */
  undeveloped: number;
  /** Own pawns on the fourth rank or beyond (counted from that side). */
  advancedPawns: number;
}

export interface PositionFeatures {
  w: SideFeatures;
  b: SideFeatures;
}

const FILES = 'abcdefgh';
const fileIx = (s: string): number => s.charCodeAt(0) - 97;
const rankOf = (s: string): number => Number(s[1]);
/** Rank counted from the side's own back rank (1 = back rank, 8 = promotion rank). */
const rel = (rank: number, c: Color): number => (c === 'w' ? rank : 9 - rank);
const darkSquare = (s: string): boolean => (fileIx(s) + rankOf(s)) % 2 === 0;

export function positionFeatures(fen: string): PositionFeatures {
  const chess = new Chess(normalizeFen(fen));
  const pieces = chess.board().flat().filter((p): p is NonNullable<typeof p> => !!p);
  const pawnsOf = (c: Color) => pieces.filter((p) => p.type === 'p' && p.color === c).map((p) => p.square);
  const pawns = { w: pawnsOf('w'), b: pawnsOf('b') };
  const side = (c: Color): SideFeatures => {
    const foe: Color = c === 'w' ? 'b' : 'w';
    const mine = pawns[c];
    const theirs = pawns[foe];
    const hasOn = (list: string[], f: number): boolean => list.some((s) => fileIx(s) === f);
    const isolated = mine.filter((s) => !hasOn(mine, fileIx(s) - 1) && !hasOn(mine, fileIx(s) + 1));
    const counts = new Map<number, number>();
    for (const s of mine) counts.set(fileIx(s), (counts.get(fileIx(s)) ?? 0) + 1);
    const doubled = [...counts.entries()].filter(([, n]) => n > 1).map(([f]) => FILES[f]!);
    const passed = mine.filter((s) => {
      const r = rel(rankOf(s), c);
      return !theirs.some((t) => Math.abs(fileIx(t) - fileIx(s)) <= 1 && rel(rankOf(t), c) > r);
    });
    const backward = mine.filter((s) => {
      if (isolated.includes(s)) return false;
      const r = rel(rankOf(s), c);
      const supportedLater = mine.some((m) => Math.abs(fileIx(m) - fileIx(s)) === 1 && rel(rankOf(m), c) <= r);
      if (supportedLater) return false;
      // The square in front is controlled by an enemy pawn.
      return theirs.some((t) => Math.abs(fileIx(t) - fileIx(s)) === 1 && rel(rankOf(t), c) === r + 2);
    });
    const outposts = pieces
      .filter((p) => p.color === c && (p.type === 'n' || p.type === 'b'))
      .filter((p) => {
        const r = rel(rankOf(p.square), c);
        if (r < 4 || r > 6) return false;
        const supported = mine.some((m) => Math.abs(fileIx(m) - fileIx(p.square)) === 1 && rel(rankOf(m), c) === r - 1);
        const attackable = theirs.some((t) => Math.abs(fileIx(t) - fileIx(p.square)) === 1 && rel(rankOf(t), c) > r);
        return supported && !attackable;
      })
      .map((p) => p.square);
    const rooks = pieces.filter((p) => p.color === c && p.type === 'r');
    const openFileRooks = rooks.filter((r) => !hasOn(mine, fileIx(r.square)) && !hasOn(theirs, fileIx(r.square))).map((r) => r.square);
    const halfOpenFileRooks = rooks.filter((r) => !hasOn(mine, fileIx(r.square)) && hasOn(theirs, fileIx(r.square))).map((r) => r.square);
    const bishops = pieces.filter((p) => p.color === c && p.type === 'b');
    const foeBishops = pieces.filter((p) => p.color === foe && p.type === 'b').length;
    const badBishops = bishops
      .filter((b) => mine.filter((m) => darkSquare(m) === darkSquare(b.square)).length >= 5)
      .map((b) => b.square);
    const king = pieces.find((p) => p.color === c && p.type === 'k')!;
    const kr = rel(rankOf(king.square), c);
    const kingShield = mine.filter((m) => Math.abs(fileIx(m) - fileIx(king.square)) <= 1 && rel(rankOf(m), c) > kr && rel(rankOf(m), c) <= kr + 2).length;
    const queensOn = pieces.some((p) => p.type === 'q');
    const kingInCentre = queensOn && kr <= 2 && ['d', 'e'].includes(king.square[0]!) && pieces.filter((p) => p.color === c && p.type !== 'p' && p.type !== 'k').length >= 4;
    const home = c === 'w' ? ['b1', 'g1', 'c1', 'f1'] : ['b8', 'g8', 'c8', 'f8'];
    const undeveloped = pieces.filter((p) => p.color === c && (p.type === 'n' || p.type === 'b') && home.includes(p.square)).length;
    return {
      isolated,
      doubled,
      backward,
      passed,
      outposts,
      openFileRooks,
      halfOpenFileRooks,
      bishopPair: bishops.length >= 2 && foeBishops < 2,
      badBishops,
      kingShield,
      kingInCentre,
      undeveloped,
      advancedPawns: mine.filter((s) => rel(rankOf(s), c) >= 4).length,
    };
  };
  return { w: side('w'), b: side('b') };
}

const sq = (list: string[]): string => list.join(', ');

/**
 * What a move changed positionally, from `mover`'s point of view, comparing the position after the move played with the
 * position after the engine's choice. Returns the clearest differences first (at most three), each a plain sentence.
 */
export function positionalDifference(fenPlayed: string, fenBest: string, mover: Color): string[] {
  let p: PositionFeatures;
  let b: PositionFeatures;
  try {
    p = positionFeatures(fenPlayed);
    b = positionFeatures(fenBest);
  } catch {
    return [];
  }
  const foe: Color = mover === 'w' ? 'b' : 'w';
  const me = { p: p[mover], b: b[mover] };
  const them = { p: p[foe], b: b[foe] };
  const out: string[] = [];
  if (me.b.bishopPair && !me.p.bishopPair) out.push('gives up the bishop pair');
  if (them.b.bishopPair === false && them.p.bishopPair) out.push('hands the opponent the bishop pair');
  if (me.p.doubled.length > me.b.doubled.length) out.push(`doubles your pawns on the ${sq(me.p.doubled.filter((f) => !me.b.doubled.includes(f)))} file`);
  const newIso = me.p.isolated.filter((s) => !me.b.isolated.includes(s));
  if (newIso.length) out.push(`leaves an isolated pawn on ${sq(newIso)}`);
  const newBack = me.p.backward.filter((s) => !me.b.backward.includes(s));
  if (newBack.length) out.push(`leaves a backward pawn on ${sq(newBack)}`);
  const lostOut = me.b.outposts.filter((s) => !me.p.outposts.includes(s));
  if (lostOut.length) out.push(`misses a strong outpost for a piece on ${sq(lostOut)}`);
  const foeOut = them.p.outposts.filter((s) => !them.b.outposts.includes(s));
  if (foeOut.length) out.push(`lets the opponent plant a piece on ${sq(foeOut)}, where no pawn can chase it away`);
  const foePassed = them.p.passed.filter((s) => !them.b.passed.includes(s));
  if (foePassed.length) out.push(`creates a passed pawn for the opponent on ${sq(foePassed)}`);
  const myPassedLost = me.b.passed.filter((s) => !me.p.passed.includes(s));
  if (myPassedLost.length && !out.length) out.push('gives up your chance of a passed pawn');
  if (me.p.kingShield < me.b.kingShield) out.push('weakens the pawns in front of your king');
  if (me.b.kingInCentre === false && me.p.kingInCentre) out.push('leaves your king in the centre');
  if (me.b.openFileRooks.length + me.b.halfOpenFileRooks.length > me.p.openFileRooks.length + me.p.halfOpenFileRooks.length) out.push('keeps a rook off an open file that the better move would use');
  if (me.p.undeveloped > me.b.undeveloped) out.push('leaves more pieces undeveloped');
  if (me.b.advancedPawns > me.p.advancedPawns + 0) out.push('gives up space');
  return out.slice(0, 3);
}
