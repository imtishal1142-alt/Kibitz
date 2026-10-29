// Thin, well-tested layer over chess.js: PGN/FEN parsing, move conversion and helpers.
// All other modules use these helpers instead of talking to chess.js directly where
// validation matters (engine lines, puzzle solutions, imported games).
import { Chess, DEFAULT_POSITION, validateFen as cjsValidateFen } from 'chess.js';
import type { Move } from 'chess.js';
import type { Color, GameResult, TimeClass } from '../types';

export const START_FEN = DEFAULT_POSITION;

export class PgnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PgnError';
  }
}

export interface ParsedMove {
  ply: number; // 1-based
  color: Color;
  san: string;
  uci: string;
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
  fenBefore: string;
  fenAfter: string;
  clockMs?: number;
}

export interface ParsedGame {
  headers: Record<string, string>;
  startFen: string;
  moves: ParsedMove[];
  fens: string[]; // length = moves.length + 1
  result: GameResult;
}

export const uciOf = (m: Pick<Move, 'from' | 'to' | 'promotion'>): string => `${m.from}${m.to}${m.promotion ?? ''}`;

export function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

export function fullmoveNumber(fen: string): number {
  return Number(fen.split(' ')[5] ?? '1') || 1;
}

/** First four FEN fields: identifies a position independent of move counters. */
export function fenKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/**
 * Material that cannot arise in a real game (checked per side): more than eight pawns, more than
 * sixteen pieces, or more promoted pieces than missing pawns. Stockfish aborts on some of these
 * (verified with the bundled build: an extra third knight next to eight pawns kills the process).
 */
function impossibleMaterial(chess: Chess): string | null {
  for (const color of ['w', 'b'] as const) {
    const n = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
    for (const row of chess.board()) for (const sq of row) if (sq && sq.color === color) n[sq.type]++;
    const name = color === 'w' ? 'White' : 'Black';
    const total = n.p + n.n + n.b + n.r + n.q + n.k;
    if (n.p > 8) return `${name} has ${n.p} pawns; at most 8 are possible.`;
    if (total > 16) return `${name} has ${total} pieces; at most 16 are possible.`;
    const promoted = Math.max(0, n.q - 1) + Math.max(0, n.r - 2) + Math.max(0, n.b - 2) + Math.max(0, n.n - 2);
    if (promoted > 8 - n.p) return `${name} has more extra pieces (${promoted}) than missing pawns (${8 - n.p}); that cannot happen in a real game.`;
  }
  return null;
}

/**
 * chess.js accepts some positions that cannot arise in a real game and that make Stockfish abort
 * (the engine process exits). The most important one: the side NOT to move is in check, which
 * also covers adjacent kings. Returns a human-readable problem, or null if the position is sound.
 */
export function findIllegality(fen: string): string | null {
  const parts = normalizeFen(fen).split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  try {
    const flipped = new Chess(parts.join(' '));
    const material = impossibleMaterial(flipped);
    if (material) return material;
    if (flipped.inCheck()) {
      return `The ${parts[1] === 'w' ? 'White' : 'Black'} king is in check although it is not ${parts[1] === 'w' ? 'White' : 'Black'}'s turn to move (or the kings touch). Fix the side to move or the piece placement.`;
    }
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid position.';
  }
  return null;
}

export function validateFen(fen: string): { ok: boolean; error?: string } {
  const trimmed = fen.trim().replace(/\s+/g, ' ');
  if (!trimmed) return { ok: false, error: 'The FEN is empty.' };
  const fields = trimmed.split(' ');
  if (fields.length < 4) return { ok: false, error: 'A FEN needs at least four fields: pieces, side to move, castling, en passant.' };
  const full = fields.length >= 6 ? trimmed : `${fields.slice(0, 4).join(' ')} ${fields[4] ?? '0'} ${fields[5] ?? '1'}`;
  const res = cjsValidateFen(full);
  if (!res.ok) return { ok: false, error: res.error };
  try {
    new Chess(full);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid position.' };
  }
  const problem = findIllegality(full);
  if (problem) return { ok: false, error: problem };
  return { ok: true };
}

export function normalizeFen(fen: string): string {
  const f = fen.trim().replace(/\s+/g, ' ').split(' ');
  return `${f.slice(0, 4).join(' ')} ${f[4] ?? '0'} ${f[5] ?? '1'}`;
}

