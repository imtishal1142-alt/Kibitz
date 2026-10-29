import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/lib/play/session';
import { parsePgn } from '../src/lib/chess/rules';
import { ELO_MAX, ELO_MIN, LEVELS, describeConfig, goFor, optionsFor, sanitizeConfig } from '../src/lib/engine/strength';

const play = (s: GameSession, moves: string[], t = 0, dt = 0) => moves.forEach((m, i) => expect(s.move(m, t + i * dt).ok, m).toBe(true));

describe('game session: rules and results', () => {
  it('rejects illegal moves and accepts legal ones in UCI or object form', () => {
    const s = new GameSession();
    expect(s.move('e2e5', 0)).toMatchObject({ ok: false, error: 'illegal' });
    expect(s.move('e2e4', 0).ok).toBe(true);
    expect(s.move({ from: 'e7', to: 'e5' }, 0).ok).toBe(true);
    expect(s.turn).toBe('w');
    expect(s.plies.map((p) => p.san)).toEqual(['e4', 'e5']);
    expect(s.lastMove).toEqual({ from: 'e7', to: 'e5' });
  });
  it('detects checkmate (fool\'s mate), stalemate and insufficient material', () => {
    const fool = new GameSession();
    play(fool, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(fool.ended).toMatchObject({ result: '0-1', winner: 'b', reason: 'checkmate' });
    expect(fool.move('a2a3', 1)).toMatchObject({ ok: false, error: 'over' });
    const stale = new GameSession({ startFen: '7k/5Q2/8/8/8/8/8/6K1 w - - 0 1' });
    expect(stale.move('f7f8', 0).ok).toBe(true); // Qf8 is not stalemate
    const stale2 = new GameSession({ startFen: '7k/8/6K1/5Q2/8/8/8/8 w - - 0 1' });
    const out = stale2.move('f5f7', 0);
    expect(out.ok && out.ended).toMatchObject({ reason: 'stalemate', result: '1/2-1/2' });
    const dead = new GameSession({ startFen: '8/8/8/3k4/8/8/2K2n2/6B1 w - - 0 1' });
    const o2 = dead.move('g1f2', 0); // Bxf2 leaves king and bishop against king
    expect(o2.ok && o2.ended?.reason).toBe('insufficient');
  });
  it('treats threefold repetition and the fifty-move rule as claimable, fivefold as automatic', () => {
    const s = new GameSession();
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    play(s, shuffle);
    expect(s.claimableDraw()).toBeNull();
    play(s, shuffle);
    expect(s.claimableDraw()).toBe('threefold');
    expect(s.over).toBe(false);
    expect(s.claimDraw()).toMatchObject({ reason: 'threefold', result: '1/2-1/2' });
    const five = new GameSession();
    for (let i = 0; i < 4; i++) play(five, shuffle);
    expect(five.ended).toMatchObject({ reason: 'fivefold' });
    const auto = new GameSession({ autoClaimDraws: true });
    play(auto, [...shuffle, ...shuffle]);
    expect(auto.ended).toMatchObject({ reason: 'threefold' });
    const fifty = new GameSession({ startFen: '4k3/8/8/8/8/8/R7/4K3 w - - 99 80' });
    expect(fifty.claimableDraw()).toBeNull();
    fifty.move('a2a3', 0);
    expect(fifty.claimableDraw()).toBe('fifty');
    const seventy = new GameSession({ startFen: '4k3/8/8/8/8/8/R7/4K3 w - - 149 90' });
    expect(seventy.move('a2a3', 0).ok && seventy.ended?.reason).toBe('seventyfive');
  });
  it('handles resignation, draw offers and stopping', () => {
    const s = new GameSession();
    s.offerDraw('w');
    expect(s.drawOffer).toBe('w');
    s.move('e2e4', 0);
    expect(s.drawOffer).toBeNull(); // a move declines the offer
    s.offerDraw('b');
    expect(s.acceptDraw()).toMatchObject({ reason: 'agreement', result: '1/2-1/2' });
    const r = new GameSession();
    expect(r.resign('w')).toMatchObject({ result: '0-1', winner: 'b', reason: 'resign' });
    expect(r.resign('b')).toBeNull();
    const st = new GameSession();
    expect(st.stop()).toMatchObject({ result: '*', reason: 'stopped' });
  });
  it('knows promotion moves', () => {
    const s = new GameSession({ startFen: '8/P6k/8/8/8/8/8/K7 w - - 0 1' });
    expect(s.isPromotion('a7', 'a8')).toBe(true);
    expect(s.legalTargets('a7')).toEqual(['a8']);
    expect(s.move({ from: 'a7', to: 'a8', promotion: 'n' }, 0)).toMatchObject({ ok: true });
    expect(s.plies[0]!.san).toMatch(/^a8=N/);
    expect(s.plies[0]!.uci).toBe('a7a8n');
  });
});

describe('game session: clocks', () => {
  const tc = { baseMs: 60_000, incMs: 2000 };
  it('runs the side to move, adds the increment, and records time spent', () => {
    const s = new GameSession({ time: tc });
    s.start(1000);
    expect(s.remaining('w', 1000)).toBe(60_000);
    expect(s.remaining('w', 6000)).toBe(55_000);
    expect(s.remaining('b', 6000)).toBe(60_000); // not running
    const r = s.move('e2e4', 6000);
    expect(r.ok && r.ply.spentMs).toBe(5000);
    expect(s.remaining('w', 9000)).toBe(57_000); // 60 - 5 + 2
    expect(s.remaining('b', 9000)).toBe(57_000); // black has been thinking for 3 s since 6000
    s.move('e7e5', 9000);
    expect(s.remaining('b', 9000)).toBe(59_000);
  });
  it('flags a player whose time runs out, on tick and on a late move', () => {
    const s = new GameSession({ time: { baseMs: 1000, incMs: 0 } });
    s.start(0);
    expect(s.tick(500)).toBeNull();
    expect(s.tick(1500)).toMatchObject({ reason: 'timeout', result: '0-1', winner: 'b' });
    const late = new GameSession({ time: { baseMs: 1000, incMs: 0 } });
    late.start(0);
    expect(late.move('e2e4', 1200)).toMatchObject({ ok: false, error: 'flagged' });
    expect(late.ended?.reason).toBe('timeout');
  });
  it('calls it a draw when the opponent of the flagged player cannot mate', () => {
    const s = new GameSession({ startFen: '8/8/8/8/8/2k5/8/K7 w - - 0 1', time: { baseMs: 1000, incMs: 0 } });
    s.start(0);
    // chess.js already treats K vs K as insufficient, so this ends immediately
    expect(s.over).toBe(true);
    // White flags, but Black has only a king: nobody can mate, so it is a draw.
    const s2 = new GameSession({ startFen: '4k3/8/8/8/8/8/6P1/4K3 w - - 0 1', time: { w: { baseMs: 500, incMs: 0 }, b: { baseMs: 5000, incMs: 0 } } });
    s2.start(0);
    expect(s2.tick(600)).toMatchObject({ reason: 'timeout-vs-insufficient', result: '1/2-1/2' });
    // Black flags and White has king and pawn: White wins.
    const s3 = new GameSession({ startFen: '4k3/8/8/8/8/8/6P1/4K3 b - - 0 1', time: { w: { baseMs: 5000, incMs: 0 }, b: { baseMs: 500, incMs: 0 } } });
    s3.start(0);
    expect(s3.tick(600)).toMatchObject({ reason: 'timeout', winner: 'w', result: '1-0' });
    // Black flags but White has a bare king: draw.
    const bare = new GameSession({ startFen: '4k3/6p1/8/8/8/8/8/4K3 b - - 0 1', time: { baseMs: 400, incMs: 0 } });
    bare.start(0);
    expect(bare.tick(500)).toMatchObject({ reason: 'timeout-vs-insufficient' });
    // Bare black king flags against king and rook: White wins.
    const rook = new GameSession({ startFen: '4k3/8/8/8/8/8/8/4K2R b - - 0 1', time: { baseMs: 400, incMs: 0 } });
    rook.start(0);
    expect(rook.tick(500)).toMatchObject({ reason: 'timeout', winner: 'w' });
    // White flags and Black has king and pawn: Black wins.
    const pawn = new GameSession({ startFen: '4k3/6p1/8/8/8/8/8/4K3 w - - 0 1', time: { baseMs: 400, incMs: 0 } });
    pawn.start(0);
    expect(pawn.tick(500)).toMatchObject({ reason: 'timeout', winner: 'b' });
  });
  it('freezes time while paused and does not count it against the player', () => {
    const s = new GameSession({ time: tc });
    s.start(0);
    s.pause(10_000);
    expect(s.remaining('w', 50_000)).toBe(50_000);
    expect(s.move('e2e4', 20_000)).toMatchObject({ ok: false, error: 'paused' });
    s.resume(60_000);
    expect(s.remaining('w', 65_000)).toBe(45_000);
  });
  it('restores the clocks on takeback', () => {
    const s = new GameSession({ time: tc });
    s.start(0);
    s.move('e2e4', 5000);
    s.move('e7e5', 8000);
    s.move('g1f3', 12_000);
    const afterThree = s.remaining('b', 12_000);
    const removed = s.undo(2, 20_000);
    expect(removed.map((p) => p.san)).toEqual(['Nf3', 'e5']); // most recent first
    expect(s.plies.map((p) => p.san)).toEqual(['e4']);
    expect(s.turn).toBe('b');
    expect(s.remaining('b', 20_000)).toBe(60_000); // black's clock as it was before 1...e5, restarted at the takeback
    expect(afterThree).toBeLessThan(60_000);
    const ended = new GameSession();
    play(ended, ['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    ended.undo(1, 0);
    expect(ended.ended).toBeNull();
    expect(ended.turn).toBe('b');
  });
  it('exports a PGN that re-imports to the same game, with clocks and the right headers', () => {
    const s = new GameSession({ time: { baseMs: 180_000, incMs: 2000 } });
    s.start(0);
    play(s, ['e2e4', 'e7e5', 'g1f3', 'b8c6'], 1000, 3000);
    s.resign('b');
    const pgn = s.pgn({ White: 'You', Black: 'Stockfish', Event: 'Test' });
    expect(pgn).toMatch(/\[TimeControl "180\+2"\]/);
    expect(pgn).toMatch(/\[Result "1-0"\]/);
    expect(pgn).toMatch(/\[Termination "Black resigned/);
    expect(pgn).toMatch(/\[%clk 0:0\d:\d\d/);
    const back = parsePgn(pgn);
    expect(back.moves.map((m) => m.uci)).toEqual(s.ucis);
    expect(back.moves[0]!.clockMs).toBeGreaterThan(0);
  });
  it('plays from a set-up position and records it in the PGN', () => {
    const fen = '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1';
    const s = new GameSession({ startFen: fen });
    s.move('e2e4', 0);
    const pgn = s.pgn();
    expect(pgn).toMatch(/\[SetUp "1"\]/);
    expect(pgn).toMatch(/\[FEN "4k3\/8\/8\/8\/8\/8\/4P3\/4K3 w - - 0 1"\]/);
    expect(parsePgn(pgn).moves[0]!.fenBefore).toContain('4P3');
  });
});

describe('opponent strength configuration', () => {
  it('maps modes to the real UCI options and always resets the others', () => {
    expect(optionsFor({ mode: 'full', elo: 2000, skill: 5, movetimeMs: 500, useClock: false })).toEqual({ UCI_LimitStrength: false, 'Skill Level': 20 });
    expect(optionsFor({ mode: 'elo', elo: 1700, skill: 5, movetimeMs: 500, useClock: false })).toEqual({ UCI_LimitStrength: true, UCI_Elo: 1700, 'Skill Level': 20 });
    expect(optionsFor({ mode: 'skill', elo: 1700, skill: 7, movetimeMs: 500, useClock: false })).toEqual({ UCI_LimitStrength: false, 'Skill Level': 7 });
  });
  it('clamps out-of-range values to what the engine accepts', () => {
    expect(optionsFor({ mode: 'elo', elo: 100, skill: 0, movetimeMs: 1, useClock: false }).UCI_Elo).toBe(ELO_MIN);
    expect(optionsFor({ mode: 'elo', elo: 9999, skill: 0, movetimeMs: 1, useClock: false }).UCI_Elo).toBe(ELO_MAX);
    const c = sanitizeConfig({ skill: 99, movetimeMs: -5, elo: NaN, mode: 'bogus' as never });
    expect(c.skill).toBe(20);
    expect(c.movetimeMs).toBe(20);
    expect(c.mode).toBe('elo');
  });
  it('chooses fixed think time or the real clock, and caps depth for beginners', () => {
    const c = LEVELS.find((l) => l.id === 'beginner')!.config;
    expect(goFor(c)).toEqual({ movetime: 200, depth: 2 });
    const timed = LEVELS.find((l) => l.id === 'club')!.config;
    expect(goFor(timed, { wtime: 1000, btime: 2000, winc: 0, binc: 0 })).toMatchObject({ wtime: 1000, btime: 2000 });
    expect(goFor({ ...timed, useClock: false })).toEqual({ movetime: 600, depth: undefined });
    expect(describeConfig(timed)).toMatch(/UCI_Elo 1600 \(engine-list scale\)/);
  });
});

describe('human-like opponent', () => {
  const line = (rank: number, cpv: number, uci: string) => ({ multipv: rank, score: { kind: 'cp' as const, cp: cpv }, depth: 12, pv: [uci] });
  const lines = [line(1, 100, 'e2e4'), line(2, 60, 'd2d4'), line(3, -20, 'g1f3'), line(4, -400, 'a2a3')];
  const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

  it('maps carefulness to a narrower, colder choice', async () => {
    const { humanParams } = await import('../src/lib/engine/human');
    expect(humanParams(20).temperature).toBeLessThan(humanParams(10).temperature);
    expect(humanParams(10).temperature).toBeLessThan(humanParams(0).temperature);
    expect(humanParams(20).maxLoss).toBeLessThan(humanParams(0).maxLoss);
  });

  it('almost always plays the best move when careful, and sometimes a worse one when careless', async () => {
    const { pickHumanMove } = await import('../src/lib/engine/human');
    const rnd = seeded(7);
    const careful = Array.from({ length: 400 }, () => pickHumanMove(lines, 'w', 20, rnd)!);
    const careless = Array.from({ length: 400 }, () => pickHumanMove(lines, 'w', 0, rnd)!);
    expect(careful.filter((c) => c.rank === 1).length).toBeGreaterThan(390);
    const worse = careless.filter((c) => c.rank !== 1).length;
    expect(worse).toBeGreaterThan(100);
    // Never the move that loses a piece for nothing (-400 is far outside the band even when careless).
    expect(careless.every((c) => c.uci !== 'a2a3')).toBe(true);
  });

  it('reads scores from the mover side and copes with one candidate or none', async () => {
    const { pickHumanMove } = await import('../src/lib/engine/human');
    // For Black a lower White score is better, so rank 4 (-400) would be best for Black if it were ranked first.
    expect(pickHumanMove([line(1, -400, 'a7a6'), line(2, 100, 'e7e5')], 'b', 20, () => 0)!.uci).toBe('a7a6');
    expect(pickHumanMove([line(1, 0, 'e2e4')], 'w', 0)!.uci).toBe('e2e4');
    expect(pickHumanMove([], 'w', 0)).toBeNull();
  });

  it('is described, named and sanitised like any other opponent', async () => {
    const { describeConfig, sanitizeConfig, optionsFor } = await import('../src/lib/engine/strength');
    const cfg = sanitizeConfig({ mode: 'human', skill: 9 });
    expect(cfg.mode).toBe('human');
    expect(describeConfig(cfg)).toMatch(/Human-like/);
    expect(optionsFor(cfg)).toEqual({ UCI_LimitStrength: false, 'Skill Level': 20 });
  });
});
