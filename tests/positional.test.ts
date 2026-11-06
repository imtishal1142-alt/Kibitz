import { describe, it, expect } from 'vitest';
import { positionFeatures, positionalDifference } from '../src/lib/analysis/positional';

describe('positional features', () => {
  it('finds isolated, doubled and passed pawns', () => {
    // White: a2 isolated? b-pawn absent -> a2 isolated; c3,c4 doubled; h-pawn passed (g,h black pawns absent)
    const f = positionFeatures('4k3/pp3p2/8/8/2P5/2P5/P6P/4K3 w - - 0 1');
    expect(f.w.isolated).toContain('a2');
    expect(f.w.doubled).toContain('c');
    expect(f.w.passed).toContain('h2');
    expect(f.b.passed).not.toContain('a7');
  });
  it('finds an outpost and the bishop pair', () => {
    const f = positionFeatures('4k3/6p1/8/8/3N4/2P1P3/8/2B1KB2 w - - 0 1');
    expect(f.w.outposts).toContain('d4');
    expect(f.w.bishopPair).toBe(true);
  });
  it('describes what a move gave up', () => {
    const d = positionalDifference('4k3/8/8/8/8/8/P7/4K3 w - - 0 1', '4k3/8/8/8/8/8/P7/4K3 w - - 0 1', 'w');
    expect(d).toEqual([]);
  });
});