/** Extract `[%clk h:mm:ss(.d)]` values in move order. Handles variations and NAGs. */
export function extractClocks(pgn: string): (number | undefined)[] {
  const movetext = pgn.replace(/^\s*\[[^\]]*\]\s*$/gm, ' ');
  const out: (number | undefined)[] = [];
  let depth = 0;
  let i = 0;
  let awaiting = false;
  while (i < movetext.length) {
    const ch = movetext[i]!;
    if (ch === '{') {
      const end = movetext.indexOf('}', i);
      const body = movetext.slice(i + 1, end === -1 ? movetext.length : end);
      if (depth === 0 && awaiting) {
        const m = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/.exec(body);
        if (m) out[out.length - 1] = (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000;
        awaiting = false;
      }
      i = end === -1 ? movetext.length : end + 1;
    } else if (ch === ';') {
      const end = movetext.indexOf('\n', i);
      i = end === -1 ? movetext.length : end + 1;
    } else if (ch === '(') {
      depth++;
      i++;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
      i++;
    } else if (/\s/.test(ch)) {
      i++;
    } else {
      let j = i;
      while (j < movetext.length && !/[\s{}();]/.test(movetext[j]!)) j++;
      const tok = movetext.slice(i, j);
      i = j;
      if (depth > 0) continue;
      if (/^\d+\.+$/.test(tok) || /^\$\d+$/.test(tok) || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) continue;
      const stripped = tok.replace(/^\d+\.+/, '');
      if (!stripped) continue;
      out.push(undefined);
      awaiting = true;
    }
  }
  return out;
}

export function parsePgn(pgn: string): ParsedGame {
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch (e) {
    throw new PgnError(e instanceof Error ? e.message : 'Could not parse the PGN.');
  }
  const headers = { ...chess.getHeaders() } as Record<string, string>;
  const verbose = chess.history({ verbose: true });
  const clocks = extractClocks(pgn);
  const startFen = headers['FEN'] && headers['SetUp'] !== '0' ? normalizeFen(headers['FEN']) : START_FEN;
  const moves: ParsedMove[] = verbose.map((m, i) => ({
    ply: i + 1,
    color: m.color,
    san: m.san,
    uci: uciOf(m),
    from: m.from,
    to: m.to,
    piece: m.piece,
    captured: m.captured,
    promotion: m.promotion,
    fenBefore: m.before,
    fenAfter: m.after,
    clockMs: clocks.length === verbose.length ? clocks[i] : undefined,
  }));
  const fens = [startFen, ...moves.map((m) => m.fenAfter)];
  if (moves.length) fens[0] = moves[0]!.fenBefore;
  const raw = (headers['Result'] ?? '*').trim();
  let result: GameResult = raw === '1-0' || raw === '0-1' || raw === '1/2-1/2' ? raw : '*';
  if (result === '*' && moves.length) {
    const end = new Chess(fens[fens.length - 1]);
    if (end.isCheckmate()) result = end.turn() === 'w' ? '0-1' : '1-0';
    else if (end.isStalemate() || end.isInsufficientMaterial()) result = '1/2-1/2';
  }
  return { headers, startFen: fens[0] ?? startFen, moves, fens, result };
}

/** Split a PGN database / export into individual game strings. */
export function splitPgn(text: string): string[] {
  const norm = text.replace(/\r\n?/g, '\n').trim();
  if (!norm) return [];
  const parts = norm.split(/\n\s*\n(?=\[(?:Event|White|Site|Date)\s)/);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0 && /[a-hKQRBNO]/.test(p));
}

export interface LineCheck {
  valid: boolean;
  sans: string[];
  ucis: string[];
  fens: string[]; // fens[i] is the position BEFORE sans[i]; last element = final position
  error?: string;
}

/** Convert a UCI line to SAN while checking legality. Stops at the first illegal move. */
export function uciLineToSan(fen: string, ucis: string[], maxPlies = 64): LineCheck {
  let chess: Chess;
  try {
    chess = new Chess(normalizeFen(fen));
  } catch (e) {
    return { valid: false, sans: [], ucis: [], fens: [], error: e instanceof Error ? e.message : 'bad fen' };
  }
  const sans: string[] = [];
  const done: string[] = [];
  const fens: string[] = [chess.fen()];
  for (const u of ucis.slice(0, maxPlies)) {
    const from = u.slice(0, 2);
    const to = u.slice(2, 4);
    const promotion = u.length > 4 ? u.slice(4, 5) : undefined;
    try {
      const m = chess.move({ from, to, promotion });
      sans.push(m.san);
      done.push(u);
      fens.push(chess.fen());
    } catch {
      return { valid: false, sans, ucis: done, fens, error: `Illegal move ${u} in line` };
    }
  }
  return { valid: true, sans, ucis: done, fens };
}

export function isLegalUci(fen: string, uci: string): boolean {
  try {
    const chess = new Chess(normalizeFen(fen));
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci.slice(4, 5) : undefined });
    return true;
  } catch {
    return false;
  }
}

export function uciToSan(fen: string, uci: string): string | null {
  const r = uciLineToSan(fen, [uci], 1);
  return r.valid ? (r.sans[0] ?? null) : null;
}

/** Accepts SAN or UCI; returns both forms and the resulting FEN, or null if illegal. */
export function resolveMove(fen: string, move: string): { san: string; uci: string; fenAfter: string; captured?: string; piece: string } | null {
  try {
    const chess = new Chess(normalizeFen(fen));
    let m: Move;
    if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) {
      m = chess.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move.slice(4, 5) || undefined });
    } else {
      m = chess.move(move);
    }
    return { san: m.san, uci: uciOf(m), fenAfter: chess.fen(), captured: m.captured, piece: m.piece };
  } catch {
    return null;
  }
}

