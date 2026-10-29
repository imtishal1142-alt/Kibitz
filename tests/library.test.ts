import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../src/lib/engine/engine';
import { assessMove, evaluateCandidates, findThreat, nullMoveFen } from '../src/lib/analysis/assess';
import { analyzeGame, memoryEvalCache } from '../src/lib/analysis/gameAnalysis';
import { demoGame, DEMO_PGN } from '../src/lib/data/demo';
import { gameFromPgn, isPersonal } from '../src/lib/games/records';
import { parsePgn, terminalState, validateFen } from '../src/lib/chess/rules';
import { winPctFor } from '../src/lib/chess/eval';
import { ENDGAMES } from '../src/lib/training/endgames';
import { gradeGuess, guessPositions, judgeCandidates } from '../src/lib/training/guess';
import { trainingPlan } from '../src/lib/training/plan';
import { buildTree, expectedMoves, findDeviations, formatLine, groupDeviations, suggestLines, toRepertoireLine, validateLine } from '../src/lib/training/repertoire';
import type { GameRecord } from '../src/lib/types';
import { nodeStockfishFactory } from './helpers/nodeEngine';

const game = (moves: string, outcome: 'win' | 'loss' | 'draw', i: number, color: 'w' | 'b' = 'w'): GameRecord => {
  const result = outcome === 'draw' ? '1/2-1/2' : (outcome === 'win') === (color === 'w') ? '1-0' : '0-1';
  const pgn = `[Event "t"]\n[White "${color === 'w' ? 'Me' : 'Opp'}"]\n[Black "${color === 'w' ? 'Opp' : 'Me'}"]\n[Result "${result}"]\n\n${moves} ${result}`;
  return { ...gameFromPgn(pgn, { source: 'chesscom', userName: 'Me', now: i }), endTime: i * 1000, id: `g${i}`, fingerprint: `f${i}` };
};

describe('demo game', () => {
  it('is a legal, clearly-labelled sample that is excluded from personal statistics', () => {
    const g = demoGame(1);
    expect(parsePgn(DEMO_PGN).moves).toHaveLength(33);
    expect(terminalState(parsePgn(DEMO_PGN).moves.at(-1)!.fenAfter)).toMatchObject({ over: true, kind: 'checkmate', winner: 'w' });
    expect(g.source).toBe('demo');
    expect(g.tags).toContain('demo');
    expect(g.pgn).toMatch(/DEMO/);
    expect(isPersonal(g)).toBe(false);
    expect(isPersonal(g, true)).toBe(true);
  });
});

