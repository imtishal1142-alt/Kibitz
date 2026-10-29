// Engine controller: one UCI engine, one search at a time.
//
// Guarantees:
//  * A newer search request supersedes (stops) an older one; stale `bestmove` lines can never be
//    attributed to the wrong request because we always wait for the old search to terminate
//    and then re-synchronise with `isready` before sending a new `position`/`go`.
//  * A watchdog detects stalled searches; a transport error marks the engine dead and the next
//    request transparently restarts it.
//  * All scores leave this module from WHITE's point of view.
import { Chess } from 'chess.js';
import type { Score, SearchLine } from '../types';
import { START_FEN, findIllegality, normalizeFen } from '../chess/rules';
import { uciToWhite } from '../chess/eval';
import { buildGo, parseBestmove, parseInfo, parseOption } from './uci';
import type { GoParams, UciOption } from './uci';

export interface UciTransport {
  send(command: string): void;
  onLine(cb: (line: string) => void): void;
  onError(cb: (err: Error) => void): void;
  terminate(): void;
}
export type TransportFactory = () => UciTransport;

export type EngineErrorCode = 'init-timeout' | 'init-failed' | 'crash' | 'stall' | 'illegal-position' | 'disposed';

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

export interface SearchRequest extends GoParams {
  /** Base position (FEN). Defaults to the standard start position. */
  fen?: string;
  /** UCI moves played from `fen`. */
  moves?: string[];
  multipv?: number;
  signal?: AbortSignal;
  onInfo?: (snapshot: SearchSnapshot) => void;
}

export interface SearchSnapshot {
  fen: string; // position being searched (after `moves`)
  depth: number;
  lines: SearchLine[];
  nodes?: number;
  nps?: number;
  time?: number;
}

export interface SearchResult extends SearchSnapshot {
  bestmove: string | null;
  ponder?: string;
  cancelled: boolean;
  turn: 'w' | 'b';
}

export interface EngineInfo {
  name: string;
  author: string;
  options: Record<string, UciOption>;
}

export interface EngineStartOptions {
  initTimeoutMs?: number;
  stallMs?: number;
  options?: Record<string, string | number | boolean>;
}

