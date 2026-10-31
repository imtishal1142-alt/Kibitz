// A small, dependency-free runner for Leela Chess Zero (Lc0) networks, used for the Maia bots.
//
// Maia (Microsoft/Toronto/Cornell, GPL-3.0) is a set of Lc0-format networks trained on human games at one rating
// band each. Played with a single forward pass (no search, "1 node") they choose moves the way people of that band do.
// This file reads the network file (a gzip-compressed protobuf), runs its residual tower in plain JavaScript, and turns
// the policy output into a probability for every legal move. It does NOT search and it does not evaluate positions
// (the value head is ignored), so a Maia network is a move chooser, not an analysis engine.
//
// Reference for the file layout and input encoding: the Lc0 project's net.proto and its classical 112-plane input
// format. Nothing here was copied from Lc0 source; it was written from that format description and checked against the
// shipped networks (see tests/lc0net.test.ts).
import { Chess } from 'chess.js';
import type { Color } from '../types';

const FILTERS_IN = 112;
const BOARD = 64;

interface Layer {
  data: Float32Array;
}
interface ConvBlock {
  w: Layer;
  b?: Layer;
  mean?: Layer;
  var_?: Layer;
  gamma?: Layer;
  beta?: Layer;
  /** Folded batch-norm: per output channel `scale` and `shift` so that out = conv * scale + shift. */
  scale?: Float32Array;
  shift?: Float32Array;
}
interface Residual {
  c1: ConvBlock;
  c2: ConvBlock;
  se?: { w1: Layer; b1: Layer; w2: Layer; b2: Layer };
}
export interface Lc0Net {
  channels: number;
  input: ConvBlock;
  residual: Residual[];
  policy1: ConvBlock;
  policy: ConvBlock;
  policyChannels: number;
}

// ---------------------------------------------------------------- protobuf reading
interface Field {
  f: number;
  t: number;
  v?: number;
  s: number;
  e: number;
}
function parseFields(b: Uint8Array, start: number, end: number): Field[] {
  const out: Field[] = [];
  let p = start;
  const varint = (): number => {
    let r = 0;
    let s = 0;
    let x: number;
    do {
      x = b[p++]!;
      r += (x & 0x7f) * 2 ** s;
      s += 7;
    } while (x & 0x80);
    return r;
  };
  while (p < end) {
    const key = varint();
    const f = Math.floor(key / 8);
    const t = key & 7;
    if (t === 0) out.push({ f, t, v: varint(), s: 0, e: 0 });
    else if (t === 1) {
      out.push({ f, t, s: p, e: p + 8 });
      p += 8;
    } else if (t === 5) {
      out.push({ f, t, v: new DataView(b.buffer, b.byteOffset + p, 4).getFloat32(0, true), s: p, e: p + 4 });
      p += 4;
    } else if (t === 2) {
      const n = varint();
      out.push({ f, t, s: p, e: p + n });
      p += n;
    } else throw new Error(`Unsupported protobuf wire type ${t}`);
  }
  return out;
}

function readLayer(b: Uint8Array, f: Field, encoding: number): Layer {
  const sub = parseFields(b, f.s, f.e);
  const min = sub.find((x) => x.f === 1)?.v ?? 0;
  const max = sub.find((x) => x.f === 2)?.v ?? 0;
  const params = sub.find((x) => x.f === 3);
  if (!params) return { data: new Float32Array(0) };
  const n = params.e - params.s;
  if (encoding === 1) {
    // LINEAR16: unsigned 16-bit values spread evenly between min and max.
    const count = n >> 1;
    const data = new Float32Array(count);
    const dv = new DataView(b.buffer, b.byteOffset + params.s, n);
    const span = max - min;
    for (let i = 0; i < count; i++) data[i] = min + (span * dv.getUint16(i * 2, true)) / 65535;
    return { data };
  }
  if (encoding === 0 || encoding === 2) {
    // FLOAT32 (0) is stored raw; encoding 2 (FLOAT16) is not used by Maia.
    if (encoding === 2) throw new Error('FLOAT16 networks are not supported');
    const count = n >> 2;
    const data = new Float32Array(count);
    const dv = new DataView(b.buffer, b.byteOffset + params.s, n);
    for (let i = 0; i < count; i++) data[i] = dv.getFloat32(i * 4, true);
    return { data };
  }
  throw new Error(`Unsupported weights encoding ${encoding}`);
}

