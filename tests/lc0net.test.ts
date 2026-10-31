import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { channelOf, encodeInput, movePriors, parseNet } from '../src/lib/engine/lc0net';

const load = (r: number) => parseNet(new Uint8Array(gunzipSync(readFileSync(`public/maia/maia-${r}.pb.gz`))));
const line = (moves: string[]) => {
  const c = new Chess();
  const fens = [c.fen()];
  for (const m of moves) {
    c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
    fens.unshift(c.fen());
  }
  return fens.slice(0, 8);
};

describe('Lc0 network runner (Maia)', () => {
  const net = load(1500);
  it('reads the network: 6 residual blocks of 64 filters with squeeze-excitation and an 80-channel policy', () => {
    expect(net.channels).toBe(64);
    expect(net.residual).toHaveLength(6);
    expect(net.residual.every((r) => !!r.se)).toBe(true);
    expect(net.policyChannels).toBe(80);
  });
  it('maps moves to channels: pawn pushes, knight jumps, diagonals, castling', () => {
    expect(channelOf(0, 1)).toBe(0);
    expect(channelOf(0, 2)).toBe(1);
    expect(channelOf(1, 2)).toBe(56);
    expect(channelOf(-1, 2)).toBe(63);
    expect(channelOf(2, 2)).toBe(8);
    expect(channelOf(2, 0)).toBe(15);
    expect(channelOf(1, 3)).toBe(-1);
  });
  it('encodes the start position: our pawns on rank 2, ones plane set, no black-to-move plane', () => {
    const p = encodeInput([new Chess().fen()]);
    expect(p.slice(0 * 64 + 8, 0 * 64 + 16).every((v) => v === 1)).toBe(true);
    expect(p[111 * 64]).toBe(1);
    expect(p[108 * 64]).toBe(0);
    expect(p[104 * 64]).toBe(1);
  });
  it('sees the board from Black’s side when Black is to move', () => {
    const fen = line(['e2e4'])[0]!;
    const p = encodeInput([fen]);
    expect(p[108 * 64]).toBe(1);
    // Black's pawns (ours now) sit on the mirrored rank 2, so plane 0 has its 8 pawns in row 1
    expect(p.slice(8, 16).every((v) => v === 1)).toBe(true);
  });
  it('gives sensible opening probabilities, and probabilities that sum to one over legal moves only', () => {
    const start = movePriors(net, line([]));
    expect(['e2e4', 'd2d4', 'g1f3', 'c2c4']).toContain(start[0]!.uci);
    expect(start.reduce((a, m) => a + m.p, 0)).toBeCloseTo(1, 5);
    expect(start).toHaveLength(20);
    expect(start.find((m) => m.uci === 'a2a4')!.p).toBeLessThan(0.05);
    const afterE4 = movePriors(net, line(['e2e4']));
    expect(['e7e5', 'c7c5', 'e7e6', 'c7c6', 'd7d5']).toContain(afterE4[0]!.uci);
    const ruy = movePriors(net, line(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6']));
    expect(['b5a4', 'b5c6']).toContain(ruy[0]!.uci);
  });
  it('prefers taking a hanging queen over quiet moves', () => {
    // White to move; the black queen on d5 is attacked by the pawn on e4.
    const fen = 'rnb1kbnr/ppp1pppp/8/3q4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3';
    const pri = movePriors(net, [fen]);
    expect(pri[0]!.uci).toBe('e4d5');
    expect(pri[0]!.p).toBeGreaterThan(0.5);
  });
  it('the higher bands differ from the lower ones', () => {
    const a = movePriors(load(1100), line(['e2e4']));
    const b = movePriors(load(1900), line(['e2e4']));
    expect(a[0]!.uci).not.toBe(b[0]!.uci);
  });
});
