import 'fake-indexeddb/auto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Engine } from '../src/lib/engine/engine';
import { analyzeGame, memoryEvalCache } from '../src/lib/analysis/gameAnalysis';
import { detectWeaknesses } from '../src/lib/analysis/weaknesses';
import { gameFromPgn } from '../src/lib/games/records';
import { checkPuzzleMove, generatePuzzles, puzzleHints } from '../src/lib/training/puzzles';
import { BOX_DAYS, buildDailySet, DAY, nextSrs, puzzleStats, updateRatings } from '../src/lib/training/srs';
import { backtest, buildStrengthReport, estimateFromResults, qualityImpliedRating } from '../src/lib/strength/estimate';
import type { ResultSample } from '../src/lib/strength/estimate';
import { isLegalUci, uciLineToSan, terminalState } from '../src/lib/chess/rules';
import { clearAllData } from '../src/lib/storage/backup';
import { addAttempt, addGames, getSrs, listAttempts, listPuzzles, putPuzzles, putSrs, saveAnalysis } from '../src/lib/storage/repos';
import type { GameAnalysis, GameRecord, PuzzleRecord, PuzzleSrs } from '../src/lib/types';
import { nodeStockfishFactory } from './helpers/nodeEngine';

const pgn = (moves: string, w = 'Me', b = 'Opp') => `[Event "t"]\n[White "${w}"]\n[Black "${b}"]\n[Result "*"]\n\n${moves} *`;

describe('spaced repetition and adaptive difficulty', () => {
  const base: PuzzleSrs = { puzzleId: 'p', box: 0, due: 0, attempts: 0, successes: 0, streak: 0 };
  it('promotes on success and resets on failure', () => {
    const now = 1_000_000_000;
    const a = nextSrs(base, true, 4000, now);
    expect(a).toMatchObject({ box: 1, attempts: 1, successes: 1, streak: 1, avgMs: 4000 });
    expect(a.due).toBe(now + BOX_DAYS[1]! * DAY);
    const b = nextSrs({ ...a, box: 4, streak: 3 }, false, 9000, now);
    expect(b).toMatchObject({ box: 0, streak: 0, attempts: 2 });
    expect(b.due).toBeLessThan(now + DAY);
    expect(nextSrs({ ...base, box: 5 }, true, 1, now).box).toBe(5);
  });
  it('moves ratings in the right direction', () => {
    expect(updateRatings(1200, 1200, true).user).toBeGreaterThan(1200);
    expect(updateRatings(1200, 1200, true).puzzle).toBeLessThan(1200);
    expect(updateRatings(1200, 1800, true).user - 1200).toBeGreaterThan(updateRatings(1200, 1000, true).user - 1200);
    expect(updateRatings(1200, 1200, false).user).toBeLessThan(1200);
  });
  const mk = (id: string, difficulty: number, theme = 'fork'): PuzzleRecord => ({ id, fen: '', sideToMove: 'w', solution: ['e2e4'], accepted: ['e2e4'], theme, themes: [theme], gameId: 'g', ply: 1, playedUci: '', playedSan: '', solutionSan: ['e4'], winBefore: 60, gap: 20, unique: true, difficulty, depth: 16, createdAt: 0 });
  it('builds a daily set: due reviews first, then unseen puzzles near the player\'s rating', () => {
    const now = 10 * DAY;
    const puzzles = [mk('old', 1500), mk('new1', 1210), mk('new2', 1900), mk('new3', 1190), mk('later', 1200)];
    const srs: PuzzleSrs[] = [
      { puzzleId: 'old', box: 1, due: now - 2 * DAY, attempts: 2, successes: 1, streak: 0 },
      { puzzleId: 'later', box: 3, due: now + 5 * DAY, attempts: 3, successes: 3, streak: 3 },
      ...['new1', 'new2', 'new3'].map((id) => ({ puzzleId: id, box: 0, due: 0, attempts: 0, successes: 0, streak: 0 })),
    ];
    const set = buildDailySet(puzzles, srs, 1200, now, 3);
    expect(set.ordered.map((p) => p.id)).toEqual(['old', 'new1', 'new3']);
    expect(set.ordered.map((p) => p.id)).not.toContain('later');
  });
  it('summarises attempts per theme with a streak', () => {
    const today = new Date(2026, 5, 10, 12);
    const at = (d: number) => new Date(2026, 5, d, 10).getTime();
    const attempts = [
      { puzzleId: 'a', at: at(10), ok: true, ms: 3000, hints: 0, revealed: false },
      { puzzleId: 'a', at: at(9), ok: false, ms: 5000, hints: 1, revealed: false },
      { puzzleId: 'b', at: at(8), ok: true, ms: 4000, hints: 0, revealed: false },
    ];
    const st = puzzleStats(attempts, [mk('a', 1200, 'fork'), mk('b', 1200, 'mate')], today);
    expect(st).toMatchObject({ attempts: 3, solved: 2, streakDays: 3 });
    expect(st.byTheme.find((t) => t.theme === 'fork')).toMatchObject({ attempts: 2, solved: 1, rate: 0.5 });
    expect(st.last7).toHaveLength(7);
  });
});

