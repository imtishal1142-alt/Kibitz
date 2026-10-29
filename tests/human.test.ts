import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Engine } from '../src/lib/engine/engine';
import { LEVELS } from '../src/lib/engine/strength';
import { GameSession } from '../src/lib/play/session';
import { engineMove } from '../src/services/playEngine';
import { nodeStockfishFactory } from './helpers/nodeEngine';

describe('human-like opponent with the real engine', () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await Engine.start(nodeStockfishFactory());
    await engine.setOptions({ UCI_LimitStrength: false, 'Skill Level': 20 });
  });
  afterAll(() => engine.dispose());

  it('always returns a legal move, including a forced one, and varies when careless', async () => {
    const cfg = { ...LEVELS.find((l) => l.id === 'human-easy')!.config, movetimeMs: 150 };
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      const s = new GameSession({});
      const uci = await engineMove(engine, s, cfg);
      expect(uci).toBeTruthy();
      expect(s.move(uci!, Date.now()).ok).toBe(true);
      seen.add(uci!);
    }
    expect(seen.size).toBeGreaterThan(0);
    // Only one legal move: the king must take the checking queen.
    const forced = new GameSession({ startFen: '7k/8/8/8/8/8/6q1/7K w - - 0 1' });
    expect(await engineMove(engine, forced, cfg)).toBe('h1g2');
  });
});
