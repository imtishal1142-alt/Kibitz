import { describe, expect, it } from 'vitest';
import { timeReport, timeTally } from '../src/lib/analysis/timeAnalysis';
import { cp } from '../src/lib/chess/eval';
import { demoGame } from '../src/lib/data/demo';
import type { GameAnalysis, MoveAnalysis, MoveClass } from '../src/lib/types';

const FEN = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
function mv(ply: number, over: Partial<MoveAnalysis>): MoveAnalysis {
  return { ply, color: ply % 2 ? 'w' : 'b', san: 'Kd1', uci: 'e1d1', fenBefore: FEN, fenAfter: FEN, evalBefore: cp(0), evalAfter: cp(0), bestUci: null, bestSan: null, bestPvSan: [], playedRank: 1, winBefore: 50, winAfter: 50, winLoss: 0, cpLoss: 0, cls: 'best', flags: [], ...over } as MoveAnalysis;
}
const game = (moves: MoveAnalysis[]) => ({ moves, positions: [] }) as unknown as GameAnalysis;

/** White plays `n` moves: first half at a comfortable clock, then the clock runs low. */
function timedGame(n: number, lowErrors: number): GameAnalysis {
  const out: MoveAnalysis[] = [];
  for (let i = 0; i < n; i++) {
    const low = i >= n - 6;
    const bad = low && i >= n - 6 + (6 - lowErrors);
    const cls: MoveClass = bad ? 'blunder' : 'best';
    out.push(mv(i * 2 + 1, { cls, lossCls: cls, winLoss: bad ? 30 : 0, clockMs: low ? 12_000 - i * 100 : 300_000 - i * 5000, spentMs: i === 3 ? 40_000 : low ? 1500 : 6000 }));
    out.push(mv(i * 2 + 2, { clockMs: 200_000, spentMs: 4000 }));
  }
  return game(out);
}

describe('timeReport', () => {
  it('says so plainly when a game has no clock times', () => {
    const r = timeReport(game([mv(1, {}), mv(2, {})]), 'w');
    expect(r.hasClocks).toBe(false);
    expect(r.notes).toEqual([]);
  });

  it('separates low-clock, fast and ordinary moves and counts the serious errors in each', () => {
    const r = timeReport(timedGame(20, 3), 'w');
    expect(r.hasClocks).toBe(true);
    expect(r.low).toEqual({ moves: 6, severe: 3 });
    expect(r.rest.severe).toBe(0);
    expect(r.rushedErrors).toHaveLength(3);
    expect(r.minClockMs).toBeLessThan(12_000);
    // One 40 s think against a 6 s median is a long think.
    expect(r.longThinks.map((m) => m.spentMs)).toEqual([40_000]);
    expect(r.notes.join(' ')).toMatch(/3 serious errors \(50%\), against 0%/);
    expect(r.notes.join(' ')).toMatch(/longest think was 40 s/);
  });

  it('does not read a pattern from a very short game', () => {
    const r = timeReport(timedGame(4, 1), 'w');
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatch(/too few/);
  });

  it('reports a game with no time trouble as such', () => {
    const moves = Array.from({ length: 24 }, (_, i) => mv(i + 1, { clockMs: 500_000 - i * 1000, spentMs: 5000 }));
    const r = timeReport(game(moves), 'w');
    expect(r.low.moves).toBe(0);
    expect(r.notes.join(' ')).toMatch(/never dropped under 30 s/);
  });
});

describe('timeTally', () => {
  it('pools only games with clocks for your side and quotes the comparison with its sample sizes', () => {
    const base = demoGame(1);
    const g = (id: string, userOutcome: 'loss' | 'win') => ({ ...base, id, userColor: 'w' as const, userOutcome });
    const t = timeTally([
      { game: g('a', 'loss'), analysis: timedGame(20, 4) },
      { game: g('b', 'win'), analysis: timedGame(20, 0) },
      { game: g('c', 'win'), analysis: game([mv(1, {}), mv(2, {})]) }, // no clocks: skipped
      { game: { ...g('d', 'win'), userColor: undefined }, analysis: timedGame(20, 4) }, // side unknown: skipped
    ]);
    expect(t.games).toBe(2);
    expect(t.gamesInTrouble).toBe(2);
    expect(t.lostInTrouble).toBe(1);
    expect(t.low).toEqual({ moves: 12, severe: 4 });
    expect(t.notes.join(' ')).toMatch(/33% of your moves were mistakes or blunders \(12 moves\), against 0% otherwise/);
  });

  it('is empty when no game has clocks', () => {
    expect(timeTally([]).games).toBe(0);
    expect(timeTally([]).notes).toEqual([]);
  });
});
