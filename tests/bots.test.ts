import { describe, expect, it } from 'vitest';
import { BOTS, BOT_TIERS, botById, styleBias } from '../src/lib/engine/bots';
import { pickHumanMove } from '../src/lib/engine/human';
import { resolveMove, START_FEN } from '../src/lib/chess/rules';
import { optionsFor, sanitizeConfig } from '../src/lib/engine/strength';
import { pickFlavor, threadsFor } from '../src/lib/engine/transport';
import type { EngineManifest } from '../src/lib/engine/transport';
import type { SearchLine } from '../src/lib/types';

describe('bots', () => {
  it('has unique ids and names, valid tiers, and configs that survive sanitising', () => {
    expect(new Set(BOTS.map((b) => b.id)).size).toBe(BOTS.length);
    expect(new Set(BOTS.map((b) => b.name)).size).toBe(BOTS.length);
    for (const b of BOTS) {
      expect(BOT_TIERS).toContain(b.tier);
      const s = sanitizeConfig(b.config);
      expect(s.name).toBe(b.name);
      expect(s.mode).toBe(b.config.mode);
      expect(Object.keys(optionsFor(s)).length).toBeGreaterThan(0);
    }
    expect(botById('rex')?.config.style).toBe('attacker');
    expect(botById('nope')).toBeUndefined();
  });
  it('drops an unknown style and an empty name', () => {
    const s = sanitizeConfig({ style: 'weird' as never, name: '  ' });
    expect(s.style).toBeUndefined();
    expect(s.name).toBeUndefined();
  });
  it('style bias favours captures for traders and discourages them for defenders', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const resolve = (u: string) => resolveMove(fen, u);
    expect(styleBias('trader', resolve)('e4d5')).toBeGreaterThan(1);
    expect(styleBias('trader', resolve)('g1f3')).toBe(1);
    expect(styleBias('defender', resolve)('e4d5')).toBeLessThan(1);
    expect(styleBias('attacker', resolve)('e4d5')).toBeGreaterThan(1);
  });
  it('a bias changes which of two equal moves is chosen, but never lifts a bad move above a good one', () => {
    const line = (uci: string, cp: number, rank: number): SearchLine => ({ multipv: rank, depth: 12, score: { kind: 'cp', cp }, pv: [uci] }) as SearchLine;
    const lines = [line('g1f3', 30, 1), line('e2e4', 30, 2)];
    const fav = (u: string) => (u === 'e2e4' ? 50 : 1);
    let e4 = 0;
    for (let i = 0; i < 200; i++) if (pickHumanMove(lines, 'w', 10, Math.random, fav)?.uci === 'e2e4') e4++;
    expect(e4).toBeGreaterThan(150);
    const bad = [line('g1f3', 300, 1), line('a2a3', -900, 2)];
    for (let i = 0; i < 100; i++) expect(pickHumanMove(bad, 'w', 20, Math.random, () => 50)?.uci).toBe('g1f3');
    void START_FEN;
  });
});

describe('engine build choice', () => {
  const m: EngineManifest = {
    stockfishVersion: '19',
    buildVersion: '19',
    license: 'GPL-3.0',
    flavors: [
      { id: 'lite-wasm', label: 'single', js: 'a.js', wasm: true, note: '', bytes: 1 },
      { id: 'lite-mt', label: 'multi', js: 'b.js', wasm: true, threads: true, note: '', bytes: 1 },
      { id: 'asm', label: 'asm', js: 'c.js', wasm: false, note: '', bytes: 1 },
    ],
  };
  it('auto picks multi-threaded only when isolated and with enough cores', () => {
    expect(pickFlavor(m, 'auto', true, true, 8).id).toBe('lite-mt');
    expect(pickFlavor(m, 'auto', true, false, 8).id).toBe('lite-wasm');
    expect(pickFlavor(m, 'auto', true, true, 2).id).toBe('lite-wasm');
  });
  it('an explicit choice is honoured unless it cannot run here', () => {
    expect(pickFlavor(m, 'asm', true, true, 8).id).toBe('asm');
    expect(pickFlavor(m, 'lite-mt', true, false, 8).id).toBe('lite-wasm');
  });
  it('gives the batch slot more threads than the interactive ones, never more than the cores', () => {
    expect(threadsFor('batch', 8)).toBeGreaterThan(threadsFor('live', 8));
    expect(threadsFor('batch', 1)).toBe(1);
    expect(threadsFor('a', 2)).toBe(1);
  });
});

describe('analysis workers', () => {
  it('automatic follows the core count; an explicit number is clamped to 1..4', async () => {
    const { workerCount } = await import('../src/lib/engine/transport');
    expect([2, 4, 8, 12, 32].map((c) => workerCount(0, c))).toEqual([1, 2, 3, 4, 4]);
    expect(workerCount(3, 2)).toBe(3);
    expect(workerCount(9, 2)).toBe(4);
  });
  it('shares cache entries between the lite builds only', async () => {
    const { shareableEngineId } = await import('../src/lib/analysis/gameAnalysis');
    expect(shareableEngineId('Stockfish 19#lite-mt')).toBe(shareableEngineId('Stockfish 19#lite-wasm'));
    expect(shareableEngineId('Stockfish 19#asm')).not.toBe(shareableEngineId('Stockfish 19#lite-wasm'));
  });
});

describe('maia bots', () => {
  it('are in the list with a valid band and survive sanitising', async () => {
    const maia = BOTS.filter((b) => b.tier === 'Maia');
    expect(maia.map((b) => b.config.maia)).toEqual([1100, 1300, 1500, 1700, 1900]);
    for (const b of maia) expect(sanitizeConfig(b.config).maia).toBe(b.config.maia);
    expect(sanitizeConfig({ mode: 'maia', maia: 1450 }).maia).toBe(1500);
  });
  it('sampling never picks a move outside the likely ones and follows the probabilities', async () => {
    const { sampleMove } = await import('../src/lib/engine/maia');
    const pri = [
      { uci: 'e2e4', p: 0.6 },
      { uci: 'd2d4', p: 0.35 },
      { uci: 'a2a3', p: 0.049 },
      { uci: 'h2h4', p: 0.001 },
    ];
    const seen: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const m = sampleMove(pri, Math.random)!;
      seen[m] = (seen[m] ?? 0) + 1;
    }
    expect(seen.h2h4).toBeUndefined();
    expect(seen.e2e4!).toBeGreaterThan(seen.d2d4!);
    expect(sampleMove([])).toBeNull();
  });
});
