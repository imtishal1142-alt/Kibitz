// Rules, clocks and results for a game played in the app (human vs engine, or engine vs engine).
// Pure and timestamp-driven: the caller passes `now`, so it is deterministic to test and the UI is
// free to render the clocks however it likes.
import { Chess } from 'chess.js';
import type { Color, GameResult } from '../types';
import { START_FEN, buildPgn, fenKey, normalizeFen, uciOf } from '../chess/rules';

export interface TimeControlSpec {
  baseMs: number;
  incMs: number;
}
export type SessionTime = TimeControlSpec | { w: TimeControlSpec; b: TimeControlSpec } | null;

export type EndReason = 'checkmate' | 'stalemate' | 'insufficient' | 'threefold' | 'fifty' | 'fivefold' | 'seventyfive' | 'timeout' | 'timeout-vs-insufficient' | 'resign' | 'agreement' | 'stopped';

export interface Ended {
  result: GameResult;
  winner?: Color;
  reason: EndReason;
  text: string;
}

export interface PlyRecord {
  ply: number;
  color: Color;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  /** Mover's clock after the move including the increment (undefined for untimed games). */
  clockAfterMs?: number;
  spentMs: number;
  clocksBefore: { w: number | null; b: number | null };
}

export type MoveInput = string | { from: string; to: string; promotion?: string };

export type MoveOutcome = { ok: true; ply: PlyRecord; ended: Ended | null } | { ok: false; error: 'over' | 'illegal' | 'flagged' | 'paused'; ended?: Ended | null };

const NAME = { w: 'White', b: 'Black' } as const;
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export interface SessionOptions {
  startFen?: string;
  time?: SessionTime;
  /** Apply claimable draws (threefold repetition, fifty-move rule) automatically; used for engine matches. */
  autoClaimDraws?: boolean;
}

export class GameSession {
  readonly startFen: string;
  readonly time: { w: TimeControlSpec; b: TimeControlSpec } | null;
  readonly autoClaimDraws: boolean;
  plies: PlyRecord[] = [];
  ended: Ended | null = null;
  /** Colour that has offered a draw which the other side has not yet answered. */
  drawOffer: Color | null = null;
  private chess: Chess;
  private clocks: { w: number | null; b: number | null };
  private runningSince: number | null = null;
  private started = false;
  private paused = false;
  private fens: string[];

  constructor(opts: SessionOptions = {}) {
    this.startFen = normalizeFen(opts.startFen ?? START_FEN);
    this.chess = new Chess(this.startFen);
    this.autoClaimDraws = opts.autoClaimDraws ?? false;
    const t = opts.time;
    this.time = !t ? null : 'baseMs' in t ? { w: t, b: t } : t;
    this.clocks = { w: this.time ? this.time.w.baseMs : null, b: this.time ? this.time.b.baseMs : null };
    this.fens = [this.startFen];
    this.ended = this.terminalAfterMove(null);
  }

  /** The latest positions of the game, most recent first (what a network that looks at move history needs). */
  recentFens(n = 8): string[] {
    return this.fens.slice(-n).reverse();
  }

  get fen(): string {
    return this.chess.fen();
  }
  get turn(): Color {
    return this.chess.turn();
  }
  get timed(): boolean {
    return this.time !== null;
  }
  get over(): boolean {
    return this.ended !== null;
  }
  get isPaused(): boolean {
    return this.paused;
  }
  get inCheck(): boolean {
    return this.chess.inCheck();
  }
  get ucis(): string[] {
    return this.plies.map((p) => p.uci);
  }

  /** Start the clock of the side to move. Untimed games ignore this. */
  start(now: number): void {
    if (this.started || this.over) return;
    this.started = true;
    this.runningSince = this.time ? now : null;
  }

  pause(now: number): void {
    if (!this.started || this.paused || this.over) return;
    this.settle(now);
    this.paused = true;
    this.runningSince = null;
  }

  resume(now: number): void {
    if (!this.paused || this.over) return;
    this.paused = false;
    this.runningSince = this.time ? now : null;
  }

  /** Time left for `color` at `now` (null for untimed games). */
  remaining(color: Color, now: number): number | null {
    const c = this.clocks[color];
    if (c === null) return null;
    if (this.runningSince !== null && !this.over && color === this.turn) return Math.max(0, c - (now - this.runningSince));
    return Math.max(0, c);
  }

