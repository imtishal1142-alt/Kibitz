// Small browser-test harness: serves the production build from ./dist and drives it with Playwright
// (playwright-core with the Chromium that ships in this environment). No test framework, so the
// results are exactly what was printed.
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

export const ROOT = resolve(new URL('../..', import.meta.url).pathname);
export const SHOTS = join(ROOT, 'tests', 'e2e', 'screens');

export function serveDist(dir = join(ROOT, 'dist')) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let file = normalize(join(dir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store', 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'credentialless' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

export function chromePath() {
  const candidates = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error('No Chromium found. Set CHROME_PATH.');
  return found;
}

export async function launch() {
  return chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
}

/** A fresh, isolated browser context that records console errors, page errors and failed requests. */
export async function openContext(browser, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true, serviceWorkers: 'block', ...opts });
  const problems = [];
  const watch = (page) => {
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`console.error: ${m.text()}`);
    });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => {
      const u = r.url();
      // A request cancelled because the page navigated away is normal, not a failure.
      if (!u.startsWith('data:') && !/ERR_ABORTED/.test(r.failure()?.errorText ?? '')) problems.push(`requestfailed: ${u} ${r.failure()?.errorText ?? ''}`);
    });
  };
  context.on('page', watch);
  return { context, problems };
}

export function reporter() {
  const results = [];
  let current = '';
  return {
    results,
    async test(name, fn) {
      current = name;
      const t0 = Date.now();
      try {
        await fn();
        results.push({ name, ok: true, ms: Date.now() - t0 });
        console.log(`  ok   ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      } catch (e) {
        const msg = e instanceof Error ? e.message.split('\n').slice(0, 6).join('\n') : String(e);
        results.push({ name, ok: false, ms: Date.now() - t0, error: msg });
        console.log(`  FAIL ${name}\n       ${msg.replace(/\n/g, '\n       ')}`);
      }
    },
    get current() {
      return current;
    },
  };
}

export function ensureShots() {
  mkdirSync(SHOTS, { recursive: true });
}

export function assert(cond, message) {
  if (!cond) throw new Error(message);
}
