// Developer tool: renders public/icons/*.png from the icon drawing below (needs the Playwright Chromium).
//   node scripts/make-icons.mjs
import { launch } from '../tests/e2e/harness.mjs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const BG = '#262522';
const FG = '#81b64c';
// A knight in profile, drawn as a single stroke path on a 32x32 grid (original artwork for this project).
const mark = `<path d="M10 24h12M11 24c0-4 1-6 3-8l-3-3 3-4 3 1c2 1 3 3 3 6 0 2-1 4-1 8" fill="none" stroke="${FG}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = (inner, rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="${rx}" fill="${BG}"/>${inner}</svg>`;
const plain = svg(mark, 7);
// Maskable icons need the artwork inside the central 80%: shrink it, and let the background fill the square.
const maskable = svg(`<g transform="translate(16 16) scale(.72) translate(-16 -16)">${mark}</g>`, 0);
writeFileSync(join(out, 'icon.svg'), plain);
writeFileSync(join(out, 'icon-maskable.svg'), maskable);

const browser = await launch();
for (const [file, source, size] of [['icon-192.png', plain, 192], ['icon-512.png', plain, 512], ['icon-maskable-512.png', maskable, 512], ['apple-touch-icon.png', maskable, 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: join(out, file), omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons written to', out);
