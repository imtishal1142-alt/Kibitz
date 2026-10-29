import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../src/lib/engine/engine';
import { analyzeGame, evalSeries, evaluatePosition, gameRecommendations, memoryEvalCache } from '../src/lib/analysis/gameAnalysis';
import { explainMove } from '../src/lib/analysis/explain';
import { describeMove, enPrise, pawnStructure, whatItDoes } from '../src/lib/analysis/tactics';
import { classifyByLoss, classifyMove } from '../src/lib/chess/classify';
import { cp, cpToWinPct, formatScore, forMover, mate, moveAccuracy, uciToWhite, winPct } from '../src/lib/chess/eval';
import { detectOpening, loadOpenings } from '../src/lib/chess/openings';
import { parsePgn } from '../src/lib/chess/rules';
import { gameFromPgn } from '../src/lib/games/records';
import { Chess } from 'chess.js';
import { nodeStockfishFactory } from './helpers/nodeEngine';

const pgn = (moves: string, extra = '') => `[Event "t"]\n[White "Me"]\n[Black "Opp"]\n[Result "*"]\n${extra}\n${moves} *`;

describe('evaluation math', () => {
  it('converts perspective consistently', () => {
    expect(uciToWhite(cp(50), 'w')).toEqual(cp(50));
    expect(uciToWhite(cp(50), 'b')).toEqual(cp(-50));
    expect(uciToWhite(mate(3), 'b')).toEqual(mate(-3));
    expect(forMover(cp(120), 'b')).toEqual(cp(-120));
  });
  it('maps centipawns to win chance symmetrically', () => {
    expect(cpToWinPct(0)).toBeCloseTo(50, 5);
    expect(cpToWinPct(300) + cpToWinPct(-300)).toBeCloseTo(100, 5);
    expect(cpToWinPct(100)).toBeGreaterThan(55);
    expect(winPct(mate(2))).toBe(100);
    expect(winPct(mate(-2))).toBe(0);
  });
  it('formats scores', () => {
    expect(formatScore(cp(35))).toBe('+0.35');
    expect(formatScore(cp(-120))).toBe('-1.20');
    expect(formatScore(cp(0))).toBe('0.00');
    expect(formatScore(mate(3))).toBe('+#3');
    expect(formatScore(mate(-2))).toBe('-#2');
  });
  it('gives full accuracy for no loss and less for big losses', () => {
    expect(moveAccuracy(0)).toBeGreaterThan(99);
    expect(moveAccuracy(30)).toBeLessThan(35);
    expect(moveAccuracy(5)).toBeGreaterThan(moveAccuracy(15));
  });
});

describe('move classification thresholds', () => {
  it('maps win-percentage loss to categories', () => {
    expect(classifyByLoss(0, true)).toBe('best');
    expect(classifyByLoss(0.4, false)).toBe('best');
    expect(classifyByLoss(1.5, false)).toBe('excellent');
    expect(classifyByLoss(4, false)).toBe('good');
    expect(classifyByLoss(8, false)).toBe('inaccuracy');
    expect(classifyByLoss(15, false)).toBe('mistake');
    expect(classifyByLoss(35, false)).toBe('blunder');
  });
  it('does not blame a lost position as hard as an equal one for the same centipawn slip', () => {
    const equal = classifyMove({ color: 'w', evalBefore: cp(0), evalAfter: cp(-150), playedIsBest: false, legalMoveCount: 30 });
    const lost = classifyMove({ color: 'w', evalBefore: cp(-900), evalAfter: cp(-1050), playedIsBest: false, legalMoveCount: 30 });
    expect(equal.winLoss).toBeGreaterThan(lost.winLoss * 5);
    expect(equal.cls).toBe('mistake');
    expect(['best', 'excellent']).toContain(lost.cls);
  });
  it('flags missed and allowed mates and forced moves', () => {
    const missed = classifyMove({ color: 'w', evalBefore: mate(2), evalAfter: cp(300), playedIsBest: false, legalMoveCount: 30 });
    expect(missed.flags).toContain('missed-mate');
    const allowed = classifyMove({ color: 'w', evalBefore: cp(50), evalAfter: mate(-1), playedIsBest: false, legalMoveCount: 30 });
    expect(allowed.flags).toContain('allowed-mate');
    expect(allowed.cls).toBe('blunder');
    expect(classifyMove({ color: 'b', evalBefore: cp(0), evalAfter: cp(500), playedIsBest: false, legalMoveCount: 1 }).cls).toBe('forced');
  });
  it('works for Black (perspective)', () => {
    const c = classifyMove({ color: 'b', evalBefore: cp(0), evalAfter: cp(400), playedIsBest: false, legalMoveCount: 20 });
    expect(c.winLoss).toBeGreaterThan(25);
    expect(c.cls).toBe('blunder');
  });
});

