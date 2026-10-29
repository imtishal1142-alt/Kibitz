// Developer tool: measures how long the main screens take to show with a large library (default 150 analysed games).
//   npm run build && node tests/e2e/perf.mjs [games] [--json]
import { launch, openContext, serveDist } from './harness.mjs';

const N = Number(process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : 150);
const { server, url } = await serveDist();
const browser = await launch();
const { context } = await openContext(browser, { viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => localStorage.setItem('kibitz.prefs.v1', JSON.stringify({ onboarded: true, autoAnalyse: false, includeDemoInStats: true })));
const page = await context.newPage();
await page.goto(`${url}#/`);
await page.getByRole('button', { name: /demo game/i }).first().click();
await page.getByRole('region', { name: 'Game review summary' }).waitFor({ timeout: 120000 });
// Clone the analysed demo game N times straight into IndexedDB (database version-agnostic: only the original stores).
const stored = await page.evaluate(async (n) => {
  const open = () => new Promise((res, rej) => { const r = indexedDB.open('kibitz'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const db = await open();
  const all = (store) => new Promise((res) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); });
  const [games, analyses] = await Promise.all([all('games'), all('analyses')]);
  const g0 = games[0], a0 = analyses[0];
  const tx = db.transaction(['games', 'analyses'], 'readwrite');
  for (let i = 0; i < n; i++) {
    const id = `perf-${i}`;
    tx.objectStore('games').put({ ...g0, id, fingerprint: `perf-fp-${i}`, source: 'pgn', userColor: i % 2 ? 'b' : 'w', opponent: `Opp ${i}`, endTime: g0.endTime - i * 86_400_000 / 3, demo: false, tags: [] });
    tx.objectStore('analyses').put({ ...a0, gameId: id });
  }
  await new Promise((res) => (tx.oncomplete = res));
  const bytes = JSON.stringify(a0).length;
  db.close();
  return { bytes };
}, N);
console.log(`library of ${N} analysed games (one analysis is about ${(stored.bytes / 1024).toFixed(0)} KB as JSON)`);

const routes = [['home', ''], ['insights', 'insights'], ['library', 'library'], ['progress', 'progress'], ['session', 'session'], ['analysis', null]];
const rows = [];
for (const [name, route] of routes) {
  const p = await context.newPage();
  await p.addInitScript(() => {
    window.__long = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__long += e.duration))).observe({ type: 'longtask', buffered: true });
  });
  const t0 = Date.now();
  if (route === null) {
    await p.goto(`${url}#/library`);
    await p.waitForFunction(() => document.querySelectorAll('table tbody tr').length > 5, null, { timeout: 60000 });
    const t1 = Date.now();
    await p.locator('table tbody tr').first().getByRole('link').first().click();
    await p.getByRole('region', { name: 'Game review summary' }).waitFor({ timeout: 60000 });
    rows.push([`open a game from the library`, Date.now() - t1, await p.evaluate(() => Math.round(window.__long))]);
  } else {
    await p.goto(`${url}#/${route}`);
    await p.waitForFunction(() => document.querySelector('main h1') && !/Loading|Reading|Spinner/.test(document.querySelector('main')?.innerText.slice(0, 60) ?? ''), null, { timeout: 60000 });
    await p.waitForTimeout(600);
    rows.push([name, Date.now() - t0, await p.evaluate(() => Math.round(window.__long))]);
  }
  await p.close();
}
console.log('\nscreen                         ready (ms)   main-thread blocked >50 ms tasks (ms)');
for (const [n, t, l] of rows) console.log(`${n.padEnd(30)} ${String(t).padStart(8)}   ${String(l).padStart(8)}`);
await browser.close();
server.close();
