import { describe, expect, it } from 'vitest';
import {
  START_FEN,
  buildPgn,
  extractClocks,
  fenKey,
  findIllegality,
  formatClock,
  materialCount,
  parsePgn,
  parseTimeControl,
  phaseOf,
  resolveMove,
  splitPgn,
  terminalState,
  timeClassOf,
  uciLineToSan,
  validateFen,
} from '../src/lib/chess/rules';

const OPERA = `[Event "Paris"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

describe('PGN parsing', () => {
  it('parses a complete game and tracks FEN before/after each move', () => {
    const g = parsePgn(OPERA);
    expect(g.moves).toHaveLength(33);
    expect(g.fens).toHaveLength(34);
    expect(g.result).toBe('1-0');
    expect(g.moves[0]).toMatchObject({ san: 'e4', uci: 'e2e4', color: 'w', ply: 1 });
    expect(g.moves[0]!.fenBefore).toBe(START_FEN);
    expect(g.moves[32]).toMatchObject({ san: 'Rd8#', color: 'w' });
    expect(terminalState(g.fens[33]!)).toEqual({ over: true, kind: 'checkmate', winner: 'w' });
  });
  it('rejects garbage and illegal movetext', () => {
    expect(() => parsePgn('1. e4 e5 2. Ke3 Ke6 3. Kxe5')).toThrow();
    expect(() => parsePgn('not a pgn at all')).toThrow();
    expect(() => parsePgn('1. e4 e5 2. Qh5 Nc6 3. Qxf7# 1-0')).not.toThrow();
  });
  it('extracts Chess.com style clock comments in move order', () => {
    const pgn = `[Event "x"]\n[Result "*"]\n\n1. e4 {[%clk 0:09:58.7]} 1... e5 {[%clk 0:09:57.2]} 2. Nf3 {[%clk 0:09:50]} (2. Nc3 {[%clk 0:00:01]}) 2... Nc6 {[%clk 1:00:00.0]} *`;
    expect(extractClocks(pgn)).toEqual([598_700, 597_200, 590_000, 3_600_000]);
    const g = parsePgn(pgn);
    expect(g.moves.map((m) => m.clockMs)).toEqual([598_700, 597_200, 590_000, 3_600_000]);
  });
  it('splits multi-game files', () => {
    const two = `${OPERA}\n\n[Event "Second"]\n[White "A"]\n[Black "B"]\n[Result "*"]\n\n1. d4 d5 *\n`;
    expect(splitPgn(two)).toHaveLength(2);
    expect(splitPgn('')).toHaveLength(0);
  });
  it('honours the FEN header for non-standard starts', () => {
    const pgn = `[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Kd7 *`;
    const g = parsePgn(pgn);
    expect(g.startFen).toBe('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    expect(g.moves).toHaveLength(2);
  });
});

describe('legal move handling', () => {
  it('rejects illegal moves and accepts SAN or UCI', () => {
    expect(resolveMove(START_FEN, 'e2e5')).toBeNull();
    expect(resolveMove(START_FEN, 'Ke2')).toBeNull();
    expect(resolveMove(START_FEN, 'e4')).toMatchObject({ san: 'e4', uci: 'e2e4' });
    expect(resolveMove(START_FEN, 'g1f3')).toMatchObject({ san: 'Nf3' });
  });
  it('handles castling, en passant and promotion', () => {
    const castle = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
    expect(resolveMove(castle, 'e1g1')).toMatchObject({ san: 'O-O' });
    expect(resolveMove(castle, 'e1c1')).toMatchObject({ san: 'O-O-O' });
    const ep = 'rnbqkbnr/ppp1pppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 3';
    expect(resolveMove(ep, 'd4e3')).toMatchObject({ san: 'dxe3', captured: 'p' });
    const promo = '8/P6k/8/8/8/8/8/K7 w - - 0 1';
    expect(resolveMove(promo, 'a7a8q')).toMatchObject({ san: 'a8=Q' });
    expect(resolveMove(promo, 'a7a8n')).toMatchObject({ san: 'a8=N' });
    expect(resolveMove(promo, 'a7a8')).toBeNull(); // promotion piece required
  });
  it('validates engine lines move by move', () => {
    const ok = uciLineToSan(START_FEN, ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
    expect(ok).toMatchObject({ valid: true, sans: ['e4', 'e5', 'Nf3', 'Nc6'] });
    const bad = uciLineToSan(START_FEN, ['e2e4', 'e7e5', 'e4e6']);
    expect(bad.valid).toBe(false);
    expect(bad.sans).toEqual(['e4', 'e5']);
  });
});

describe('game end detection', () => {
  it('detects checkmate, stalemate and insufficient material', () => {
    expect(terminalState('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3')).toEqual({ over: true, kind: 'checkmate', winner: 'b' });
    expect(terminalState('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toEqual({ over: true, kind: 'stalemate' });
    expect(terminalState('8/8/8/4k3/8/8/3K4/8 w - - 0 1')).toEqual({ over: true, kind: 'insufficient' });
    expect(terminalState(START_FEN)).toEqual({ over: false });
  });
});

describe('FEN validation', () => {
  it('accepts the start position and 4-field FENs', () => {
    expect(validateFen(START_FEN).ok).toBe(true);
    expect(validateFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -').ok).toBe(true);
  });
  it('rejects malformed and impossible positions with a reason', () => {
    expect(validateFen('').ok).toBe(false);
    expect(validateFen('hello world').ok).toBe(false);
    expect(validateFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN w KQkq - 0 1').error).toBeTruthy();
    // side not to move is in check
    const r = validateFen('4k3/8/8/8/8/8/3q4/4K3 b - - 0 1');
    expect(r.ok).toBe(false);
    expect(findIllegality('4k3/8/8/8/8/8/3q4/4K3 b - - 0 1')).toMatch(/in check/);
    // pawn on back rank
    expect(validateFen('P3k3/8/8/8/8/8/8/4K3 w - - 0 1').ok).toBe(false);
  });
  it('rejects impossible material that crashes the real engine (found by running Stockfish on it)', () => {
    // a third knight next to eight pawns (17 pieces): the bundled Stockfish exits with code 1
    expect(validateFen('rnbqkbnr/pppppppp/2n5/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').error).toMatch(/17 pieces|extra pieces/);
    // nine pawns
    expect(validateFen('4k3/pppppppp/p7/8/8/8/8/4K3 w - - 0 1').error).toMatch(/9 pawns/);
    // promotions are fine when pawns are missing: a second queen with seven pawns is reachable
    expect(validateFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNQ w KQkq - 0 1').error).toMatch(/extra pieces/); // second queen but all eight pawns still home
    expect(validateFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPP1/RNBQKBNQ w KQkq - 0 1').ok).toBe(true);
    // many queens and no pawns: legal in theory (eight promotions)
    expect(validateFen('4k3/8/8/8/8/8/8/QQQQKQQQ w - - 0 1').ok).toBe(true);
  });
  it('keys positions without move counters', () => {
    expect(fenKey(START_FEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  });
});

describe('material, phase and time controls', () => {
  it('counts material', () => {
    expect(materialCount(START_FEN)).toMatchObject({ w: 39, b: 39, diff: 0 });
    expect(materialCount('4k3/8/8/8/8/8/8/Q3K3 w - - 0 1').diff).toBe(9);
  });
  it('classifies phases', () => {
    expect(phaseOf(START_FEN)).toBe('opening');
    expect(phaseOf('r4rk1/pp3ppp/2n5/3q4/3P4/2N5/PP3PPP/R2Q1RK1 w - - 0 15')).toBe('middlegame');
    expect(phaseOf('8/5pk1/6p1/8/3R4/6P1/5PK1/8 w - - 0 40')).toBe('endgame');
  });
  it('parses time controls and classes', () => {
    expect(parseTimeControl('600+5')).toEqual({ base: 600, inc: 5 });
    expect(parseTimeControl('1/86400')).toEqual({ base: 86400, inc: 0, daily: true });
    expect(timeClassOf('60')).toBe('bullet');
    expect(timeClassOf('180')).toBe('blitz');
    expect(timeClassOf('180+2')).toBe('blitz');
    expect(timeClassOf('600')).toBe('rapid');
    expect(timeClassOf('1/86400')).toBe('daily');
    expect(timeClassOf(undefined)).toBe('unknown');
  });
  it('formats clocks', () => {
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(formatClock(4_300)).toBe('0:04.3');
    expect(formatClock(undefined)).toBe('--:--');
  });
});

describe('PGN building', () => {
  it('round-trips a played game with clocks and validates moves', () => {
    const ucis = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
    const pgn = buildPgn({ headers: { White: 'Me', Black: 'Stockfish', TimeControl: '300+0' }, ucis, result: '*', clocks: [299_000, 298_000, 297_500, 296_000] });
    const g = parsePgn(pgn);
    expect(g.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(g.headers['White']).toBe('Me');
    expect(g.moves.map((m) => m.clockMs)).toEqual([299_000, 298_000, 297_500, 296_000]);
    expect(() => buildPgn({ headers: {}, ucis: ['e2e5'], result: '*' })).toThrow();
  });
});