describe('board facts (tactics)', () => {
  it('finds hanging pieces', () => {
    const c = new Chess('4k3/8/8/3n4/8/8/8/R3K3 w - - 0 1'); // black knight d5 undefended, no attacker -> not en prise
    expect(enPrise(c, 'b')).toHaveLength(0);
    const c2 = new Chess('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1'); // pawn e4 attacks d5
    expect(enPrise(c2, 'b').map((e) => e.square)).toEqual(['d5']);
  });
  it('detects forks, pins and mate', () => {
    // Knight to c7 forks king e8 and rook a8 (and queen d5)
    const fork = describeMove('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'd5c7');
    expect(fork?.check).toBe(true);
    expect(fork?.fork?.map((f) => f.square).sort()).toEqual(['a8', 'e8']);
    // Bishop e2-b5 pins the knight on c6 to the king on e8
    const pin = describeMove('4k3/8/2n5/8/8/8/4B3/4K3 w - - 0 1', 'e2b5');
    expect(pin?.pins[0]?.pinned.square).toBe('c6');
    expect(pin?.pins[0]?.behind.square).toBe('e8');
    expect(whatItDoes(pin!).join(' ')).toMatch(/pins the knight on c6/);
    const mateFacts = describeMove('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8');
    expect(mateFacts?.mate).toBe(true);
    expect(mateFacts?.backRankMate).toBe(true);
    expect(whatItDoes(mateFacts!).join(' ')).toMatch(/back rank/);
  });
  it('detects a skewer and a discovered attack', () => {
    // Rook to e1 checks the king on e5, with the queen on e8 behind it.
    const skewer = describeMove('4q3/8/8/4k3/8/8/8/R5K1 w - - 0 1', 'a1e1');
    expect(skewer?.skewers).toHaveLength(1);
    expect(skewer?.skewers[0]?.front.square).toBe('e5');
    expect(skewer?.skewers[0]?.behind.square).toBe('e8');
    // The knight steps off the e-file and uncovers the rook's attack on the queen.
    const disc = describeMove('4q1k1/8/8/8/4N3/8/8/4R1K1 w - - 0 1', 'e4c5');
    expect(disc?.discovered).toEqual([{ target: 'e8', piece: 'q', by: 'e1' }]);
  });
  it('counts pawn weaknesses', () => {
    expect(pawnStructure('4k3/8/8/8/8/2P5/2P3P1/4K3 w - - 0 1', 'w')).toEqual({ doubled: 1, isolated: 3 });
  });
});

describe('opening recognition', () => {
  it('names openings by position, independent of move order', async () => {
    await loadOpenings();
    const a = parsePgn(pgn('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6'));
    expect(detectOpening(a.fens)?.name).toMatch(/Sicilian Defense: Najdorf/);
    // Two move orders for the same Nimzo-Indian position: the final position is what gets named.
    const b = parsePgn(pgn('1. d4 Nf6 2. c4 e6 3. Nc3 Bb4'));
    const c = parsePgn(pgn('1. c4 e6 2. Nc3 Nf6 3. d4 Bb4'));
    const nb = detectOpening(b.fens);
    const nc = detectOpening(c.fens);
    expect(nb?.name).toMatch(/Nimzo-Indian/);
    expect(nc?.name).toBe(nb?.name);
    expect(nc?.plies).toBe(6);
    expect(detectOpening(parsePgn(pgn('1. a3 a6')).fens)?.eco).toBeDefined();
  });
});

describe('full-game analysis with the real engine', () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await Engine.start(nodeStockfishFactory());
  });
  afterAll(() => engine.dispose());

  it('analyses a game, detects the planted blunder and explains it with verified lines', async () => {
    // 3.Qxe5+?? loses the queen to Nxe5.
    const game = gameFromPgn(pgn('1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5'), { source: 'pgn', userName: 'Me' });
    expect(game.userColor).toBe('w');
    const cache = memoryEvalCache();
    const progress: number[] = [];
    const a = await analyzeGame(game, engine, { depth: 11, multipv: 2, cache, onProgress: (p) => progress.push(p.done) });
    expect(a).not.toBeNull();
    expect(a!.positions).toHaveLength(7);
    expect(a!.moves).toHaveLength(6);
    expect(progress.at(-1)).toBe(7);
    const blunder = a!.moves[4]!; // 3.Qxe5+
    expect(blunder.san).toBe('Qxe5+');
    expect(blunder.cls).toBe('blunder');
    expect(blunder.bestSan).toBeTruthy();
    expect(blunder.bestSan).not.toBe('Qxe5+');
    const ex = explainMove(blunder, a!);
    expect(ex.verified).toBe(true);
    expect(['hanging-piece', 'poor-exchange']).toContain(ex.category);
    expect(ex.evidence.refutation[0]).toBe('Nxe5');
    expect(ex.paragraphs.join(' ')).toMatch(/Nxe5/);
    // A second run is served from the cache for every position.
    const before = cache.size();
    const again = await analyzeGame(game, engine, { depth: 11, multipv: 2, cache });
    expect(cache.size()).toBe(before);
    expect(again!.moves[4]!.cls).toBe('blunder');
    expect(evalSeries(a!)).toHaveLength(7);
    expect(gameRecommendations(a!, 'w').join(' ')).toMatch(/blunder/);
  });

  it('detects an allowed mate (Scholar\'s mate) and a missed mate', async () => {
    const allowed = gameFromPgn(pgn('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#'), { source: 'pgn', userName: 'Opp' });
    const a1 = (await analyzeGame(allowed, engine, { depth: 10, multipv: 2 }))!;
    const nf6 = a1.moves[5]!;
    expect(nf6.san).toBe('Nf6');
    expect(nf6.flags).toContain('allowed-mate');
    expect(nf6.cls).toBe('blunder');
    const ex = explainMove(nf6, a1);
    expect(ex.category).toBe('mate-threat');
    expect(ex.evidence.refutation[0]).toBe('Qxf7#');
    expect(a1.positions.at(-1)!.terminal).toBe('checkmate');

    const missed = gameFromPgn(pgn('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. d3'), { source: 'pgn', userName: 'Me' });
    const a2 = (await analyzeGame(missed, engine, { depth: 10, multipv: 2 }))!;
    const d3 = a2.moves[6]!;
    expect(d3.flags).toContain('missed-mate');
    expect(d3.bestSan).toBe('Qxf7#');
    expect(explainMove(d3, a2).category).toBe('missed-tactic');
  });

  it('can be cancelled', async () => {
    const game = gameFromPgn(pgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7'), { source: 'pgn', userName: 'Me' });
    const ac = new AbortController();
    const p = analyzeGame(game, engine, { depth: 14, multipv: 1, signal: ac.signal, onProgress: (x) => x.done === 2 && ac.abort() });
    expect(await p).toBeNull();
    // engine remains usable
    const ok = await engine.search({ depth: 5 });
    expect(ok.cancelled).toBe(false);
  });
});