function readConvBlock(b: Uint8Array, f: Field, enc: number): ConvBlock {
  const blk: ConvBlock = { w: { data: new Float32Array(0) } };
  for (const x of parseFields(b, f.s, f.e)) {
    if (x.t !== 2) continue;
    const l = readLayer(b, x, enc);
    if (x.f === 1) blk.w = l;
    else if (x.f === 2) blk.b = l;
    else if (x.f === 3) blk.mean = l;
    else if (x.f === 4) blk.var_ = l;
    else if (x.f === 5) blk.gamma = l;
    else if (x.f === 6) blk.beta = l;
  }
  return blk;
}

/** Fold bias and batch-norm into one scale and shift per output channel. */
function fold(blk: ConvBlock, outCh: number): void {
  const scale = new Float32Array(outCh).fill(1);
  const shift = new Float32Array(outCh);
  for (let o = 0; o < outCh; o++) {
    let sc = 1;
    let sh: number;
    const bias = blk.b?.data[o] ?? 0;
    if (blk.mean && blk.var_) {
      const inv = 1 / Math.sqrt(blk.var_.data[o]! + 1e-5);
      sc = inv * (blk.gamma?.data[o] ?? 1);
      sh = (bias - blk.mean.data[o]!) * sc + (blk.beta?.data[o] ?? 0);
    } else {
      sh = bias;
    }
    scale[o] = sc;
    shift[o] = sh;
  }
  blk.scale = scale;
  blk.shift = shift;
}

/** Parse a decompressed Lc0 network file. */
export function parseNet(bytes: Uint8Array): Lc0Net {
  const top = parseFields(bytes, 0, bytes.length);
  const fmt = top.find((x) => x.f === 4);
  const enc = fmt ? (parseFields(bytes, fmt.s, fmt.e).find((x) => x.f === 1)?.v ?? 0) : 0;
  const wf = top.find((x) => x.f === 10);
  if (!wf) throw new Error('This file has no network weights');
  const fields = parseFields(bytes, wf.s, wf.e);
  const input = readConvBlock(bytes, fields.find((x) => x.f === 1)!, enc);
  const channels = input.w.data.length / (FILTERS_IN * 9);
  if (!Number.isInteger(channels)) throw new Error('Unexpected input layer size: not a classical 112-plane network');
  fold(input, channels);
  const residual: Residual[] = fields
    .filter((x) => x.f === 2)
    .map((r) => {
      const sub = parseFields(bytes, r.s, r.e);
      const c1 = readConvBlock(bytes, sub.find((x) => x.f === 1)!, enc);
      const c2 = readConvBlock(bytes, sub.find((x) => x.f === 2)!, enc);
      fold(c1, channels);
      fold(c2, channels);
      const seF = sub.find((x) => x.f === 3);
      let se: Residual['se'];
      if (seF) {
        const ls = parseFields(bytes, seF.s, seF.e).map((x) => readLayer(bytes, x, enc));
        se = { w1: ls[0]!, b1: ls[1]!, w2: ls[2]!, b2: ls[3]! };
      }
      return { c1, c2, se };
    });
  const p1 = fields.find((x) => x.f === 11);
  const p = fields.find((x) => x.f === 3);
  if (!p1 || !p) throw new Error('This network does not have a convolutional policy head');
  const policy1 = readConvBlock(bytes, p1, enc);
  const policy = readConvBlock(bytes, p, enc);
  fold(policy1, channels);
  const policyChannels = policy.w.data.length / (channels * 9);
  fold(policy, policyChannels);
  return { channels, input, residual, policy1, policy, policyChannels };
}

