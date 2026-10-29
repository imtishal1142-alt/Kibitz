// Opening recognition from the lichess-org/chess-openings dataset (CC0). The table is loaded lazily
// because it is ~600 KB. Names come from position matching (transposition-safe), so an opening is
// reported even if the moves were played in a different order.
import { fenKey } from './rules';

export interface OpeningEntry {
  eco: string;
  name: string;
  epd: string;
  sans: string[];
}

let byEpd: Map<string, OpeningEntry> | null = null;
let all: OpeningEntry[] = [];
let children: Map<string, Map<string, Set<string>>> | null = null;
let loading: Promise<void> | null = null;

export function loadOpenings(): Promise<void> {
  loading ??= import('../../data/openings.json').then((mod) => {
    const rows = (mod as unknown as { default: string[][] }).default;
    byEpd = new Map();
    all = [];
    children = new Map();
    for (const [eco, name, epd, moves] of rows) {
      if (!eco || !name || !epd || !moves) continue;
      const entry: OpeningEntry = { eco, name, epd, sans: moves.split(' ') };
      byEpd.set(epd, entry);
      all.push(entry);
      for (let i = 0; i < entry.sans.length; i++) {
        const prefix = entry.sans.slice(0, i).join(' ');
        let m = children!.get(prefix);
        if (!m) children!.set(prefix, (m = new Map()));
        let names = m.get(entry.sans[i]!);
        if (!names) m.set(entry.sans[i]!, (names = new Set()));
        if (i === entry.sans.length - 1) names.add(entry.name);
      }
    }
  });
  return loading;
}

export const openingsLoaded = (): boolean => byEpd !== null;

export interface DetectedOpening {
  eco: string;
  name: string;
  /** Number of plies after which the named position was reached (0 = start). */
  plies: number;
}

/**
 * Deepest named position along a game. `fens[i]` is the position after ply i (fens[0] = start).
 * Only the first 40 plies are inspected: opening names do not extend further.
 */
export function detectOpening(fens: string[]): DetectedOpening | null {
  if (!byEpd) return null;
  let found: DetectedOpening | null = null;
  const limit = Math.min(fens.length, 41);
  for (let i = 1; i < limit; i++) {
    const hit = byEpd.get(fenKey(fens[i]!));
    if (hit) found = { eco: hit.eco, name: hit.name, plies: i };
  }
  return found;
}

export function openingAt(fen: string): OpeningEntry | null {
  return byEpd?.get(fenKey(fen)) ?? null;
}

/** Named continuations from a SAN prefix (move-order based, not transposition-aware). */
export function theoryContinuations(prefix: string[]): { san: string; names: string[] }[] {
  const m = children?.get(prefix.join(' '));
  if (!m) return [];
  return [...m.entries()].map(([san, names]) => ({ san, names: [...names] })).sort((a, b) => a.san.localeCompare(b.san));
}

export function searchOpenings(query: string, limit = 30): OpeningEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return all.filter((o) => o.name.toLowerCase().includes(q) || o.eco.toLowerCase() === q).slice(0, limit);
}

export function allOpenings(): OpeningEntry[] {
  return all;
}

/** Family name ("Sicilian Defense" for "Sicilian Defense: Najdorf Variation"). */
export function openingFamily(name: string): string {
  return name.split(':')[0]!.trim();
}
