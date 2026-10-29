// Developer tool: how long does the background queue take for N unrelated games with W games analysed at once?
//   npm run build && node tests/e2e/perf-analysis.mjs 6 1 3
import { Chess } from 'chess.js';
import { launch, openContext, serveDist } from './harness.mjs';

const n = Number(process.argv[2] ?? 6);
const workerSettings = (process.argv.slice(3).length ? process.argv.slice(3) : ['1', '3']).map(Number);
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
function game(i) {
  const c = new Chess();
  while (!c.isGameOver() && c.history().length < 60) {
    const m = c.moves();
    c.move(m[Math.floor(rnd() * m.length)]);
  }
  c.setHeader('Event', `Perf ${i}`);
  c.setHeader('White', 'Me');
  c.setHeader('Black', `Opp${i}`);
  c.setHeader('Date', `2026.10.${String(1 + (i % 28)).padStart(2, '0')}`);
  return c.pgn();
}
const games = Array.from({ length: n }, (_, i) => game(i));
const { server, url } = await serveDist();
const browser = await launch();
for (const w of workerSettings) {
  const { context } = await openContext(browser);
  await context.addInitScript((w) => {
    try {
      localStorage.setItem('kibitz.prefs.v1', JSON.stringify({ onboarded: true, autoAnalyse: false, analysisPreset: 'standard', analysisWorkers: w }));
    } catch {
      /* about:blank has no storage */
    }
  }, w);
  const page = await context.newPage();
  await page.goto(`${url}#/library`);
  await page.getByRole('button', { name: 'Add games or a position' }).click();
  await page.getByPlaceholder(/Event "Casual game"/).fill(games.join('\n\n'));
  await page.locator('#pgn-me').fill('Me');
  await page.getByRole('button', { name: 'Import pasted PGN' }).click();
  await page.getByText(new RegExp(`Added ${n} games`)).first().waitFor();
  const t0 = Date.now();
  await page.getByRole('button', { name: /Analyse shown/ }).click();
  await page.waitForFunction((k) => !/not analysed/.test(document.body.innerText) && document.querySelectorAll('table tbody tr').length === k, n, { timeout: 900000, polling: 250 });
  const secs = (Date.now() - t0) / 1000;
  console.log(`${n} games, ${w} at once: ${secs.toFixed(1)} s (${(secs / n).toFixed(1)} s per game)`);
  await context.close();
}
await browser.close();
server.close();