describe('evaluation cache reuse rules', () => {
  const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
  /** A stand-in engine that records how often it is asked to search. */
  const fake = (name: string, tag = '') => {
    const calls: { depth: number; multipv: number }[] = [];
    const engine = {
      info: { name },
      tag,
      search: async (req: { depth: number; multipv: number }) => {
        calls.push({ depth: req.depth, multipv: req.multipv });
        const lines = Array.from({ length: req.multipv }, (_, i) => ({ multipv: i + 1, score: cp(20 - i), depth: req.depth, pv: ['e7e5'] }));
        return { depth: req.depth, lines, cancelled: false };
      },
    };
    return { engine: engine as unknown as Engine, calls };
  };

  it('reuses a stored result that is at least as deep and has at least as many lines', async () => {
    const cache = memoryEvalCache();
    const a = fake('Stockfish 19');
    await evaluatePosition(a.engine, FEN, { depth: 14, multipv: 2, cache });
    await evaluatePosition(a.engine, FEN, { depth: 12, multipv: 1, cache });
    await evaluatePosition(a.engine, FEN, { depth: 14, multipv: 2, cache });
    expect(a.calls).toHaveLength(1);
  });

  it('searches again when the stored result is shallower or has fewer lines', async () => {
    const cache = memoryEvalCache();
    const a = fake('Stockfish 19');
    await evaluatePosition(a.engine, FEN, { depth: 10, multipv: 1, cache });
    await evaluatePosition(a.engine, FEN, { depth: 14, multipv: 1, cache });
    expect(a.calls).toHaveLength(2);
    await evaluatePosition(a.engine, FEN, { depth: 14, multipv: 3, cache });
    expect(a.calls).toHaveLength(3);
    // After the deeper, wider search the earlier requests are served from the cache.
    await evaluatePosition(a.engine, FEN, { depth: 10, multipv: 2, cache });
    expect(a.calls).toHaveLength(3);
  });

  it('never reuses another engine build\'s result (the build is part of the key)', async () => {
    const cache = memoryEvalCache();
    const lite = fake('Stockfish 19', 'lite-wasm');
    const full = fake('Stockfish 19', 'full-wasm');
    await evaluatePosition(lite.engine, FEN, { depth: 12, multipv: 1, cache });
    await evaluatePosition(full.engine, FEN, { depth: 12, multipv: 1, cache });
    expect(lite.calls).toHaveLength(1);
    expect(full.calls).toHaveLength(1);
    expect(cache.size()).toBe(2);
  });

  it('decides finished games by the rules without searching or caching', async () => {
    const cache = memoryEvalCache();
    const a = fake('Stockfish 19');
    const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    const r = await evaluatePosition(a.engine, mated, { depth: 14, multipv: 1, cache });
    expect(r?.terminal).toBe('checkmate');
    expect(a.calls).toHaveLength(0);
    expect(cache.size()).toBe(0);
  });
});