describe('strength estimation (statistics on SYNTHETIC data: this checks the maths, not real-world accuracy)', () => {
  function rng(seed: number) {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  }
  const normal = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  function simulate(rating: number, n: number, r: () => number, spread = 150): ResultSample[] {
    const out: ResultSample[] = [];
    for (let i = 0; i < n; i++) {
      const opp = Math.round(rating + normal(r) * spread);
      const p = 1 / (1 + 10 ** ((opp - rating) / 400));
      out.push({ opponent: opp, score: r() < p ? 1 : 0, at: i * 86_400_000 });
    }
    return out;
  }
  it('recovers a known rating and its 80% interval has roughly nominal coverage', () => {
    const r = rng(7);
    let covered = 0;
    let err = 0;
    const trials = 300;
    for (let t = 0; t < trials; t++) {
      const est = estimateFromResults(simulate(1450, 60, r), { halfLifeDays: 0 })!;
      if (est.low <= 1450 && 1450 <= est.high) covered++;
      err += Math.abs(est.rating - 1450);
    }
    const cov = covered / trials;
    expect(cov).toBeGreaterThan(0.7);
    expect(cov).toBeLessThan(0.92);
    expect(err / trials).toBeLessThan(70);
  });
  it('gives wider intervals for fewer games and never invents precision', () => {
    const r = rng(3);
    const small = estimateFromResults(simulate(1500, 8, r), { halfLifeDays: 0 })!;
    const large = estimateFromResults(simulate(1500, 150, r), { halfLifeDays: 0 })!;
    expect(small.high - small.low).toBeGreaterThan(2 * (large.high - large.low));
    expect(large.high - large.low).toBeGreaterThan(40);
  });
  it('stays finite for perfect and hopeless streaks', () => {
    const wins = estimateFromResults(Array.from({ length: 10 }, (_, i) => ({ opponent: 1500, score: 1, at: i })), { halfLifeDays: 0 })!;
    expect(Number.isFinite(wins.rating)).toBe(true);
    expect(wins.rating).toBeGreaterThan(1600);
    expect(wins.high - wins.low).toBeGreaterThan(150);
    expect(estimateFromResults([], {})).toBeNull();
  });
  it('weights recent games more', () => {
    const early = Array.from({ length: 30 }, (_, i) => ({ opponent: 1500, score: 0, at: i * 86_400_000 }));
    const late = Array.from({ length: 20 }, (_, i) => ({ opponent: 1500, score: 1, at: (400 + i) * 86_400_000 }));
    const flat = estimateFromResults([...early, ...late], { halfLifeDays: 0 })!;
    const recent = estimateFromResults([...early, ...late], { halfLifeDays: 60 })!;
    expect(recent.rating).toBeGreaterThan(flat.rating + 50);
  });
  const rec = (i: number, opp: number, outcome: 'win' | 'loss' | 'draw', userRating = 1500): GameRecord => ({ id: `g${i}`, source: 'chesscom', pgn: '', white: 'me', black: 'x', result: '1-0', date: '2026-01-01', endTime: i * 86_400_000, timeClass: 'rapid', plies: 40, tags: [], addedAt: 0, analyzed: 0, fingerprint: `f${i}`, userColor: 'w', opponentRating: opp, userRating, userOutcome: outcome, rules: 'chess' });
  it('backtests out of sample and reports baselines honestly', () => {
    const r = rng(11);
    const games = simulate(1500, 70, r).map((s, i) => rec(i, s.opponent, s.score === 1 ? 'win' : 'loss'));
    const bt = backtest(games)!;
    expect(bt.n).toBe(60);
    expect(bt.coinFlipBrier).toBeCloseTo(0.25, 5);
    expect(bt.modelBrier).toBeLessThan(0.27);
    expect(bt.officialBrier).not.toBeNull();
    expect(bt.description).toMatch(/Brier/);
    expect(backtest(games.slice(0, 12))).toBeNull();
  });
  it('quality-implied rating is unavailable without enough data and recovers a planted relationship with enough', () => {
    const r = rng(5);
    const make = (opp: number, myAvgLoss: number, theirAvgLoss: number) => {
      const moves = [];
      for (let i = 0; i < 40; i++) moves.push({ color: i % 2 ? 'b' : 'w', cls: 'good', winLoss: Math.max(0, (i % 2 ? theirAvgLoss : myAvgLoss) + normal(r) * 2) });
      return { game: rec(Math.floor(r() * 1e6), opp, 'win'), analysis: { moves } as unknown as GameAnalysis };
    };
    expect(qualityImpliedRating([make(1500, 5, 5)])).toMatchObject({ status: 'unavailable' });
    // Opponent move loss falls linearly with rating: 10 - 0.005*(R-1000). I play like a 1500.
    const lossAt = (R: number) => 10 - 0.005 * (R - 1000);
    const items = Array.from({ length: 60 }, () => {
      const opp = 1200 + Math.round(r() * 600);
      return make(opp, lossAt(1500), lossAt(opp));
    });
    const res = qualityImpliedRating(items);
    expect(res.status).toBe('ok');
    expect(Math.abs(res.rating! - 1500)).toBeLessThan(220);
    expect(res.low! <= res.rating! && res.rating! <= res.high!).toBe(true);
    // Opponents all the same strength: refuse rather than invent.
    const flat = Array.from({ length: 40 }, () => make(1500 + Math.round(r() * 20), 5, 5));
    expect(qualityImpliedRating(flat)).toMatchObject({ status: 'unavailable', reason: expect.stringMatching(/too close/) });
  });
  it('builds a report that keeps the official rating separate and discloses uncertainty', () => {
    const r = rng(21);
    const games = simulate(1500, 40, r).map((s, i) => rec(i, s.opponent, s.score === 1 ? 'win' : 'loss'));
    const rep = buildStrengthReport(games, new Map(), 'rapid', 1480, { now: 41 * 86_400_000 });
    expect(rep.official).toBe(1480);
    expect(rep.results!.rating).not.toBe(rep.official);
    expect(rep.results!.high).toBeGreaterThan(rep.results!.low);
    expect(rep.implied.status).toBe('unavailable');
    expect(rep.quality).toBeNull();
    expect(rep.notes.join(' ')).toMatch(/statistical estimate/);
    expect(buildStrengthReport(games.slice(0, 3), new Map(), 'rapid', undefined).results).toBeNull();
  });
});

