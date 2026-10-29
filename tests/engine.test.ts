import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Engine, EngineError } from '../src/lib/engine/engine';
import { buildGo, parseBestmove, parseInfo, parseOption } from '../src/lib/engine/uci';
import { isLegalUci, uciLineToSan, START_FEN } from '../src/lib/chess/rules';
import { nodeStockfishFactory, scripted, silentFactory } from './helpers/nodeEngine';

describe('UCI parsing (pure)', () => {
  it('parses centipawn info with wdl and pv', () => {
    const i = parseInfo('info depth 12 seldepth 21 multipv 2 score cp -35 wdl 53 941 6 nodes 47403 nps 250809 hashfull 16 time 189 pv g1f3 b8c6 d2d4');
    expect(i).toMatchObject({ depth: 12, seldepth: 21, multipv: 2, nodes: 47403, nps: 250809, time: 189 });
    expect(i?.score).toEqual({ kind: 'cp', cp: -35 });
    expect(i?.wdl).toEqual([53, 941, 6]);
    expect(i?.pv).toEqual(['g1f3', 'b8c6', 'd2d4']);
  });
  it('parses mate scores and bounds', () => {
    expect(parseInfo('info depth 6 multipv 1 score mate -3 nodes 1 pv d8h4')?.score).toEqual({ kind: 'mate', mate: -3 });
    const b = parseInfo('info depth 9 multipv 1 score cp 80 lowerbound nodes 5 pv e2e4');
    expect(b?.bound).toBe('lower');
  });
  it('ignores non-search info lines', () => {
    expect(parseInfo('info string NNUE evaluation using nn.nnue')).toBeNull();
    expect(parseInfo('info depth 3 currmove e2e4 currmovenumber 1')).toBeNull();
  });
  it('parses bestmove including (none)', () => {
    expect(parseBestmove('bestmove e2e4 ponder e7e5')).toEqual({ best: 'e2e4', ponder: 'e7e5' });
    expect(parseBestmove('bestmove (none)')).toEqual({ best: null });
    expect(parseBestmove('info depth 1')).toBeNull();
  });
  it('parses options', () => {
    expect(parseOption('option name Skill Level type spin default 20 min 0 max 20')).toEqual({ name: 'Skill Level', type: 'spin', default: '20', min: 0, max: 20 });
    expect(parseOption('option name UCI_LimitStrength type check default false')).toMatchObject({ type: 'check', default: 'false' });
    expect(parseOption('option name Clear Hash type button')).toMatchObject({ name: 'Clear Hash', type: 'button' });
    expect(parseOption('option name EvalFile type string default nn-61e7af4bb97d.nnue')).toMatchObject({ type: 'string', default: 'nn-61e7af4bb97d.nnue' });
  });
  it('builds go commands with searchmoves last', () => {
    expect(buildGo({ depth: 12 })).toBe('go depth 12');
    expect(buildGo({ movetime: 500 })).toBe('go movetime 500');
    expect(buildGo({ wtime: 1000, btime: 2000, winc: 10, binc: 20 })).toBe('go wtime 1000 btime 2000 winc 10 binc 20');
    expect(buildGo({ depth: 8, searchmoves: ['e2e4', 'd2d4'] })).toBe('go depth 8 searchmoves e2e4 d2d4');
    expect(buildGo({})).toBe('go infinite');
  });
});

