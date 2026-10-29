import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../src/lib/engine/engine';
import { gradeTally } from '../src/lib/analysis/tally';
import { ANALYSIS_VERSION, analyzeGame, memoryEvalCache, summarize, upgradeAnalysis } from '../src/lib/analysis/gameAnalysis';
import { GRADE_RULES, refineGrades, settledMaterial } from '../src/lib/analysis/grades';
import { opponentNotes, theoryDeparture } from '../src/lib/analysis/opponentNotes';
import { explainMove } from '../src/lib/analysis/explain';
import { CLASS_LABEL, CLASS_ORDER, lossClassOf } from '../src/lib/chess/classify';
import { moveAccuracy } from '../src/lib/chess/eval';
import { loadOpenings } from '../src/lib/chess/openings';
import { demoGame } from '../src/lib/data/demo';
import { cp } from '../src/lib/chess/eval';
import type { MoveAnalysis, PositionEval } from '../src/lib/types';
import { nodeStockfishFactory } from './helpers/nodeEngine';

const SAC_FEN = '4k3/8/8/8/1p6/8/8/R3K3 w - - 0 1'; // Ra3 would be met by ...bxa3

describe('settledMaterial', () => {
  it('counts a sacrificed rook once the exchange has settled', () => {
    expect(settledMaterial(SAC_FEN, ['a1a3', 'b4a3', 'e1d2'], 'w')).toBe(-5);
    expect(settledMaterial(SAC_FEN, ['a1a3', 'b4a3', 'e1d2'], 'b')).toBe(5);
  });
  it('refuses to decide when the line stops in the middle of an exchange', () => {
    expect(settledMaterial(SAC_FEN, ['a1a3', 'b4a3'], 'w')).toBeNull();
  });
  it('is zero for quiet moves, and null for an unplayable line', () => {
    expect(settledMaterial(SAC_FEN, ['e1d2', 'e8d7'], 'w')).toBe(0);
    expect(settledMaterial(SAC_FEN, ['a1b3'], 'w')).toBeNull();
  });
});

function mv(over: Partial<MoveAnalysis> & { ply: number }): MoveAnalysis {
  return {
    color: over.ply % 2 === 1 ? 'w' : 'b',
    san: 'Nf3',
    uci: 'g1f3',
    fenBefore: SAC_FEN,
    fenAfter: SAC_FEN,
    evalBefore: cp(0),
    evalAfter: cp(0),
    bestUci: 'g1f3',
    bestSan: 'Nf3',
    bestPvSan: [],
    playedRank: 1,
    winBefore: 50,
    winAfter: 50,
    winLoss: 0,
    cpLoss: 0,
    cls: 'best',
    flags: [],
    ...over,
  };
}
const noPositions = (n: number): PositionEval[] => Array.from({ length: n + 1 }, () => ({ fen: SAC_FEN, depth: 10, multipv: 1, engine: 't', lines: [{ multipv: 1, score: cp(0), depth: 10, pv: [] }] }));

