// Board-level facts, verified geometrically with chess.js. The coaching text only ever states
// things that this module (or the engine) has actually confirmed on the board.
import { Chess } from 'chess.js';
import type { PieceSymbol, Square } from 'chess.js';
import type { Color } from '../types';
import { normalizeFen } from '../chess/rules';

export const VAL: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const PIECE_NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

export interface Located {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export function piecesOf(chess: Chess, color?: Color): Located[] {
  const out: Located[] = [];
  for (const row of chess.board()) for (const p of row) if (p && (!color || p.color === color)) out.push({ square: p.square, type: p.type, color: p.color });
  return out;
}

export interface EnPrise {
  square: Square;
  type: PieceSymbol;
  color: Color;
  reason: 'undefended' | 'cheaper-attacker';
}

/** Pieces of `color` that can be captured profitably in one move (static check, no exchange sequences). */
export function enPrise(chess: Chess, color: Color): EnPrise[] {
  const out: EnPrise[] = [];
  const foe = other(color);
  for (const p of piecesOf(chess, color)) {
    if (p.type === 'k') continue;
    const attackers = chess.attackers(p.square, foe);
    if (!attackers.length) continue;
    const defenders = chess.attackers(p.square, color);
    const cheapest = Math.min(...attackers.map((s) => VAL[chess.get(s)!.type]));
    if (!defenders.length) out.push({ ...p, reason: 'undefended' });
    else if (cheapest < VAL[p.type]) out.push({ ...p, reason: 'cheaper-attacker' });
  }
  return out;
}

export interface MoveFacts {
  san: string;
  uci: string;
  color: Color;
  piece: PieceSymbol;
  from: Square;
  to: Square;
  capture?: { piece: PieceSymbol; square: Square; defended: boolean; gain: number };
  check: boolean;
  mate: boolean;
  promotion?: PieceSymbol;
  castle?: 'k' | 'q';
  attacks: { square: Square; piece: PieceSymbol; defended: boolean }[];
  fork?: { square: Square; piece: PieceSymbol }[];
  pins: { pinned: { square: Square; piece: PieceSymbol }; behind: { square: Square; piece: PieceSymbol } }[];
  skewers: { front: { square: Square; piece: PieceSymbol }; behind: { square: Square; piece: PieceSymbol } }[];
  discovered: { target: Square; piece: PieceSymbol; by: Square }[];
  newlyHanging: EnPrise[]; // own pieces left en prise by this move that were not before
  hangingBefore: EnPrise[]; // own pieces that were already en prise before this move
  rescued: EnPrise[]; // own pieces that were en prise before and are safe now
  movedPieceUnsafe: boolean;
  develops: boolean;
  centralizes: boolean;
  backRankMate: boolean;
}

const DIRS: Record<'r' | 'b', [number, number][]> = {
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
};

function sq(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${'abcdefgh'[file]}${rank + 1}` as Square;
}

function rayPieces(chess: Chess, from: Square, df: number, dr: number): { square: Square; type: PieceSymbol; color: Color }[] {
  const out: { square: Square; type: PieceSymbol; color: Color }[] = [];
  let f = from.charCodeAt(0) - 97;
  let r = Number(from[1]) - 1;
  for (;;) {
    f += df;
    r += dr;
    const s = sq(f, r);
    if (!s) break;
    const p = chess.get(s);
    if (p) {
      out.push({ square: s, type: p.type, color: p.color });
      if (out.length === 2) break;
    }
  }
  return out;
}

function backRankMateCheck(after: Chess, matedColor: Color): boolean {
  const king = piecesOf(after, matedColor).find((p) => p.type === 'k');
  if (!king) return false;
  const backRank = matedColor === 'w' ? '1' : '8';
  if (king.square[1] !== backRank) return false;
  const forward = matedColor === 'w' ? 1 : -1;
  const f = king.square.charCodeAt(0) - 97;
  const r = Number(king.square[1]) - 1;
  // All forward squares must be blocked by the king's own pieces.
  for (const df of [-1, 0, 1]) {
    const s = sq(f + df, r + forward);
    if (!s) continue;
    const p = after.get(s);
    if (!p || p.color !== matedColor) return false;
  }
  return true;
}

export function describeMove(fen: string, uci: string): MoveFacts | null {
  let before: Chess;
  let after: Chess;
  let mv;
  try {
    before = new Chess(normalizeFen(fen));
    after = new Chess(normalizeFen(fen));
    mv = after.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4, 5) : undefined });
  } catch {
    return null;
  }
  const color = mv.color;
  const foe = other(color);
  const to = mv.to;
  const movedType = mv.promotion ?? mv.piece;
  const facts: MoveFacts = {
    san: mv.san,
    uci,
    color,
    piece: mv.piece,
    from: mv.from,
    to,
    check: after.inCheck(),
    mate: after.isCheckmate(),
    promotion: mv.promotion,
    attacks: [],
    pins: [],
    skewers: [],
    discovered: [],
    newlyHanging: [],
    hangingBefore: [],
    rescued: [],
    movedPieceUnsafe: false,
    develops: false,
    centralizes: false,
    backRankMate: false,
  };
  if (mv.isKingsideCastle()) facts.castle = 'k';
  if (mv.isQueensideCastle()) facts.castle = 'q';

  if (mv.captured) {
    const capSq = mv.isEnPassant() ? (`${to[0]}${mv.from[1]}` as Square) : to;
    const defended = after.attackers(to, foe).length > 0;
    facts.capture = { piece: mv.captured, square: capSq, defended, gain: VAL[mv.captured] - (defended ? VAL[movedType] : 0) };
  }

  // Enemy pieces attacked by the moved piece.
  for (const p of piecesOf(after, foe)) {
    if (after.attackers(p.square, color).includes(to)) {
      facts.attacks.push({ square: p.square, piece: p.type, defended: after.attackers(p.square, foe).length > 0 });
    }
  }
  const winnable = facts.attacks.filter((a) => a.piece === 'k' || (VAL[a.piece] >= 3 && (VAL[a.piece] > VAL[movedType] || !a.defended)));
  if (winnable.length >= 2) facts.fork = winnable.map((w) => ({ square: w.square, piece: w.piece }));

  // Pins and skewers created by a sliding piece.
  const kinds: ('r' | 'b')[] = movedType === 'q' ? ['r', 'b'] : movedType === 'r' ? ['r'] : movedType === 'b' ? ['b'] : [];
  for (const k of kinds) {
    for (const [df, dr] of DIRS[k]) {
      const [a, b] = rayPieces(after, to, df, dr);
      if (!a || !b || a.color !== foe || b.color !== foe) continue;
      if (a.type !== 'k' && (b.type === 'k' || VAL[b.type] > VAL[a.type])) {
        facts.pins.push({ pinned: { square: a.square, piece: a.type }, behind: { square: b.square, piece: b.type } });
      } else if (a.type === 'k' || VAL[a.type] > VAL[b.type]) {
        facts.skewers.push({ front: { square: a.square, piece: a.type }, behind: { square: b.square, piece: b.type } });
      }
    }
  }

  // Discovered attacks: a different piece now attacks an important enemy piece.
  for (const p of piecesOf(after, foe)) {
    if (p.type !== 'k' && VAL[p.type] < 3) continue;
    const prev = new Set(before.attackers(p.square, color));
    const added = after.attackers(p.square, color).filter((s) => s !== to && !prev.has(s));
    if (added.length) facts.discovered.push({ target: p.square, piece: p.type, by: added[0]! });
  }

  // Safety of own pieces.
  const hangBefore = enPrise(before, color);
  const hangAfter = enPrise(after, color);
  const key = (e: EnPrise) => e.square;
  const beforeSet = new Set(hangBefore.map(key));
  const afterSet = new Set(hangAfter.map(key));
  facts.hangingBefore = hangBefore;
  facts.newlyHanging = hangAfter.filter((e) => !beforeSet.has(e.square) || e.square === to);
  facts.rescued = hangBefore.filter((e) => e.square !== mv.from && !afterSet.has(e.square));
  facts.movedPieceUnsafe = hangAfter.some((e) => e.square === to);

  // Development / centralisation.
  const backRank = color === 'w' ? '1' : '8';
  facts.develops = (mv.piece === 'n' || mv.piece === 'b') && mv.from[1] === backRank && to[1] !== backRank;
  facts.centralizes = (mv.piece === 'p' || mv.piece === 'n') && ['d4', 'e4', 'd5', 'e5'].includes(to);
  facts.backRankMate = facts.mate && backRankMateCheck(after, foe);
  return facts;
}

export function pawnStructure(fen: string, color: Color): { doubled: number; isolated: number } {
  const files = new Array<number>(8).fill(0);
  const ch = color === 'w' ? 'P' : 'p';
  const rows = (fen.split(' ')[0] ?? '').split('/');
  for (const row of rows) {
    let f = 0;
    for (const c of row) {
      if (/\d/.test(c)) f += Number(c);
      else {
        if (c === ch) files[f]!++;
        f++;
      }
    }
  }
  let doubled = 0;
  let isolated = 0;
  for (let f = 0; f < 8; f++) {
    const n = files[f]!;
    if (n > 1) doubled += n - 1;
    if (n > 0 && !(files[f - 1] ?? 0) && !(files[f + 1] ?? 0)) isolated += n;
  }
  return { doubled, isolated };
}

export function fileOf(s: Square): string {
  return s[0]!;
}

/** Plain-English list of what a move does, only from verified facts. */
export function whatItDoes(f: MoveFacts): string[] {
  const out: string[] = [];
  const nm = (p: PieceSymbol) => PIECE_NAME[p];
  if (f.mate) out.push(f.backRankMate ? 'delivers checkmate on the back rank' : 'delivers checkmate');
  else if (f.check) out.push('gives check');
  if (f.castle) out.push(`castles ${f.castle === 'k' ? 'kingside' : 'queenside'}, tucking the king away and connecting the rooks`);
  if (f.capture) {
    out.push(
      f.capture.defended
        ? `captures the ${nm(f.capture.piece)} on ${f.capture.square} (it can be recaptured)`
        : `captures the undefended ${nm(f.capture.piece)} on ${f.capture.square}`,
    );
  }
  if (f.promotion) out.push(`promotes to a ${nm(f.promotion)}`);
  if (f.fork) out.push(`forks the ${f.fork.map((x) => `${nm(x.piece)} on ${x.square}`).join(' and the ')}`);
  for (const p of f.pins.slice(0, 1)) out.push(`pins the ${nm(p.pinned.piece)} on ${p.pinned.square} to the ${nm(p.behind.piece)} on ${p.behind.square}`);
  for (const s of f.skewers.slice(0, 1)) out.push(`skewers the ${nm(s.front.piece)} on ${s.front.square}, exposing the ${nm(s.behind.piece)} on ${s.behind.square}`);
  for (const d of f.discovered.slice(0, 1)) out.push(`uncovers an attack on the ${nm(d.piece)} on ${d.target}`);
  if (f.rescued.length) out.push(`saves the ${nm(f.rescued[0]!.type)} on ${f.rescued[0]!.square} from capture`);
  if (!f.fork && !f.mate) {
    const loose = f.attacks.filter((a) => !a.defended && a.piece !== 'k');
    if (loose.length) out.push(`attacks the undefended ${nm(loose[0]!.piece)} on ${loose[0]!.square}`);
    else if (f.attacks.length && !f.capture && !f.check) out.push(`attacks the ${nm(f.attacks[0]!.piece)} on ${f.attacks[0]!.square}`);
  }
  if (f.develops) out.push(`develops the ${nm(f.piece)}`);
  if (f.centralizes) out.push(`puts a ${nm(f.piece)} on the central square ${f.to}`);
  return out;
}