describe('Engine with real Stockfish 19 (WASM build running in Node)', () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await Engine.start(nodeStockfishFactory());
  });
  afterAll(() => engine.dispose());

  it('initialises over UCI and reports its identity and options', () => {
    expect(engine.info.name).toMatch(/Stockfish/);
    expect(engine.info.options['MultiPV']).toBeDefined();
    expect(engine.info.options['UCI_Elo']).toMatchObject({ min: 1320, max: 3190 });
    expect(engine.info.options['Skill Level']).toMatchObject({ min: 0, max: 20 });
  });

  it('returns a legal best move and a legal principal variation', async () => {
    const r = await engine.search({ depth: 10 });
    expect(r.cancelled).toBe(false);
    expect(r.bestmove).not.toBeNull();
    expect(isLegalUci(START_FEN, r.bestmove!)).toBe(true);
    expect(r.depth).toBeGreaterThanOrEqual(10);
    const pv = r.lines[0]!.pv;
    expect(pv.length).toBeGreaterThan(2);
    expect(uciLineToSan(START_FEN, pv).valid).toBe(true);
    expect(pv[0]).toBe(r.bestmove);
  });

  it('reports scores from WHITE\'s perspective regardless of side to move', async () => {
    // Black has a queen against a bare king, so Black is winning in both cases.
    const whiteToMove = await engine.search({ fen: '4k3/8/8/8/8/8/3q4/6K1 w - - 0 1', depth: 12 });
    const blackToMove = await engine.search({ fen: '4k3/8/8/8/8/8/3q4/6K1 b - - 0 1', depth: 12 });
    for (const r of [whiteToMove, blackToMove]) {
      const s = r.lines[0]!.score;
      const bad = s.kind === 'mate' ? s.mate < 0 : s.cp < -500;
      expect(bad, JSON.stringify(s)).toBe(true);
    }
  });

  it('reports forced mates with the correct sign and move', async () => {
    // Fool's mate: Black to move can mate in one with Qh4#.
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2';
    const r = await engine.search({ fen, depth: 8 });
    expect(r.bestmove).toBe('d8h4');
    expect(r.lines[0]!.score).toEqual({ kind: 'mate', mate: -1 });
  });

  it('returns no best move for a checkmated position', async () => {
    const r = await engine.search({ fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', depth: 5 });
    expect(r.bestmove).toBeNull();
  });

  it('supports multiple candidate lines in strength order', async () => {
    const r = await engine.search({ depth: 12, multipv: 3 });
    expect(r.lines.map((l) => l.multipv)).toEqual([1, 2, 3]);
    expect(new Set(r.lines.map((l) => l.pv[0])).size).toBe(3);
    // Line 1 is never worse than line 2 for the side to move (White).
    const val = (l: (typeof r.lines)[number]) => (l.score.kind === 'cp' ? l.score.cp : 10000);
    expect(val(r.lines[0]!)).toBeGreaterThanOrEqual(val(r.lines[1]!) - 15);
    await engine.setOptions({ MultiPV: 1 });
  });

  it('applies depth, node and time limits as documented', async () => {
    const d = await engine.search({ depth: 6 });
    expect(d.depth).toBeGreaterThanOrEqual(6);
    expect(d.depth).toBeLessThan(14);
    const n = await engine.search({ nodes: 3000 });
    expect(n.nodes ?? 0).toBeLessThan(40_000);
    const t0 = Date.now();
    const t = await engine.search({ movetime: 250 });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(t.bestmove).not.toBeNull();
  });

  it('honours searchmoves', async () => {
    const r = await engine.search({ depth: 8, searchmoves: ['a2a3'] });
    expect(r.bestmove).toBe('a2a3');
  });

  it('can be stopped and then used again without stale results', async () => {
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const pending = engine.search({ fen: START_FEN }); // `go infinite`
    await new Promise((r) => setTimeout(r, 300));
    engine.stop();
    const stopped = await pending;
    expect(stopped.cancelled).toBe(true);
    expect(stopped.lines.length).toBeGreaterThan(0);

    const next = await engine.search({ fen: afterE4, depth: 8 });
    expect(next.cancelled).toBe(false);
    expect(next.fen).toBe(afterE4);
    expect(isLegalUci(afterE4, next.bestmove!)).toBe(true);
  });

  it('a newer request supersedes an older one', async () => {
    const afterD4 = 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';
    const first = engine.search({ fen: START_FEN }); // infinite
    await new Promise((r) => setTimeout(r, 150));
    const second = engine.search({ fen: afterD4, depth: 8 });
    const [a, b] = await Promise.all([first, second]);
    expect(a.cancelled).toBe(true);
    expect(b.cancelled).toBe(false);
    expect(isLegalUci(afterD4, b.bestmove!)).toBe(true);
    expect(b.fen).toBe(afterD4);
  });

  it('supports cancellation through AbortSignal', async () => {
    const ac = new AbortController();
    const p = engine.search({ signal: ac.signal });
    setTimeout(() => ac.abort(), 200);
    const r = await p;
    expect(r.cancelled).toBe(true);
    const ok = await engine.search({ depth: 6 });
    expect(ok.cancelled).toBe(false);
  });

  it('streams progress while searching', async () => {
    const depths: number[] = [];
    await engine.search({ depth: 11, onInfo: (s) => depths.push(s.depth) });
    expect(depths.length).toBeGreaterThan(1);
    expect(Math.max(...depths)).toBeGreaterThanOrEqual(11);
  });

  it('applies strength options and reports unknown ones', async () => {
    const res = await engine.setOptions({ UCI_LimitStrength: true, UCI_Elo: 1400, NotAnOption: 1 });
    expect(res.ignored).toEqual(['NotAnOption']);
    const r = await engine.search({ depth: 6 });
    expect(isLegalUci(START_FEN, r.bestmove!)).toBe(true);
    await engine.setOptions({ UCI_LimitStrength: false });
  });

  it('rejects illegal positions and moves before touching the engine', async () => {
    await expect(engine.search({ fen: 'not a fen', depth: 3 })).rejects.toMatchObject({ code: 'illegal-position' });
    // The side NOT to move is in check: chess.js loads this, but Stockfish would abort on it.
    await expect(engine.search({ fen: '4k3/8/8/8/8/8/3q4/4K3 b - - 0 1', depth: 3 })).rejects.toMatchObject({ code: 'illegal-position' });
    // Touching kings.
    await expect(engine.search({ fen: '8/8/8/8/8/3k4/3K4/8 w - - 0 1', depth: 3 })).rejects.toMatchObject({ code: 'illegal-position' });
    await expect(engine.search({ moves: ['e2e5'], depth: 3 })).rejects.toBeInstanceOf(EngineError);
    const ok = await engine.search({ depth: 4 });
    expect(ok.cancelled).toBe(false);
  });
});