describe('weaknesses and puzzles from real engine analysis', () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await Engine.start(nodeStockfishFactory());
  });
  afterAll(() => engine.dispose());
  beforeEach(async () => {
    await clearAllData();
  });

  const blunderGames = [
    '1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5',
    '1. e4 e5 2. Qf3 Nc6 3. Qxf7+ Kxf7',
    '1. e4 d5 2. Qh5 e6 3. Qxd5 exd5',
    '1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5 4. Nf3 Nxf3+',
    '1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5 4. d4 Ng6',
    '1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5 4. d4 Nc6',
  ];

  it('finds a recurring weakness across games with examples that link to real moves, and withholds claims on thin evidence', async () => {
    const cache = memoryEvalCache();
    const entries: { game: GameRecord; analysis: GameAnalysis }[] = [];
    for (const [i, m] of blunderGames.entries()) {
      const g = { ...gameFromPgn(pgn(m), { source: 'chesscom', userName: 'Me', now: 1000 + i }), endTime: 1_700_000_000_000 + i * 86_400_000 };
      const analysis = (await analyzeGame(g, engine, { depth: 10, multipv: 2, cache }))!;
      entries.push({ game: g, analysis });
    }
    const rep = detectWeaknesses(entries);
    expect(rep.gamesConsidered).toBe(6);
    const hang = rep.weaknesses.find((w) => w.category === 'hanging-piece');
    expect(hang).toBeDefined();
    expect(hang!.count).toBeGreaterThanOrEqual(3);
    expect(hang!.evidence).toBe('established');
    expect(hang!.trend).toBe('unknown'); // fewer than 9 games: no trend claimed
    // The evidence label always follows the documented rule: established needs >=4 occurrences in >=3 games.
    for (const w of rep.weaknesses) expect(w.evidence).toBe(w.count >= 4 && w.games >= 3 ? 'established' : 'tentative');
    for (const ex of hang!.examples) {
      const g = entries.find((e) => e.game.id === ex.gameId)!;
      const mv = g.analysis.moves.find((m) => m.ply === ex.ply)!;
      expect(mv.san).toBe(ex.san);
      expect(['mistake', 'blunder']).toContain(mv.cls);
    }
    // One lonely mistake is not a "pattern".
    const single = detectWeaknesses([entries[0]!]);
    expect(single.weaknesses).toHaveLength(0);
    expect(single.note).toMatch(/first impression/);
  });

  it('generates verified puzzles from a missed mate, persists them, and checks answers', async () => {
    const g = gameFromPgn(pgn('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. d3'), { source: 'chesscom', userName: 'Me' });
    await addGames([g]);
    const analysis = (await analyzeGame(g, engine, { depth: 11, multipv: 2 }))!;
    await saveAnalysis(analysis);
    const res = await generatePuzzles(engine, [{ game: g, analysis }], { depth: 14, existingIds: new Set() });
    expect(res.puzzles.length).toBeGreaterThanOrEqual(1);
    const p = res.puzzles.find((x) => x.ply === 7)!;
    expect(p).toBeDefined();
    expect(p).toMatchObject({ theme: 'mate', mateIn: 1, sideToMove: 'w', solutionSan: ['Qxf7#'], playedSan: 'd3' });
    // every puzzle: legal start, legal solution, and a mating solution really ends in mate
    for (const q of res.puzzles) {
      expect(uciLineToSan(q.fen, q.solution).valid).toBe(true);
      expect(q.accepted).toContain(q.solution[0]);
      if (q.mateIn) {
        const end = uciLineToSan(q.fen, q.solution).fens.at(-1)!;
        expect(terminalState(end)).toMatchObject({ over: true, kind: 'checkmate', winner: q.sideToMove });
      }
    }
    expect(await putPuzzles(res.puzzles)).toBe(res.puzzles.length);
    expect(await putPuzzles(res.puzzles)).toBe(0); // no duplicates
    expect((await listPuzzles()).length).toBe(res.puzzles.length);
    expect(await getSrs(p.id)).toMatchObject({ box: 0, attempts: 0 });
    // answers
    expect(await checkPuzzleMove(engine, p, 'h5f7')).toMatchObject({ ok: true, how: 'listed' });
    expect((await checkPuzzleMove(engine, p, 'h5h4')).ok).toBe(false);
    expect(puzzleHints(p).map((h) => h.level)).toEqual([1, 2, 3]);
    expect(puzzleHints(p)[1]!.text).toMatch(/queen on h5/);
    // progress persists
    await putSrs(nextSrs((await getSrs(p.id))!, true, 3000, 1_000_000));
    await addAttempt({ puzzleId: p.id, at: 1_000_000, ok: true, ms: 3000, hints: 0, revealed: false });
    expect((await getSrs(p.id))!.box).toBe(1);
    expect(await listAttempts()).toHaveLength(1);
  });

  it('accepts a different winning move when the engine confirms it is as good', async () => {
    const fen = '4k3/8/8/3q4/8/1BN5/8/4K3 w - - 0 1'; // both Nxd5 and Bxd5 win the queen
    const p: PuzzleRecord = { id: 'x#1', fen, sideToMove: 'w', solution: ['c3d5'], accepted: ['c3d5'], theme: 'win-material', themes: ['win-material'], gameId: 'x', ply: 1, playedUci: 'e1d1', playedSan: 'Kd1', solutionSan: ['Nxd5'], winBefore: 95, gap: 0, unique: false, difficulty: 1000, depth: 14, createdAt: 0 };
    expect(isLegalUci(fen, 'b3d5')).toBe(true);
    expect(await checkPuzzleMove(engine, p, 'b3d5')).toMatchObject({ ok: true, how: 'engine' });
    expect((await checkPuzzleMove(engine, p, 'e1f2')).ok).toBe(false); // legal but drops the bishop to ...Qxb3
    expect((await checkPuzzleMove(engine, p, 'e1d1')).ok).toBe(false); // illegal: the d-file is open to the queen
  });

  it('refuses to make puzzles when the engine does not agree the game move was worse', async () => {
    // 3.Bc4 is a perfectly fine move: no puzzle may be produced from a sound move even if forced into the builder.
    const g = gameFromPgn(pgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5'), { source: 'chesscom', userName: 'Me' });
    const analysis = (await analyzeGame(g, engine, { depth: 10, multipv: 2 }))!;
    const res = await generatePuzzles(engine, [{ game: g, analysis }], { depth: 12 });
    expect(res.puzzles).toHaveLength(0);
  });
});