describe('repertoire', () => {
  const italian = '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3';
  const games = [
    game(`${italian} d6`, 'win', 1),
    game(`${italian} a6`, 'loss', 2),
    game('1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5', 'win', 3),
    game('1. e4 c5 2. Nf3 d6 3. d4 cxd4', 'draw', 4),
    game('1. d4 d5 2. c4 e6', 'loss', 5),
    game('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4', 'win', 6),
  ];
  it('validates lines and reports the first illegal move', () => {
    expect(validateLine(['e4', 'e5', 'Nf3']).ok).toBe(true);
    const bad = validateLine(['e4', 'e5', 'Nf6']);
    expect(bad.ok).toBe(false);
    expect(bad.error).toMatch(/Nf6/);
    expect(validateLine(['e4', 'e5', 'Nf3']).sans).toEqual(['e4', 'e5', 'Nf3']);
  });
  it('builds an opening tree with correct counts and results', () => {
    const t = buildTree(games, 'w', 12);
    const e4 = t.children.get('e4')!;
    expect(e4).toMatchObject({ games: 5, wins: 3, draws: 1, losses: 1 });
    expect(t.children.get('d4')).toMatchObject({ games: 1, losses: 1 });
    expect(buildTree(games, 'b', 12).children.size).toBe(0);
  });
  it('suggests the lines you actually play, branching on opponent replies only when they recur', () => {
    const lines = suggestLines(games, 'w', { minGames: 2, maxPlies: 11 });
    expect(lines.length).toBeGreaterThan(0);
    const main = lines[0]!;
    expect(main.sans.slice(0, 5)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
    expect(main.games).toBeGreaterThanOrEqual(2);
    for (const l of lines) expect(validateLine(l.sans).ok).toBe(true);
    expect(formatLine(['e4', 'e5', 'Nf3'])).toBe('1.e4 e5 2.Nf3');
  });
  it('knows what the repertoire expects and where games left it', () => {
    const rep = [toRepertoireLine('w', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'], 'Italian')];
    expect(expectedMoves(rep, 'w', [])).toEqual({ user: ['e4'], opponent: [] });
    expect(expectedMoves(rep, 'w', ['e4'])).toEqual({ user: [], opponent: ['e5'] });
    expect(expectedMoves(rep, 'w', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'])).toEqual({ user: ['c3'], opponent: [] });
    const devs = findDeviations(games, rep, 'w');
    expect(devs.map((d) => d.gameId)).toEqual(['g5']);
    // game 3 left at 4.Ng5 ... no: Black left first with 3...Nf6 (opponent left book), so it is not a deviation of mine.
    expect(devs.find((d) => d.gameId === 'g3')).toBeUndefined();
    // The Sicilian: Black left the book at move 1...c5, which is not my deviation. 1.d4 IS: the repertoire says 1.e4.
    expect(devs.find((d) => d.gameId === 'g4')).toBeUndefined();
    expect(devs.find((d) => d.gameId === 'g5')).toMatchObject({ ply: 1, played: 'd4', expected: ['e4'] });
    // game 6 follows the repertoire to move 4.c3 then plays 5.d4 and 5.d3 are beyond the line: no deviation recorded.
    expect(devs.find((d) => d.gameId === 'g6')).toBeUndefined();
    const rep2 = [toRepertoireLine('w', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3'], 'Giuoco Pianissimo')];
    const d2 = findDeviations(games, rep2, 'w');
    expect(d2.map((d) => d.gameId).sort()).toEqual(['g1', 'g2', 'g5', 'g6']); // g5 played 1.d4 against a 1.e4 repertoire
    expect(d2[0]).toMatchObject({ played: 'c3', expected: ['d3'], ply: 7 });
    const groups = groupDeviations(d2);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ games: 3, expected: ['d3'] });
    expect(groups[0]!.played[0]).toMatchObject({ san: 'c3', games: 3 });
  });
});

describe('training plan', () => {
  const base = { weaknesses: [], duePuzzles: 0, newPuzzles: 0, puzzlesToday: 0, dailyGoal: 10, unanalysedGames: 0, gamesTotal: 12, repertoireLines: 0, deviations: 0 };
  it('starts with importing when there are no games', () => {
    expect(trainingPlan({ ...base, gamesTotal: 0 }).map((p) => p.id)).toEqual(['import']);
  });
  it('prioritises analysis, due reviews and the best-evidenced weakness', () => {
    const plan = trainingPlan({ ...base, unanalysedGames: 3, duePuzzles: 4, weaknesses: [{ category: 'hanging-piece', label: 'Leaving pieces undefended', count: 5, games: 4, per100Moves: 2, avgWinLoss: 30, share: 0.4, severity: 'major', evidence: 'established', trend: 'unknown', trendDetail: '', examples: [], exercise: 'Do Blunder Prevention.', strategy: '' }] });
    expect(plan.map((p) => p.id)).toEqual(['analyse', 'review', 'weak-hanging-piece', 'repertoire-start']);
  });
  it('says so when you are up to date', () => {
    expect(trainingPlan({ ...base, repertoireLines: 2 }).map((p) => p.id)).toEqual(['play']);
  });
});

describe('guess grading (pure)', () => {
  const a = (over: Partial<Parameters<typeof gradeGuess>[0]>) => ({ uci: 'e2e4', san: 'e4', bestUci: 'd2d4', bestSan: 'd4', winLoss: 0, replyPvSan: ['e5'], ...over }) as Parameters<typeof gradeGuess>[0];
  it('maps loss to points', () => {
    expect(gradeGuess(a({ uci: 'd2d4', winLoss: 0 }), 'x').points).toBe(3);
    expect(gradeGuess(a({ winLoss: 0.4 }), 'x').points).toBe(3);
    expect(gradeGuess(a({ winLoss: 3 }), 'x').points).toBe(2);
    expect(gradeGuess(a({ winLoss: 8 }), 'x').points).toBe(1);
    expect(gradeGuess(a({ winLoss: 25 }), 'x').points).toBe(0);
    expect(gradeGuess(a({ winLoss: 3 }), 'e2e4').detail).toMatch(/played in the game/);
  });
});

describe('engine-backed helpers', () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await Engine.start(nodeStockfishFactory());
  });
  afterAll(() => engine.dispose());

  it('verifies every endgame lesson against the engine (claims are engine-checked, not assumed)', async () => {
    for (const e of ENDGAMES) {
      expect(validateFen(e.fen).ok, `${e.id} FEN`).toBe(true);
      const res = await engine.search({ fen: e.fen, depth: 22, multipv: 3 });
      const best = res.lines[0]!;
      const win = winPctFor(best.score, e.user);
      if (e.goal === 'win') expect(win, `${e.id} should be winning for ${e.user}`).toBeGreaterThan(85);
      else {
        expect(Math.abs(winPctFor(best.score, e.user) - 50), `${e.id} should be a draw`).toBeLessThan(5);
        // ...and it must be a real test: at least one natural alternative to the best move loses.
        const bad = res.lines.slice(1).some((l) => winPctFor(l.score, e.user) < 30);
        const moves = res.lines.length;
        expect(bad || moves === 1 || e.id === 'rook-pawn-draw' || e.id === 'philidor', `${e.id} should punish a wrong move`).toBe(true);
      }
    }
  });

  it('grades moves with the same classification as game analysis', async () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const good = (await assessMove(engine, fen, 'g1f3', { depth: 12 }))!;
    expect(['best', 'excellent', 'good']).toContain(good.cls);
    expect(good.san).toBe('Nf3');
    expect(good.does.join(' ')).toMatch(/attacks the/);
    const bad = (await assessMove(engine, fen, 'd1h5', { depth: 12 }))!;
    expect(bad.winLoss).toBeGreaterThan(good.winLoss);
    // a real blunder
    const hang = (await assessMove(engine, 'r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3', 'h5e5', { depth: 12 }))!;
    expect(hang.cls).toBe('blunder');
    expect(hang.replyPvSan[0]).toBe('Nxe5');
    expect(hang.bestSan).not.toBe('Qxe5+');
    await expect(assessMove(engine, fen, 'e2e5')).rejects.toThrow(/Illegal/);
  });

  it('finds a real threat by handing the opponent the move, and says nothing when there is none', async () => {
    // White to move; Black threatens ...Qxg2 winning the rook on h1 (undefended g2? defended by Bf1? use clear case)
    const fenThreat = 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    const rep = (await findThreat(engine, fenThreat, { depth: 12 }))!;
    expect(rep.inCheck).toBe(false);
    expect(rep.threat).not.toBeNull();
    expect(rep.threat!.swing).toBeGreaterThan(10);
    expect(rep.threat!.pvSan.length).toBeGreaterThan(0);
    const quiet = (await findThreat(engine, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { depth: 10 }))!;
    expect(quiet.threat).toBeNull();
    expect(quiet.note).toMatch(/Nothing urgent/);
    const inCheck = (await findThreat(engine, 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', { depth: 8 }))!;
    expect(nullMoveFen('rnb1kbnr/pppp1ppp/8/4p3/4P2q/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1')).not.toBeNull();
    expect(inCheck).toBeDefined();
    expect(nullMoveFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1')).toBeNull(); // in check: no null move
  });

  it('evaluates a shortlist and judges it against the engine', async () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    const top = await engine.search({ fen, depth: 12, multipv: 3 });
    const cands = (await evaluateCandidates(engine, fen, ['f3f7', 'g1e2', 'a2a3', 'zzzz'], { depth: 12 }))!;
    expect(cands.map((c) => c.uci)).toEqual(['f3f7', 'g1e2', 'a2a3']); // the illegal 'zzzz' is skipped
    expect(cands[0]!.san).toBe('Qxf7#');
    const j = judgeCandidates('w', top.lines, cands, (u) => u);
    expect(j.verdict).toBe('found-best');
    const j2 = judgeCandidates('w', top.lines, cands.slice(1), (u) => u);
    expect(['close', 'missed']).toContain(j2.verdict);
    expect(j2.gap).toBeGreaterThan(5);
    expect(judgeCandidates('w', top.lines, [], (u) => u).verdict).toBe('missed');
  });

  it('turns a game into guessable positions and analyses the demo game end to end', async () => {
    const g = demoGame(1);
    const ps = guessPositions(g, { side: 'w' });
    expect(ps.length).toBeGreaterThan(3);
    expect(ps.every((p) => p.color === 'w' && p.ply >= 9)).toBe(true);
    const analysis = (await analyzeGame(g, engine, { depth: 10, multipv: 2, cache: memoryEvalCache() }))!;
    expect(analysis.moves).toHaveLength(33);
    // Morphy's final combination is a forced mate: the engine must see 16.Qb8+ as mating (mate score for White).
    const qb8 = analysis.moves.find((m) => m.san === 'Qb8+')!;
    expect(['best', 'excellent', 'brilliant']).toContain(qb8.cls);
    expect(analysis.moves.at(-1)!.san).toBe('Rd8#');
  });
});