describe('refineGrades rules', () => {
  it('marks moves inside the opening list as book, but only when they hold up', () => {
    const out = refineGrades([mv({ ply: 1 }), mv({ ply: 2, cls: 'excellent', winLoss: 1.5 }), mv({ ply: 3, cls: 'mistake', winLoss: 12 }), mv({ ply: 4 })], noPositions(4), 3);
    expect(out.map((m) => m.cls)).toEqual(['book', 'book', 'mistake', 'best']);
    expect(out.map((m) => m.lossCls)).toEqual(['best', 'excellent', 'mistake', 'best']);
  });

  it('leaves a forced move alone', () => {
    const out = refineGrades([mv({ ply: 1, cls: 'forced' })], noPositions(1), 5);
    expect(out[0]!.cls).toBe('forced');
  });

  it('calls the only good move great, but not a plain recapture', () => {
    const only = mv({ ply: 5, flags: ['critical'], winBefore: 55 });
    expect(refineGrades([only], noPositions(1), 0)[0]!.cls).toBe('great');
    const prev = mv({ ply: 4, san: 'Nxe5', uci: 'c6e5' });
    const recapture = mv({ ply: 5, san: 'Qxe5', uci: 'd4e5', flags: ['critical'], winBefore: 55 });
    expect(refineGrades([prev, recapture], noPositions(2), 0)[1]!.cls).toBe('best');
    // Already almost certainly winning: no praise for the only move.
    expect(refineGrades([mv({ ply: 5, flags: ['critical'], winBefore: 99 })], noPositions(1), 0)[0]!.cls).toBe('best');
  });

  it('calls it a miss when the opponent just erred and the chance was not taken', () => {
    const err = mv({ ply: 4, cls: 'blunder', winLoss: 30 });
    const slip = mv({ ply: 5, cls: 'inaccuracy', winLoss: 7, winBefore: 80, winAfter: 73 });
    const out = refineGrades([err, slip], noPositions(2), 0);
    expect(out[1]!.cls).toBe('miss');
    expect(out[1]!.lossCls).toBe('inaccuracy');
    // Not when the opponent had not erred, or the mover was not actually better.
    expect(refineGrades([mv({ ply: 4 }), slip], noPositions(2), 0)[1]!.cls).toBe('inaccuracy');
    expect(refineGrades([err, { ...slip, winBefore: 52, winAfter: 44 }], noPositions(2), 0)[1]!.cls).toBe('inaccuracy');
    // A blunder stays a blunder.
    expect(refineGrades([err, mv({ ply: 5, cls: 'blunder', winLoss: 30, winBefore: 80, winAfter: 50 })], noPositions(2), 0)[1]!.cls).toBe('blunder');
  });

  it('calls a sound sacrifice brilliant, and only then', () => {
    const sac = mv({ ply: 1, san: 'Ra3', uci: 'a1a3', fenBefore: SAC_FEN, winBefore: 60, winAfter: 58, winLoss: 0.4, playedRank: 2, cls: 'best' });
    const after = (pv: string[]): PositionEval[] => [noPositions(1)[0]!, { fen: SAC_FEN, depth: 10, multipv: 1, engine: 't', lines: [{ multipv: 1, score: cp(40), depth: 10, pv }] }];
    expect(refineGrades([sac], after(['b4a3', 'e1d2']), 0)[0]!.cls).toBe('brilliant');
    // The same move but the engine line does not win the material back or keep the balance.
    expect(refineGrades([{ ...sac, winAfter: 30, winLoss: 30, cls: 'blunder' }], after(['b4a3', 'e1d2']), 0)[0]!.cls).toBe('blunder');
    expect(refineGrades([{ ...sac, winAfter: 40 }], after(['b4a3', 'e1d2']), 0)[0]!.cls).toBe('best');
    // No material given up: not a sacrifice.
    expect(refineGrades([{ ...sac, uci: 'e1d2', san: 'Kd2' }], after(['e8d7', 'd2c3']), 0)[0]!.cls).toBe('best');
    // Already completely winning: nothing to prove.
    expect(refineGrades([{ ...sac, winBefore: GRADE_RULES.brilliantMaxBefore + 5 }], after(['b4a3', 'e1d2']), 0)[0]!.cls).toBe('best');
    // Cut off mid-exchange: no verdict.
    expect(refineGrades([sac], after(['b4a3']), 0)[0]!.cls).toBe('best');
  });
});