// ---------------------------------------------------------------- forward pass
function conv3x3(inp: Float32Array, inCh: number, w: Float32Array, outCh: number, blk: ConvBlock, relu: boolean, out: Float32Array, addTo?: Float32Array): void {
  const scale = blk.scale!;
  const shift = blk.shift!;
  for (let o = 0; o < outCh; o++) {
    const acc = new Float32Array(BOARD);
    for (let i = 0; i < inCh; i++) {
      const wBase = (o * inCh + i) * 9;
      const iBase = i * BOARD;
      for (let ky = 0; ky < 3; ky++) {
        const dy = ky - 1;
        for (let kx = 0; kx < 3; kx++) {
          const wv = w[wBase + ky * 3 + kx]!;
          if (wv === 0) continue;
          const dx = kx - 1;
          for (let y = 0; y < 8; y++) {
            const sy = y + dy;
            if (sy < 0 || sy > 7) continue;
            for (let x = 0; x < 8; x++) {
              const sx = x + dx;
              if (sx < 0 || sx > 7) continue;
              acc[y * 8 + x]! += wv * inp[iBase + sy * 8 + sx]!;
            }
          }
        }
      }
    }
    const sc = scale[o]!;
    const sh = shift[o]!;
    for (let s = 0; s < BOARD; s++) {
      let v = acc[s]! * sc + sh;
      if (addTo) v += addTo[o * BOARD + s]!;
      out[o * BOARD + s] = relu && v < 0 ? 0 : v;
    }
  }
}

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

/** Run the network on a 112x64 input; returns the raw policy logits (policyChannels x 64). */
export function forward(net: Lc0Net, planes: Float32Array): Float32Array {
  const C = net.channels;
  let x: Float32Array = new Float32Array(C * BOARD);
  conv3x3(planes, FILTERS_IN, net.input.w.data, C, net.input, true, x);
  for (const r of net.residual) {
    const mid = new Float32Array(C * BOARD);
    conv3x3(x, C, r.c1.w.data, C, r.c1, true, mid);
    const out = new Float32Array(C * BOARD);
    if (r.se) {
      const tmp = new Float32Array(C * BOARD);
      conv3x3(mid, C, r.c2.w.data, C, r.c2, false, tmp);
      const pooled = new Float32Array(C);
      for (let c = 0; c < C; c++) {
        let s = 0;
        for (let k = 0; k < BOARD; k++) s += tmp[c * BOARD + k]!;
        pooled[c] = s / BOARD;
      }
      const seCh = r.se.b1.data.length;
      const h = new Float32Array(seCh);
      for (let j = 0; j < seCh; j++) {
        let s = r.se.b1.data[j]!;
        for (let c = 0; c < C; c++) s += r.se.w1.data[j * C + c]! * pooled[c]!;
        h[j] = s > 0 ? s : 0;
      }
      const o2 = new Float32Array(2 * C);
      for (let j = 0; j < 2 * C; j++) {
        let s = r.se.b2.data[j]!;
        for (let k = 0; k < seCh; k++) s += r.se.w2.data[j * seCh + k]! * h[k]!;
        o2[j] = s;
      }
      for (let c = 0; c < C; c++) {
        const g = sigmoid(o2[c]!);
        const bsh = o2[C + c]!;
        for (let k = 0; k < BOARD; k++) {
          const v = tmp[c * BOARD + k]! * g + bsh + x[c * BOARD + k]!;
          out[c * BOARD + k] = v > 0 ? v : 0;
        }
      }
    } else {
      conv3x3(mid, C, r.c2.w.data, C, r.c2, true, out, x);
    }
    x = out;
  }
  const p1 = new Float32Array(C * BOARD);
  conv3x3(x, C, net.policy1.w.data, C, net.policy1, true, p1);
  const logits = new Float32Array(net.policyChannels * BOARD);
  conv3x3(p1, C, net.policy.w.data, net.policyChannels, net.policy, false, logits);
  return logits;
}

// ---------------------------------------------------------------- input encoding
const PIECE_PLANE: Record<string, number> = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };

/**
 * The 112 input planes for the position `fens[0]` (the position to move in), with up to seven earlier positions after it
 * (most recent first). Everything is seen from the side to move: when Black is to move the board is mirrored top to
 * bottom and the two colours swap roles. Missing history is left empty.
 */
