// UCI protocol parsing and command building. Pure functions, no I/O.
import type { Score } from '../types';

export interface RawInfo {
  depth?: number;
  seldepth?: number;
  multipv: number;
  /** Score from the SIDE TO MOVE's point of view, exactly as the engine reports it. */
  score?: Score;
  bound?: 'lower' | 'upper';
  wdl?: [number, number, number];
  nodes?: number;
  nps?: number;
  time?: number;
  hashfull?: number;
  pv: string[];
}

export function parseInfo(line: string): RawInfo | null {
  if (!line.startsWith('info ')) return null;
  const t = line.trim().split(/\s+/);
  const out: RawInfo = { multipv: 1, pv: [] };
  let sawUseful = false;
  for (let i = 1; i < t.length; i++) {
    const k = t[i];
    switch (k) {
      case 'string':
        return null;
      case 'depth':
        out.depth = Number(t[++i]);
        break;
      case 'seldepth':
        out.seldepth = Number(t[++i]);
        break;
      case 'multipv':
        out.multipv = Number(t[++i]);
        break;
      case 'nodes':
        out.nodes = Number(t[++i]);
        break;
      case 'nps':
        out.nps = Number(t[++i]);
        break;
      case 'time':
        out.time = Number(t[++i]);
        break;
      case 'hashfull':
        out.hashfull = Number(t[++i]);
        break;
      case 'tbhits':
      case 'currmovenumber':
        i++;
        break;
      case 'currmove':
        return null;
      case 'wdl':
        out.wdl = [Number(t[i + 1]), Number(t[i + 2]), Number(t[i + 3])];
        i += 3;
        break;
      case 'score': {
        const type = t[++i];
        const val = Number(t[++i]);
        if (!Number.isFinite(val)) return null;
        if (type === 'cp') out.score = { kind: 'cp', cp: val };
        else if (type === 'mate') out.score = { kind: 'mate', mate: val };
        else return null;
        if (t[i + 1] === 'lowerbound') {
          out.bound = 'lower';
          i++;
        } else if (t[i + 1] === 'upperbound') {
          out.bound = 'upper';
          i++;
        }
        sawUseful = true;
        break;
      }
      case 'pv':
        out.pv = t.slice(i + 1).filter((m) => /^[a-h][1-8][a-h][1-8][qrbnk]?$/.test(m));
        i = t.length;
        sawUseful = true;
        break;
      default:
        break;
    }
  }
  return sawUseful ? out : null;
}

export interface BestMove {
  best: string | null;
  ponder?: string;
}

export function parseBestmove(line: string): BestMove | null {
  const m = /^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/.exec(line);
  if (!m) return null;
  const best = m[1]!;
  if (best === '(none)' || best === '0000') return { best: null };
  return { best, ponder: m[2] };
}

export interface UciOption {
  name: string;
  type: 'check' | 'spin' | 'combo' | 'button' | 'string';
  default?: string;
  min?: number;
  max?: number;
  vars?: string[];
}

export function parseOption(line: string): UciOption | null {
  if (!line.startsWith('option ')) return null;
  const t = line.trim().split(/\s+/);
  const idx = (kw: string, from = 0) => t.indexOf(kw, from);
  const nameI = idx('name');
  const typeI = idx('type', nameI + 1);
  if (nameI < 0 || typeI < 0) return null;
  const name = t.slice(nameI + 1, typeI).join(' ');
  const type = t[typeI + 1] as UciOption['type'];
  if (!['check', 'spin', 'combo', 'button', 'string'].includes(type)) return null;
  const opt: UciOption = { name, type };
  const keywords = ['default', 'min', 'max', 'var'];
  let i = typeI + 2;
  while (i < t.length) {
    const kw = t[i]!;
    if (!keywords.includes(kw)) {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < t.length && !keywords.includes(t[j]!)) j++;
    const val = t.slice(i + 1, j).join(' ');
    if (kw === 'default') opt.default = val;
    else if (kw === 'min') opt.min = Number(val);
    else if (kw === 'max') opt.max = Number(val);
    else (opt.vars ??= []).push(val);
    i = j;
  }
  return opt;
}

export interface GoParams {
  depth?: number;
  movetime?: number;
  nodes?: number;
  infinite?: boolean;
  wtime?: number;
  btime?: number;
  winc?: number;
  binc?: number;
  movestogo?: number;
  searchmoves?: string[];
}

export function buildGo(p: GoParams): string {
  const parts = ['go'];
  if (p.wtime !== undefined) parts.push('wtime', String(Math.max(0, Math.round(p.wtime))));
  if (p.btime !== undefined) parts.push('btime', String(Math.max(0, Math.round(p.btime))));
  if (p.winc !== undefined) parts.push('winc', String(Math.max(0, Math.round(p.winc))));
  if (p.binc !== undefined) parts.push('binc', String(Math.max(0, Math.round(p.binc))));
  if (p.movestogo !== undefined) parts.push('movestogo', String(p.movestogo));
  if (p.depth !== undefined) parts.push('depth', String(Math.max(1, Math.round(p.depth))));
  if (p.nodes !== undefined) parts.push('nodes', String(Math.max(1, Math.round(p.nodes))));
  if (p.movetime !== undefined) parts.push('movetime', String(Math.max(1, Math.round(p.movetime))));
  const hasLimit = p.depth !== undefined || p.nodes !== undefined || p.movetime !== undefined || p.wtime !== undefined || p.btime !== undefined;
  if (p.infinite || !hasLimit) parts.push('infinite');
  // `searchmoves` must be last: the engine treats every following token as a move.
  if (p.searchmoves?.length) parts.push('searchmoves', ...p.searchmoves);
  return parts.join(' ');
}
