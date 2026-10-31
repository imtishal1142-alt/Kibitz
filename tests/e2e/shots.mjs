// Developer tool: screenshots of the main screens (demo data) into tests/e2e/screens.
//   npm run build && node tests/e2e/shots.mjs [dark|light] [width] [prefix]
import { join } from 'node:path';
import { SHOTS, ensureShots, launch, openContext, serveDist } from './harness.mjs';

ensureShots();
const theme = process.argv[2] ?? 'dark';
const width = Number(process.argv[3] ?? 1440);
const prefix = process.argv[4] ?? 's';
const { server, url } = await serveDist();
const browser = await launch();
const { context } = await openContext(browser, { viewport: { width, height: width < 700 ? 860 : 900 }, colorScheme: theme });
await context.addInitScript(([t, extra]) => localStorage.setItem('kibitz.prefs.v1', JSON.stringify({ onboarded: true, autoAnalyse: false, theme: t, includeDemoInStats: true, ...extra })), [theme, JSON.parse(process.env.KIBITZ_PREFS ?? '{}')]);
const page = await context.newPage();
await page.goto(`${url}#/`);
await page.getByRole('button', { name: /demo game/i }).first().click();
await page.getByRole('region', { name: 'Game review summary' }).waitFor({ timeout: 120000 });
await page.waitForTimeout(500);
const shot = async (name, route, wait = 700) => {
  if (route !== null) await page.goto(`${url}#/${route}`);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: join(SHOTS, `${prefix}-${name}.png`) });
};
await shot('review', null);
await shot('home', '');
await shot('play', 'play');
await shot('bots', 'bots');
await shot('insights', 'insights');
await shot('library', 'library');
await shot('train', 'train');
await browser.close();
server.close();