  private settle(now: number): void {
    const turn = this.turn;
    const c = this.clocks[turn];
    if (c !== null && this.runningSince !== null) this.clocks[turn] = c - (now - this.runningSince);
    if (this.runningSince !== null) this.runningSince = now;
  }

  /** Check for a flag fall. Returns the ending if time ran out. */
  tick(now: number): Ended | null {
    if (this.over || !this.time || !this.started || this.paused) return this.ended;
    const rem = this.remaining(this.turn, now);
    if (rem !== null && rem <= 0) {
      this.clocks[this.turn] = 0;
      return this.finishTimeout(this.turn);
    }
    return null;
  }

  private finishTimeout(loser: Color): Ended {
    const winner = other(loser);
    const cannotMate = this.hasOnlyKing(winner) || this.chess.isInsufficientMaterial();
    this.runningSince = null;
    this.ended = cannotMate
      ? { result: '1/2-1/2', reason: 'timeout-vs-insufficient', text: `${NAME[loser]} ran out of time, but ${NAME[winner]} cannot checkmate: draw.` }
      : { result: winner === 'w' ? '1-0' : '0-1', winner, reason: 'timeout', text: `${NAME[loser]} ran out of time. ${NAME[winner]} wins.` };
    return this.ended;
  }

  private hasOnlyKing(color: Color): boolean {
    for (const row of this.chess.board()) for (const sq of row) if (sq && sq.color === color && sq.type !== 'k') return false;
    return true;
  }

  /** Play a move. `now` is when the player completed it. */
  move(input: MoveInput, now: number): MoveOutcome {
    if (this.over) return { ok: false, error: 'over', ended: this.ended };
    if (this.paused) return { ok: false, error: 'paused' };
    if (this.time && this.started) {
      const flagged = this.tick(now);
      if (flagged) return { ok: false, error: 'flagged', ended: flagged };
    }
    const color = this.turn;
    const fenBefore = this.fen;
    const clocksBefore = { ...this.clocks };
    const spent = this.time && this.started && this.runningSince !== null ? Math.max(0, now - this.runningSince) : 0;
    const spec = typeof input === 'string' ? { from: input.slice(0, 2), to: input.slice(2, 4), promotion: input.length > 4 ? input[4] : undefined } : input;
    let mv;
    try {
      mv = this.chess.move(spec);
    } catch {
      return { ok: false, error: 'illegal' };
    }
    let clockAfter: number | undefined;
    if (this.time) {
      const before = this.clocks[color] ?? 0;
      const after = this.started ? before - spent + this.time[color].incMs : before;
      this.clocks[color] = after;
      clockAfter = after;
      this.runningSince = this.started ? now : null;
    }
    const rec: PlyRecord = {
      ply: this.plies.length + 1,
      color,
      san: mv.san,
      uci: uciOf(mv),
      fenBefore,
      fenAfter: this.fen,
      clockAfterMs: clockAfter,
      spentMs: spent,
      clocksBefore,
    };
    this.plies.push(rec);
    this.fens.push(this.fen);
    this.drawOffer = null;
    this.ended = this.terminalAfterMove(color);
    if (this.ended) this.runningSince = null;
    return { ok: true, ply: rec, ended: this.ended };
  }

  private repetitions(): number {
    const key = fenKey(this.fen);
    return this.fens.filter((f) => fenKey(f) === key).length;
  }

  private terminalAfterMove(mover: Color | null): Ended | null {
    const c = this.chess;
    if (c.isCheckmate()) {
      const winner = mover ?? other(c.turn());
      return { result: winner === 'w' ? '1-0' : '0-1', winner, reason: 'checkmate', text: `Checkmate. ${NAME[winner]} wins.` };
    }
    if (c.isStalemate()) return { result: '1/2-1/2', reason: 'stalemate', text: 'Stalemate: draw.' };
    if (c.isInsufficientMaterial()) return { result: '1/2-1/2', reason: 'insufficient', text: 'Draw: neither side has enough material to checkmate.' };
    if (this.repetitions() >= 5) return { result: '1/2-1/2', reason: 'fivefold', text: 'Draw by fivefold repetition.' };
    if (this.halfmoves() >= 150) return { result: '1/2-1/2', reason: 'seventyfive', text: 'Draw by the seventy-five-move rule.' };
    if (this.autoClaimDraws) {
      const claim = this.claimableDraw();
      if (claim === 'threefold') return { result: '1/2-1/2', reason: 'threefold', text: 'Draw by threefold repetition.' };
      if (claim === 'fifty') return { result: '1/2-1/2', reason: 'fifty', text: 'Draw by the fifty-move rule.' };
    }
    return null;
  }

