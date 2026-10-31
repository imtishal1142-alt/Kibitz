// After `vite build`: list every file of the build in the service worker so the whole app is stored on first visit.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(dist, p).split(sep).join('/'));
  }
})(dist);

const skip = new Set(['sw.js']);
// The Maia networks (6 MB) are fetched the first time a Maia bot is played and then kept by the worker's runtime cache.
const list = files.filter((f) => !skip.has(f) && !f.endsWith('.map') && !f.startsWith('maia/'));
const hash = createHash('sha256');
for (const f of list) hash.update(f).update(readFileSync(join(dist, f)));
const version = hash.digest('hex').slice(0, 12);
// "./" is the app page itself; the other entries are relative to the worker's own location.
const precache = ['./', ...list.map((f) => `./${f}`)];
const swPath = join(dist, 'sw.js');
const sw = readFileSync(swPath, 'utf8').replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(precache));
writeFileSync(swPath, sw);
const bytes = list.reduce((n, f) => n + statSync(join(dist, f)).size, 0);
console.log(`service worker ${version}: ${precache.length} files, ${(bytes / 1048576).toFixed(1)} MB`);
