// Copies the Stockfish.js engine files shipped in the `stockfish` npm package into
// public/engines/ so they are served as static, same-origin assets.
//
//   node scripts/prepare-assets.mjs           lite single-threaded WASM + ASM.js fallback (default, ~5 MB)
//   node scripts/prepare-assets.mjs --full    also copy the full-strength single-threaded engine (~99 MB)
//
// Stockfish is GPL-3.0. The licence text is copied next to the binaries and the
// application itself is therefore distributed under GPL-3.0-or-later.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', 'stockfish');
const outDir = join(root, 'public', 'engines');
const withFull = process.argv.includes('--full');

if (!existsSync(pkgDir)) {
  console.error('The "stockfish" package is not installed. Run `npm install` first.');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
const v = pkg.buildVersion ?? '19';

const flavors = [
  {
    id: 'lite-wasm',
    label: `Stockfish ${v} Lite (WebAssembly, 1 thread)`,
    js: `stockfish-${v}-lite-single.js`,
    files: [`stockfish-${v}-lite-single.js`, `stockfish-${v}-lite-single.wasm`],
    wasm: true,
    note: 'Default. Small download, far stronger than any human.',
  },
  {
    id: 'lite-mt',
    label: `Stockfish ${v} Lite (WebAssembly, multi-threaded)`,
    js: `stockfish-${v}-lite.js`,
    files: [`stockfish-${v}-lite.js`, `stockfish-${v}-lite.wasm`],
    wasm: true,
    threads: true,
    note: 'Uses several processor cores, so analysis is faster. Needs a page served with cross-origin isolation (the bundled _headers file and the desktop app do this).',
  },
  {
    id: 'asm',
    label: `Stockfish ${v} (asm.js fallback)`,
    js: `stockfish-${v}-asm.js`,
    files: [`stockfish-${v}-asm.js`],
    wasm: false,
    note: 'Slow compatibility fallback for browsers without WebAssembly.',
  },
];
if (withFull) {
  flavors.push({
    id: 'full-wasm',
    label: `Stockfish ${v} Full (WebAssembly, 1 thread)`,
    js: `stockfish-${v}-single.js`,
    files: [`stockfish-${v}-single.js`, `stockfish-${v}-single.wasm`],
    wasm: true,
    note: 'Strongest network. Large (~99 MB) first download.',
  });
}

const manifest = { stockfishVersion: pkg.version, buildVersion: v, license: pkg.license, flavors: [] };
for (const f of flavors) {
  let ok = true;
  for (const file of f.files) {
    const src = join(pkgDir, 'bin', file);
    if (!existsSync(src)) {
      console.error(`Missing ${src}`);
      ok = false;
      continue;
    }
    const dst = join(outDir, file);
    if (!existsSync(dst) || statSync(dst).size !== statSync(src).size) copyFileSync(src, dst);
  }
  if (ok) {
    const bytes = f.files.reduce((n, file) => n + statSync(join(outDir, file)).size, 0);
    manifest.flavors.push({ id: f.id, label: f.label, js: f.js, wasm: f.wasm, ...(f.threads ? { threads: true } : {}), note: f.note, bytes });
  }
}
if (!manifest.flavors.length) {
  console.error('No engine files could be prepared.');
  process.exit(1);
}
// Keep a previously-copied full engine listed even when this run omitted --full.
if (!withFull && existsSync(join(outDir, `stockfish-${v}-single.wasm`)) && existsSync(join(outDir, `stockfish-${v}-single.js`))) {
  manifest.flavors.push({
    id: 'full-wasm',
    label: `Stockfish ${v} Full (WebAssembly, 1 thread)`,
    js: `stockfish-${v}-single.js`,
    wasm: true,
    note: 'Strongest network. Large (~99 MB) first download.',
    bytes: statSync(join(outDir, `stockfish-${v}-single.js`)).size + statSync(join(outDir, `stockfish-${v}-single.wasm`)).size,
  });
}
copyFileSync(join(pkgDir, 'Copying.txt'), join(outDir, 'LICENSE-stockfish-GPL-3.0.txt'));
writeFileSync(
  join(outDir, 'NOTICE.txt'),
  `Stockfish.js ${pkg.version} (c) Chess.com, LLC - https://github.com/nmrugg/stockfish.js\n` +
    `Based on Stockfish (c) T. Romstad, M. Costalba, J. Kiiski, G. Linscott and other contributors.\n` +
    `Licensed under the GNU General Public License v3.0 (see LICENSE-stockfish-GPL-3.0.txt).\n` +
    `Source code: https://github.com/nmrugg/stockfish.js and https://github.com/official-stockfish/Stockfish\n`,
);
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Prepared engines: ${manifest.flavors.map((f) => f.id).join(', ')}`);