  private halfmoves(): number {
    return Number(this.fen.split(' ')[4] ?? 0);
  }

  /** A draw the side to move may claim right now. */
  claimableDraw(): 'threefold' | 'fifty' | null {
    if (this.over) return null;
    if (this.repetitions() >= 3) return 'threefold';
    if (this.halfmoves() >= 100) return 'fifty';
    return null;
  }

  claimDraw(): Ended | null {
    const kind = this.claimableDraw();
    if (!kind) return null;
    this.runningSince = null;
    this.ended = { result: '1/2-1/2', reason: kind, text: kind === 'threefold' ? 'Draw by threefold repetition.' : 'Draw by the fifty-move rule.' };
    return this.ended;
  }

  offerDraw(by: Color): void {
    if (!this.over) this.drawOffer = by;
  }

  /** The other side accepts the standing draw offer. */
  acceptDraw(): Ended | null {
    if (this.over || !this.drawOffer) return null;
    this.runningSince = null;
    this.ended = { result: '1/2-1/2', reason: 'agreement', text: 'Draw agreed.' };
    this.drawOffer = null;
    return this.ended;
  }

  declineDraw(): void {
    this.drawOffer = null;
  }

  resign(color: Color): Ended | null {
    if (this.over) return null;
    const winner = other(color);
    this.runningSince = null;
    this.ended = { result: winner === 'w' ? '1-0' : '0-1', winner, reason: 'resign', text: `${NAME[color]} resigned. ${NAME[winner]} wins.` };
    return this.ended;
  }

  /** End the game without a result (match stopped by the user). */
  stop(): Ended | null {
    if (this.over) return null;
    this.runningSince = null;
    this.ended = { result: '*', reason: 'stopped', text: 'Game stopped.' };
    return this.ended;
  }

  /** Take back the last `count` plies (returned most recent first), restoring the clocks to what they were. */
  undo(count: number, now: number): PlyRecord[] {
    const removed: PlyRecord[] = [];
    for (let i = 0; i < count && this.plies.length; i++) {
      const rec = this.plies.pop()!;
      this.chess.undo();
      this.fens.pop();
      this.clocks = { ...rec.clocksBefore };
      removed.push(rec);
    }
    if (removed.length) {
      this.ended = null;
      this.drawOffer = null;
      this.runningSince = this.time && this.started && !this.paused ? now : null;
    }
    return removed;
  }

  legalSans(): string[] {
    return this.chess.moves();
  }

  legalTargets(from: string): string[] {
    return [...new Set(this.chess.moves({ square: from as never, verbose: true }).map((m) => m.to))];
  }

  isPromotion(from: string, to: string): boolean {
    return this.chess.moves({ square: from as never, verbose: true }).some((m) => m.to === to && !!m.promotion);
  }

  get lastMove(): { from: string; to: string } | null {
    const l = this.plies.at(-1);
    return l ? { from: l.uci.slice(0, 2), to: l.uci.slice(2, 4) } : null;
  }

  timeControlHeader(): string | undefined {
    if (!this.time) return undefined;
    const w = this.time.w;
    const b = this.time.b;
    if (w.baseMs === b.baseMs && w.incMs === b.incMs) return `${Math.round(w.baseMs / 1000)}${w.incMs ? `+${Math.round(w.incMs / 1000)}` : ''}`;
    return `${Math.round(w.baseMs / 1000)}+${Math.round(w.incMs / 1000)}/${Math.round(b.baseMs / 1000)}+${Math.round(b.incMs / 1000)}`;
  }

  /** Export as PGN (including clock comments for timed games). */
  pgn(headers: Record<string, string> = {}): string {
    const result: GameResult = this.ended?.result ?? '*';
    const h: Record<string, string> = { ...headers };
    const tc = this.timeControlHeader();
    if (tc) h['TimeControl'] = tc;
    else h['TimeControl'] = '-';
    if (this.startFen !== normalizeFen(START_FEN)) {
      h['SetUp'] = '1';
      h['FEN'] = this.startFen;
    }
    if (this.ended) h['Termination'] = this.ended.text.replace(/\.$/, '');
    return buildPgn({ headers: h, startFen: this.startFen, ucis: this.ucis, result, clocks: this.plies.map((p) => (p.clockAfterMs !== undefined ? Math.max(0, p.clockAfterMs) : undefined)) });
  }
}