interface Waiter {
  test: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ActiveSearch {
  id: number;
  req: SearchRequest;
  fen: string;
  turn: 'w' | 'b';
  lines: Map<number, SearchLine>;
  cancelled: boolean;
  lastActivity: number;
  lastEmit: number;
  settled: Promise<void>;
  settle: () => void;
  resolve: (r: SearchResult) => void;
  reject: (e: Error) => void;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class Engine {
  info: EngineInfo = { name: '', author: '', options: {} };
  /** Identifies the build (set by the engine hub). Part of the evaluation-cache key. */
  tag = '';
  private transport!: UciTransport;
  private dead = true;
  private disposed = false;
  private waiters = new Set<Waiter>();
  private current: ActiveSearch | null = null;
  private ticket = 0;
  private searchId = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private applied = new Map<string, string>();
  private desired = new Map<string, string | number | boolean>();
  private readonly initTimeoutMs: number;
  private readonly stallMs: number;
  private booting: Promise<void> | null = null;

  private constructor(
    private readonly factory: TransportFactory,
    opts: EngineStartOptions,
  ) {
    this.initTimeoutMs = opts.initTimeoutMs ?? 20_000;
    this.stallMs = opts.stallMs ?? 20_000;
    for (const [k, v] of Object.entries(opts.options ?? {})) this.desired.set(k, v);
  }

  static async start(factory: TransportFactory, opts: EngineStartOptions = {}): Promise<Engine> {
    const engine = new Engine(factory, opts);
    await engine.boot();
    return engine;
  }

  get isDead(): boolean {
    return this.dead;
  }

  /** Spawn the transport, perform the UCI handshake and apply desired options. */
  private boot(): Promise<void> {
    if (this.booting) return this.booting;
    this.booting = this.doBoot().finally(() => {
      this.booting = null;
    });
    return this.booting;
  }

  private async doBoot(): Promise<void> {
    if (this.disposed) throw new EngineError('disposed', 'The engine has been shut down.');
    this.applied.clear();
    this.info = { name: '', author: '', options: {} };
    let transport: UciTransport;
    try {
      transport = this.factory();
    } catch (e) {
      throw new EngineError('init-failed', `Could not start the engine: ${e instanceof Error ? e.message : String(e)}`);
    }
    this.transport = transport;
    this.dead = false;
    transport.onLine((raw) => this.handleLines(raw, transport));
    transport.onError((err) => {
      if (this.transport === transport) this.kill(new EngineError('crash', `The engine stopped unexpectedly: ${err.message}`));
    });
    try {
      const uciok = this.waitFor((l) => l === 'uciok', this.initTimeoutMs, 'init-timeout', 'The engine did not respond. Its files may be missing or blocked - check that /engines/ is served and WebAssembly is enabled.');
      transport.send('uci');
      await uciok;
      for (const [k, v] of this.desired) this.queueOption(k, v);
      await this.sync();
    } catch (e) {
      this.kill();
      throw e instanceof EngineError ? e : new EngineError('init-failed', e instanceof Error ? e.message : String(e));
    }
    this.startWatchdog();
  }

  private handleLines(raw: string, from: UciTransport): void {
    if (from !== this.transport) return; // output from a terminated engine
    for (const part of raw.split('\n')) {
      const line = part.trim();
      if (line) this.dispatch(line);
    }
  }

  private dispatch(line: string): void {
    if (line.startsWith('id name ')) this.info.name = line.slice(8).trim();
    else if (line.startsWith('id author ')) this.info.author = line.slice(10).trim();
    else if (line.startsWith('option ')) {
      const o = parseOption(line);
      if (o) this.info.options[o.name] = o;
    }
    for (const w of [...this.waiters]) {
      if (w.test(line)) {
        this.waiters.delete(w);
        clearTimeout(w.timer);
        w.resolve(line);
      }
    }
    const cur = this.current;
    if (!cur) return;
    if (line.startsWith('info ')) this.onInfoLine(cur, line);
    else if (line.startsWith('bestmove')) this.finish(cur, line);
  }

  private waitFor(test: (l: string) => boolean, ms: number, code: EngineErrorCode, message: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(w);
        reject(new EngineError(code, message));
      }, ms);
      const w: Waiter = { test, resolve, reject, timer };
      this.waiters.add(w);
    });
  }

  private async sync(timeoutMs = 10_000): Promise<void> {
    const ready = this.waitFor((l) => l === 'readyok', timeoutMs, 'stall', 'The engine stopped responding.');
    this.transport.send('isready');
    try {
      await ready;
    } catch (e) {
      this.kill();
      throw e;
    }
  }

  private startWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = setInterval(() => {
      const cur = this.current;
      if (cur && Date.now() - cur.lastActivity > this.stallMs) {
        this.kill(new EngineError('stall', `The engine produced no output for ${Math.round(this.stallMs / 1000)}s and was restarted.`));
      }
    }, 1000);
    // Do not keep a Node process alive just for the watchdog (tests / SSR).
    (this.watchdog as unknown as { unref?: () => void }).unref?.();
  }

  /** Terminate the transport and fail everything in flight. The next request restarts the engine. */
  private kill(reason?: EngineError): void {
    this.dead = true;
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    try {
      this.transport?.terminate();
    } catch {
      /* ignore */
    }
    const err = reason ?? new EngineError('crash', 'The engine was stopped.');
    for (const w of [...this.waiters]) {
      clearTimeout(w.timer);
      this.waiters.delete(w);
      w.reject(err);
    }
    const cur = this.current;
    if (cur) {
      this.current = null;
      cur.reject(err);
      cur.settle();
    }
  }

  private queueOption(name: string, value: string | number | boolean): boolean {
    const opt = this.info.options[name];
    if (!opt) return false;
    let v: string;
    if (opt.type === 'check') v = value === true || value === 'true' ? 'true' : 'false';
    else if (opt.type === 'spin') {
      let n = Number(value);
      if (!Number.isFinite(n)) return false;
      if (opt.min !== undefined) n = Math.max(opt.min, n);
      if (opt.max !== undefined) n = Math.min(opt.max, n);
      v = String(Math.round(n));
    } else v = String(value);
    if (opt.type === 'button') {
      this.transport.send(`setoption name ${name}`);
      return true;
    }
    if (this.applied.get(name) === v) return false;
    this.applied.set(name, v);
    this.transport.send(`setoption name ${name} value ${v}`);
    return true;
  }

  /** Set UCI options. Unknown options (for example Threads on a single-threaded build) are reported, not fatal. */
  async setOptions(options: Record<string, string | number | boolean>): Promise<{ ignored: string[] }> {
    const ignored: string[] = [];
    for (const [k, v] of Object.entries(options)) {
      this.desired.set(k, v);
      if (!this.info.options[k]) ignored.push(k);
    }
    if (this.dead) return { ignored }; // applied during the next boot
    await this.cancelCurrent();
    let sent = false;
    for (const [k, v] of Object.entries(options)) if (this.queueOption(k, v)) sent = true;
    if (sent) await this.sync();
    return { ignored };
  }

  async newGame(): Promise<void> {
    await this.cancelCurrent();
    if (this.dead) await this.boot();
    this.transport.send('ucinewgame');
    await this.sync();
  }

  /** Stop the running search (if any). Its promise resolves with `cancelled: true` and the lines found so far. */
  stop(): void {
    const cur = this.current;
    if (cur && !cur.cancelled) {
      cur.cancelled = true;
      this.transport.send('stop');
    }
  }

  private async cancelCurrent(): Promise<void> {
    const cur = this.current;
    if (!cur) return;
    this.stop();
    await Promise.race([cur.settled, delay(3000)]);
    if (this.current === cur) this.kill(new EngineError('stall', 'The engine did not stop when asked and was restarted.'));
  }

  async search(req: SearchRequest): Promise<SearchResult> {
    if (this.disposed) throw new EngineError('disposed', 'The engine has been shut down.');
    const my = ++this.ticket;
    const base = normalizeFen(req.fen ?? START_FEN);

    // Validate the position and moves BEFORE touching the engine.
    let chess: Chess;
    try {
      chess = new Chess(base);
      const problem = findIllegality(base);
      if (problem) throw new Error(problem);
      for (const m of req.moves ?? []) chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m.length > 4 ? m.slice(4, 5) : undefined });
    } catch (e) {
      throw new EngineError('illegal-position', `Cannot analyse an illegal position or move: ${e instanceof Error ? e.message : String(e)}`);
    }
    const finalFen = chess.fen();
    const turn = chess.turn();
    const cancelled = (): SearchResult => ({ fen: finalFen, depth: 0, lines: [], bestmove: null, cancelled: true, turn });

    if (req.signal?.aborted) return cancelled();
    await this.cancelCurrent();
    if (my !== this.ticket) return cancelled();
    if (this.dead) {
      await this.boot();
      if (my !== this.ticket) return cancelled();
    }
    if (req.multipv !== undefined) this.queueOption('MultiPV', req.multipv);
    await this.sync();
    if (my !== this.ticket || req.signal?.aborted) return cancelled();

    return new Promise<SearchResult>((resolve, reject) => {
      let settle!: () => void;
      const settled = new Promise<void>((r) => (settle = r));
      const active: ActiveSearch = {
        id: ++this.searchId,
        req,
        fen: finalFen,
        turn,
        lines: new Map(),
        cancelled: false,
        lastActivity: Date.now(),
        lastEmit: 0,
        settled,
        settle,
        resolve,
        reject,
      };
      this.current = active;
      req.signal?.addEventListener(
        'abort',
        () => {
          if (this.current === active) this.stop();
        },
        { once: true },
      );
      const posCmd = base === START_FEN ? 'position startpos' : `position fen ${base}`;
      this.transport.send(req.moves?.length ? `${posCmd} moves ${req.moves.join(' ')}` : posCmd);
      this.transport.send(buildGo(req));
    });
  }

  private snapshot(cur: ActiveSearch): SearchSnapshot {
    const lines = [...cur.lines.values()].sort((a, b) => a.multipv - b.multipv);
    const first = lines[0];
    return { fen: cur.fen, depth: lines.reduce((d, l) => Math.max(d, l.depth), 0), lines, nodes: first?.nodes, nps: first?.nps, time: first?.time };
  }

  private onInfoLine(cur: ActiveSearch, line: string): void {
    cur.lastActivity = Date.now();
    const info = parseInfo(line);
    if (!info || !info.score || info.depth === undefined) return;
    const existing = cur.lines.get(info.multipv);
    // Bound lines (aspiration window failures) are not exact scores: only use them if nothing better exists.
    if (info.bound && existing && existing.depth >= info.depth) return;
    if (existing && !info.bound && existing.depth > info.depth) return;
    const score: Score = uciToWhite(info.score, cur.turn);
    cur.lines.set(info.multipv, {
      multipv: info.multipv,
      score,
      depth: info.depth,
      seldepth: info.seldepth,
      nodes: info.nodes,
      nps: info.nps,
      time: info.time,
      wdl: info.wdl,
      pv: info.pv,
    });
    const now = Date.now();
    if (cur.req.onInfo && now - cur.lastEmit >= 60) {
      cur.lastEmit = now;
      try {
        cur.req.onInfo(this.snapshot(cur));
      } catch {
        /* a faulty listener must not break the search */
      }
    }
  }

  private finish(cur: ActiveSearch, line: string): void {
    if (this.current !== cur) return;
    this.current = null;
    const bm = parseBestmove(line);
    const snap = this.snapshot(cur);
    try {
      cur.req.onInfo?.(snap);
    } catch {
      /* ignore listener errors */
    }
    cur.resolve({ ...snap, bestmove: bm?.best ?? null, ponder: bm?.ponder, cancelled: cur.cancelled, turn: cur.turn });
    cur.settle();
  }

  dispose(): void {
    this.disposed = true;
    this.ticket++;
    this.kill(new EngineError('disposed', 'The engine has been shut down.'));
  }
}
