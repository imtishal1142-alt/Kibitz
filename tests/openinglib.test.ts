import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { OPENING_LIBRARY } from '../src/lib/training/openingLibrary';
import { Engine } from '../src/lib/engine/engine';
import { winPctFor } from '../src/lib/chess/eval';
import { nodeStockfishFactory } from './helpers/nodeEngine';

const play = (sans: string[]): Chess => {
  const c = new Chess();
  for (const s of sans) c.move(s);
  return c;
};

describe('opening library', () => {
  it('ids are unique and every main line and trap line is legal', () => {
    expect(new Set(OPENING_LIBRARY.map((o) => o.id)).size).toBe(OPENING_LIBRARY.length);
    for (const o of OPENING_LIBRARY) {
      expect(() => play(o.line), `${o.id} line`).not.toThrow();
      for (const t of o.traps) expect(() => play(t.line), `${o.id}/${t.id}`).not.toThrow();
    }
  });
  it('every opening has a profile, and every extra line is legal', () => {
    for (const o of OPENING_LIBRARY) {
      expect(o.profile, `${o.id} profile`).toBeDefined();
      for (const v of o.variations ?? []) expect(() => play(v.line), `${o.id}/${v.name}`).not.toThrow();
    }
  });
  it('traps that claim checkmate end in checkmate by the right side', () => {
    for (const o of OPENING_LIBRARY) for (const t of o.traps.filter((x) => x.claim === 'mate')) {
      const c = play(t.line);
      expect(c.isCheckmate(), `${t.id}`).toBe(true);
      expect(c.turn() === 'w' ? 'b' : 'w', `${t.id} winner`).toBe(t.by);
    }
  });
});

describe('opening traps (engine)', () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await Engine.start(nodeStockfishFactory());
  });
  afterAll(() => engine.dispose());
  it('traps that claim to win material leave the trap-setter clearly better', async () => {
    for (const o of OPENING_LIBRARY) for (const t of o.traps.filter((x) => x.claim === 'material')) {
      const fen = play(t.line).fen();
      const res = await engine.search({ fen, depth: 16, multipv: 1 });
      expect(winPctFor(res.lines[0]!.score, t.by), `${t.id}`).toBeGreaterThan(65);
    }
  }, 120000);
});
