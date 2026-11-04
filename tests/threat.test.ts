import { describe, expect, it } from 'vitest';
import { threatAfter } from '../src/lib/analysis/explain';

describe('threatAfter', () => {
  it('finds the mate threat after a quiet queen move (Scholar-style)', () => {
    // 1.e4 e5 2.Bc4 Nc6 3.Qh5: White threatens Qxf7#.
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3';
    const t = threatAfter(fen, 'w');
    expect(t).toMatch(/Qxf7#/);
    expect(t).toMatch(/checkmate/);
  });
  it('says nothing when there is no real threat', () => {
    expect(threatAfter('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', 'w')).toBeNull();
  });
  it('returns null when the position is not "opponent to move" or is in check', () => {
    expect(threatAfter('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', 'w')).toBeNull();
    expect(threatAfter('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', 'b')).toBeNull();
  });
});