export function encodeInput(fens: string[]): Float32Array {
  const planes = new Float32Array(FILTERS_IN * BOARD);
  const cur = new Chess(fens[0]);
  const us: Color = cur.turn();
  const flip = us === 'b';
  for (let h = 0; h < Math.min(8, fens.length); h++) {
    const g = h === 0 ? cur : new Chess(fens[h]);
    const rows = g.board();
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const p = rows[row]![col];
        if (!p) continue;
        const rank = 7 - row; // chess.js lists rank 8 first
        const r = flip ? 7 - rank : rank;
        const k = PIECE_PLANE[p.type]! + (p.color === us ? 0 : 6);
        planes[(h * 13 + k) * BOARD + r * 8 + col] = 1;
      }
    }
  }
  const them: Color = us === 'w' ? 'b' : 'w';
  const rights = [cur.getCastlingRights(us).q, cur.getCastlingRights(us).k, cur.getCastlingRights(them).q, cur.getCastlingRights(them).k];
  rights.forEach((on, i) => {
    if (on) planes.fill(1, (104 + i) * BOARD, (105 + i) * BOARD);
  });
  if (flip) planes.fill(1, 108 * BOARD, 109 * BOARD);
  planes.fill(Number(cur.fen().split(' ')[4] ?? 0), 109 * BOARD, 110 * BOARD);
  planes.fill(1, 111 * BOARD, 112 * BOARD);
  return planes;
}

// ---------------------------------------------------------------- policy
// The policy head has 80 channels of 8x8 values. Channels 0 to 55 are "queen moves" (direction N, NE, E, SE, S, SW, W, NW,
// seven squares each, channel = direction * 7 + distance - 1), channels 56 to 63 are the eight knight jumps, and 64 to 72 are
// under-promotions. A value at (channel, square) is the score of the move that leaves that square. Everything is from the side
// to move's point of view, so for Black the ranks are mirrored. The mapping was read off the shipped networks by checking
// which moves each channel scores highest in hundreds of positions (tests/lc0net.test.ts repeats that check).
const DIRS: [number, number][] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
];
const KNIGHT: [number, number][] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

/** Channel of a move that goes (dx, dy) squares, from the mover's point of view. */
export function channelOf(dx: number, dy: number): number {
  const k = KNIGHT.findIndex(([x, y]) => x === dx && y === dy);
  if (k >= 0) return 56 + k;
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  const d = DIRS.findIndex(([x, y]) => x * dist === dx && y * dist === dy);
  return d >= 0 ? d * 7 + dist - 1 : -1;
}

export interface MovePrior {
  uci: string;
  /** Probability among the legal moves (they sum to 1). */
  p: number;
}

/** Probability of each legal move according to the network, after a softmax over the legal moves only. Under-promotions are left out. */
export function movePriors(net: Lc0Net, fens: string[], temperature = 1): MovePrior[] {
  const logits = forward(net, encodeInput(fens));
  const game = new Chess(fens[0]);
  const flip = game.turn() === 'b';
  const items: { uci: string; v: number }[] = [];
  for (const m of game.moves({ verbose: true })) {
    if (m.promotion && m.promotion !== 'q') continue;
    const fx = m.from.charCodeAt(0) - 97;
    const tx = m.to.charCodeAt(0) - 97;
    let fy = Number(m.from[1]) - 1;
    let ty = Number(m.to[1]) - 1;
    if (flip) {
      fy = 7 - fy;
      ty = 7 - ty;
    }
    const ch = channelOf(tx - fx, ty - fy);
    if (ch < 0) continue;
    items.push({ uci: `${m.from}${m.to}${m.promotion ?? ''}`, v: logits[ch * BOARD + fy * 8 + fx]! });
  }
  const max = Math.max(...items.map((i) => i.v));
  const w = items.map((i) => Math.exp((i.v - max) / temperature));
  const total = w.reduce((a, b) => a + b, 0);
  return items.map((i, k) => ({ uci: i.uci, p: w[k]! / total })).sort((a, b) => b.p - a.p);
}