describe('endgame progress', () => {
  it('counts attempts and resets the run since the last win', async () => {
    const { applyEndgameResult, describeRecord } = await import('../src/lib/training/endgameProgress');
    let m = applyEndgameResult({}, 'kqk', false, 1);
    m = applyEndgameResult(m, 'kqk', false, 2);
    expect(m.kqk).toEqual({ attempts: 2, wins: 0, sinceWin: 2 });
    m = applyEndgameResult(m, 'kqk', true, 3);
    expect(m.kqk).toEqual({ attempts: 3, wins: 1, sinceWin: 0, lastWin: 3 });
    expect(describeRecord(m.kqk)).toBe('Goal reached 1 of 3 attempts');
    expect(describeRecord(undefined)).toBe('Not tried yet');
    expect(applyEndgameResult(m, 'krk', true, 4).kqk).toEqual(m.kqk);
  });
});

describe('weak-spot practice positions', () => {
  it('offers only contested positions before a serious mistake, biggest loss first, and builds a play link', async () => {
    const { weakSpots, practiceLink } = await import('../src/lib/training/weakspots');
    const { demoGame } = await import('../src/lib/data/demo');
    const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
    const m = (ply: number, over: Record<string, unknown>) => ({ ply, color: ply % 2 ? 'w' : 'b', san: 'Kd1', uci: 'e1d1', fenBefore: fen, fenAfter: fen, winBefore: 55, winAfter: 30, winLoss: 25, cls: 'blunder', lossCls: 'blunder', flags: [], ...over });
    const g = { ...demoGame(1), id: 'g', userColor: 'w' as const, endTime: 5 };
    const analysis = { moves: [m(1, { winLoss: 15, cls: 'mistake', lossCls: 'mistake' }), m(3, { winLoss: 40, winBefore: 70 }), m(5, { winBefore: 95 }), m(7, { winBefore: 20 }), m(9, { cls: 'best', lossCls: 'best', winLoss: 0 }), m(2, {})] } as never;
    const spots = weakSpots([{ game: g, analysis }]);
    expect(spots.map((s) => s.ply)).toEqual([3, 1]);
    expect(practiceLink(fen, 'b')).toBe(`/play?fen=${encodeURIComponent(fen)}&color=b`);
  });
});