describe('grades on a real game', () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await Engine.start(nodeStockfishFactory());
    await loadOpenings();
  });
  afterAll(() => engine.dispose());

  it('analyses the demo game with book moves, consistent counts, unchanged accuracy, and a lossless upgrade from the old format', async () => {
    const game = demoGame(1);
    const a = (await analyzeGame(game, engine, { depth: 12, multipv: 3, cache: memoryEvalCache() }))!;
    expect(a.version).toBe(ANALYSIS_VERSION);
    // The first moves of the Philidor are named theory.
    expect(a.moves.slice(0, 4).every((m) => m.cls === 'book')).toBe(true);
    for (const m of a.moves) {
      expect(m.lossCls).toBeDefined();
      expect(['brilliant', 'great', 'book', 'miss']).not.toContain(m.lossCls);
      expect(CLASS_LABEL[m.cls]).toBeTruthy();
    }
    for (const c of ['w', 'b'] as const) {
      const total = Object.values(a.summary[c].counts).reduce((x, y) => x + y, 0);
      expect(total).toBe(a.summary[c].moves);
      // Accuracy is computed from loss alone, so the labels cannot change it.
      const scored = a.moves.filter((m) => m.color === c && m.cls !== 'forced');
      expect(a.summary[c].accuracy).toBeCloseTo(scored.reduce((s, m) => s + moveAccuracy(m.winLoss), 0) / scored.length, 8);
    }
    for (const cls of CLASS_ORDER) expect(a.summary.w.counts[cls]).toBeGreaterThanOrEqual(0);
    // Morphy's queen sacrifice (16.Qb8+), which forces mate, is the brilliant move of the game.
    expect(a.moves[30]!.san).toBe('Qb8+');
    expect(a.moves[30]!.cls).toBe('brilliant');
    // The engine's own first choice never loses winning chances.
    for (const m of a.moves.filter((x) => x.bestUci === x.uci)) expect(m.winLoss).toBe(0);
    // Any brilliant move really gave up material along the engine line.
    for (const m of a.moves.filter((x) => x.cls === 'brilliant')) {
      const pv = a.positions[m.ply]?.lines[0]?.pv ?? [];
      expect(settledMaterial(m.fenBefore, [m.uci, ...pv], m.color)).toBeLessThanOrEqual(-GRADE_RULES.brilliantMinSacrifice);
      expect(explainMove(m, a).headline).toMatch(/brilliant/);
    }
    // Theory and opponent notes are read from the same analysis.
    const dep = theoryDeparture(a, 'w');
    expect(dep).not.toBeNull();
    expect(dep!.ply).toBe((a.opening?.plies ?? 0) + 1);
    expect(dep!.text).toMatch(/left the named openings with/);
    expect(dep!.text).not.toMatch(/popular|rare|most common/);
    const notes = opponentNotes(a, { ...game, userColor: 'w' }, 'w');
    expect(notes[0]).toMatch(/accuracy against your/);
    expect(opponentNotes(a, game, undefined)).toEqual([]);
    // An analysis in the old format is upgraded from its stored evaluations, without an engine, to the same grades.
    const old = { ...a, version: 1, moves: a.moves.map((m) => ({ ...m, cls: lossClassOf(m), lossCls: undefined })), summary: { w: summarize(a.moves, 'w'), b: summarize(a.moves, 'b') } };
    const up = await upgradeAnalysis(game, old);
    expect(up.version).toBe(ANALYSIS_VERSION);
    expect(up.moves.map((m) => m.cls)).toEqual(a.moves.map((m) => m.cls));
    expect(up.moves.map((m) => m.lossCls)).toEqual(a.moves.map((m) => m.lossCls));
    expect(await upgradeAnalysis(game, up)).toBe(up);
  });
});

describe('gradeTally', () => {
  it('counts only your moves, and lists the brilliant ones newest game first', () => {
    const g1 = { ...demoGame(1), id: 'g1', userColor: 'w' as const, opponent: 'A', endTime: 100 };
    const g2 = { ...demoGame(1), id: 'g2', userColor: 'b' as const, opponent: 'B', endTime: 200 };
    const g3 = { ...demoGame(1), id: 'g3', userColor: undefined, opponent: 'C', endTime: 300 }; // side unknown: ignored
    const an = (moves: MoveAnalysis[]) => ({ moves }) as unknown as import('../src/lib/types').GameAnalysis;
    const t = gradeTally([
      { game: g1, analysis: an([mv({ ply: 1, cls: 'brilliant' }), mv({ ply: 2, cls: 'blunder' }), mv({ ply: 3, cls: 'best' })]) },
      { game: g2, analysis: an([mv({ ply: 1, cls: 'blunder' }), mv({ ply: 2, cls: 'brilliant' }), mv({ ply: 4, cls: 'brilliant' })]) },
      { game: g3, analysis: an([mv({ ply: 1, cls: 'brilliant' })]) },
    ]);
    expect(t.games).toBe(2);
    expect(t.moves).toBe(4);
    expect(t.counts.brilliant).toBe(3);
    expect(t.counts.blunder).toBe(0);
    expect(t.counts.best).toBe(1);
    expect(t.brilliant.map((b) => `${b.gameId}:${b.ply}`)).toEqual(['g2:2', 'g2:4', 'g1:1']);
  });
});