export function legalMoves(fen: string): Move[] {
  return new Chess(normalizeFen(fen)).moves({ verbose: true });
}

export type Terminal = { over: false } | { over: true; kind: 'checkmate' | 'stalemate' | 'insufficient'; winner?: Color };

export function terminalState(fen: string): Terminal {
  const c = new Chess(normalizeFen(fen));
  if (c.isCheckmate()) return { over: true, kind: 'checkmate', winner: c.turn() === 'w' ? 'b' : 'w' };
  if (c.isStalemate()) return { over: true, kind: 'stalemate' };
  if (c.isInsufficientMaterial()) return { over: true, kind: 'insufficient' };
  return { over: false };
}

export const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export function materialCount(fen: string): { w: number; b: number; diff: number; nonPawn: number } {
  const placement = fen.split(' ')[0] ?? '';
  let w = 0;
  let b = 0;
  let nonPawn = 0;
  for (const ch of placement) {
    const v = PIECE_VALUE[ch.toLowerCase()];
    if (v === undefined) continue;
    if (ch === ch.toUpperCase()) w += v;
    else b += v;
    if (v > 1) nonPawn += v;
  }
  return { w, b, diff: w - b, nonPawn };
}

export type Phase = 'opening' | 'middlegame' | 'endgame';

/**
 * Phase heuristic (documented): endgame when the non-pawn material of BOTH sides together is
 * at most 24 points (e.g. R+R+minor vs R); opening during the first 10 full moves while most
 * material is still on the board; otherwise middlegame.
 */
export function phaseOf(fen: string): Phase {
  const { nonPawn } = materialCount(fen);
  if (nonPawn <= 24) return 'endgame';
  if (fullmoveNumber(fen) <= 10 && nonPawn >= 46) return 'opening';
  return 'middlegame';
}

/** Parse "600+5", "300", "1/86400" into base seconds and increment. */
export function parseTimeControl(tc?: string): { base: number; inc: number; daily?: boolean } | null {
  if (!tc || tc === '-' || tc === '?') return null;
  const daily = /^1\/(\d+)/.exec(tc);
  if (daily) return { base: Number(daily[1]), inc: 0, daily: true };
  const m = /^(\d+)(?:\+(\d+))?/.exec(tc);
  if (!m) return null;
  return { base: Number(m[1]), inc: Number(m[2] ?? 0) };
}

export function timeClassOf(tc?: string): TimeClass {
  const p = parseTimeControl(tc);
  if (!p) return 'unknown';
  if (p.daily) return 'daily';
  const est = p.base + 40 * p.inc;
  if (est < 180) return 'bullet';
  if (est < 600) return 'blitz';
  if (est < 3600) return 'rapid';
  return 'classical';
}

export function formatClock(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '--:--';
  const total = Math.max(0, ms);
  if (total < 10_000) return `0:0${(total / 1000).toFixed(1)}`.replace('0:00', '0:0').replace(/^0:0(\d\.)/, '0:0$1');
  const s = Math.floor(total / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

function clkString(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`;
}

export interface BuildPgnInput {
  headers: Record<string, string>;
  startFen?: string;
  ucis: string[];
  result: GameResult;
  clocks?: (number | undefined)[];
}

/** Build a PGN string from UCI moves (validates every move). */
export function buildPgn(input: BuildPgnInput): string {
  const chess = input.startFen && input.startFen !== START_FEN ? new Chess(normalizeFen(input.startFen)) : new Chess();
  const base: Record<string, string> = {
    Event: 'Casual game',
    Site: 'Kibitz',
    Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
    Round: '-',
    White: '?',
    Black: '?',
    Result: input.result,
    ...input.headers,
  };
  base['Result'] = input.result;
  for (const [k, v] of Object.entries(base)) chess.setHeader(k, v);
  input.ucis.forEach((u, i) => {
    chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u.slice(4, 5) : undefined });
    const clk = input.clocks?.[i];
    if (clk !== undefined) chess.setComment(`[%clk ${clkString(clk)}]`);
  });
  return chess.pgn({ newline: '\n' });
}

/** Stable short hash for fingerprints (FNV-1a 32-bit, hex). Not cryptographic. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function resultFromHeader(r: string | undefined): GameResult {
  return r === '1-0' || r === '0-1' || r === '1/2-1/2' ? r : '*';
}

export function pgnDateToIso(d: string | undefined): string {
  if (!d) return '';
  const m = /^(\d{4})[.-](\d{2}|\?\?)[.-](\d{2}|\?\?)/.exec(d);
  if (!m) return '';
  return `${m[1]}-${m[2] === '??' ? '01' : m[2]}-${m[3] === '??' ? '01' : m[3]}`;
}
