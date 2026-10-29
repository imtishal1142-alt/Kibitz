// Builds src/data/openings.json from the lichess-org/chess-openings dataset (CC0 / public domain).
// The generated file is committed, so a normal build needs no network access.
//
//   node scripts/build-openings.mjs
//
// Each entry: [eco, name, epd, san-moves]. `epd` is the position after the last move
// (first four FEN fields), which makes lookups transposition-safe.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/';
const entries = [];
const seen = new Map();

for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const res = await fetch(`${base}${f}.tsv`);
  if (!res.ok) throw new Error(`Failed to fetch ${f}.tsv: HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  for (const line of lines.slice(1)) {
    const [eco, name, pgn] = line.split('\t');
    if (!eco || !name || !pgn) continue;
    const chess = new Chess();
    const sans = [];
    try {
      for (const tok of pgn.replace(/\d+\.(\.\.)?/g, ' ').split(/\s+/).filter(Boolean)) {
        const mv = chess.move(tok);
        sans.push(mv.san);
      }
    } catch (err) {
      console.warn(`Skipping ${eco} ${name}: ${err.message}`);
      continue;
    }
    const epd = chess.fen().split(' ').slice(0, 4).join(' ');
    // Several lines can reach the same position; keep the one with the most moves (most specific name).
    const prev = seen.get(epd);
    if (prev !== undefined && entries[prev][3].split(' ').length >= sans.length) continue;
    const row = [eco, name, epd, sans.join(' ')];
    if (prev !== undefined) entries[prev] = row;
    else {
      seen.set(epd, entries.length);
      entries.push(row);
    }
  }
}
mkdirSync(join(root, 'src', 'data'), { recursive: true });
writeFileSync(join(root, 'src', 'data', 'openings.json'), JSON.stringify(entries));
console.log(`Wrote ${entries.length} openings`);
