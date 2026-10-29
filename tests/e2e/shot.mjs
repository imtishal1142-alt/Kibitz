// Developer tool: opens the demo game in the production build and writes screenshots to tests/e2e/screens.
//   npm run build && node tests/e2e/shot.mjs [dark|light] [width] [name]
import { join } from 'node:path';
import { SHOTS, ensureShots, launch, openContext, serveDist } from './harness.mjs';

ensureShots();
const theme = process.argv[2] ?? 'dark';
const width = Number(process.argv[3] ?? 1440);
const name = process.argv[4] ?? 'review';
const { server, url } = await serveDist();
const browser = await launch();
const { context } = await openContext(browser, { viewport: { width, height: width < 700 ? 900 : 950 }, colorScheme: theme });
await context.addInitScript((t) => localStorage.setItem('kibitz.prefs.v1', JSON.stringify({ onboarded: true, autoAnalyse: false, theme: t })), theme);
const page = await context.newPage();
await page.goto(url);
await page.goto(`${url}#/`);
await page.getByRole('button', { name: /demo game/i }).first().click().catch(() => undefined);
await page.waitForFunction(() => /Game review/.test(document.body.innerText) && !/Analysing/.test(document.body.innerText), null, { timeout: 120000 });
await page.waitForTimeout(800);
await page.screenshot({ path: join(SHOTS, `${name}-1-summary.png`), fullPage: true });
await page.getByRole('button', { name: /Start review/ }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: join(SHOTS, `${name}-2-review.png`), fullPage: true });
await browser.close();
server.close();
