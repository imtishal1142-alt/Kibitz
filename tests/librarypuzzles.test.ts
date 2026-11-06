import { describe, it, expect } from 'vitest';
import { Engine } from '../src/lib/engine/engine';
import { nodeStockfishFactory } from './helpers/nodeEngine';
import { loadLibraryPuzzles, toRecord } from '../src/lib/training/libraryPuzzles';
import { uciLineToSan, validateFen } from '../src/lib/chess/rules';

describe('library puzzle pack', () => {
  it('every puzzle is legal, unique and well formed', async () => {
    const pack = await loadLibraryPuzzles();
    expect(pack.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const p of pack) {
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(validateFen(p.fen).ok).toBe(true);
      expect(p.solution.length % 2).toBe(1);
      expect(uciLineToSan(p.fen, p.solution, p.solution.length).valid).toBe(true);
      expect(toRecord(p).solutionSan.length).toBe(p.solution.length);
    }
  });
  it('the engine still picks the listed first move in a sample (depth 16, 40 of the pack)', async () => {
    const pack = await loadLibraryPuzzles();
    const engine = await Engine.start(nodeStockfishFactory());
    try {
      const sample = pack.filter((_, i) => i % Math.max(1, Math.floor(pack.length / 40)) === 0).slice(0, 40);
      for (const p of sample) {
        const r = await engine.search({ fen: p.fen, depth: 16, multipv: 1 });
        expect(r.lines[0]!.pv[0]).toBe(p.solution[0]);
      }
    } finally {
      engine.dispose();
    }
  }, 600_000);
});