describe('Engine failure handling', () => {
  it('fails with an actionable error when the engine never answers', async () => {
    await expect(Engine.start(silentFactory, { initTimeoutMs: 300 })).rejects.toMatchObject({ code: 'init-timeout' });
  });

  it('rejects and recovers after a crash mid-search', async () => {
    let created = 0;
    const base = nodeStockfishFactory();
    const factory = scripted(
      () => {
        created++;
        return base();
      },
      {
        onSend: (cmd, fail) => {
          if (created === 1 && cmd.startsWith('go')) fail('simulated worker crash');
        },
        swallow: (cmd) => created === 1 && cmd.startsWith('go'),
      },
    );
    const engine = await Engine.start(factory);
    await expect(engine.search({ depth: 8 })).rejects.toMatchObject({ code: 'crash' });
    const r = await engine.search({ depth: 8 });
    expect(created).toBe(2);
    expect(isLegalUci(START_FEN, r.bestmove!)).toBe(true);
    engine.dispose();
  });

  it('detects a stalled search with the watchdog and restarts', async () => {
    let created = 0;
    const base = nodeStockfishFactory();
    const factory = scripted(
      () => {
        created++;
        return base();
      },
      { swallow: (cmd) => created === 1 && cmd.startsWith('go') },
    );
    const engine = await Engine.start(factory, { stallMs: 1200 });
    await expect(engine.search({ depth: 8 })).rejects.toMatchObject({ code: 'stall' });
    const r = await engine.search({ depth: 6 });
    expect(r.cancelled).toBe(false);
    expect(created).toBe(2);
    engine.dispose();
  });

  it('refuses work after being disposed', async () => {
    const engine = await Engine.start(nodeStockfishFactory());
    engine.dispose();
    await expect(engine.search({ depth: 3 })).rejects.toMatchObject({ code: 'disposed' });
  });
});
