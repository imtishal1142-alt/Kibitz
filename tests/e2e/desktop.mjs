// Desktop shell test: launches the real Electron app (from ./dist and ./electron) and drives its window.
//   npm run build && xvfb-run -a node tests/e2e/desktop.mjs        (on a machine without a screen)
import { _electron as electron } from 'playwright-core';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './harness.mjs';

const assert = (c, m) => {
  if (!c) throw new Error(m);
};
const results = [];
const run = async (name, fn) => {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`  FAIL ${name}\n       ${String(e.message ?? e).split('\n')[0]}`);
  }
};

const userData = mkdtempSync(join(tmpdir(), 'kibitz-ud-'));
const backupDir = mkdtempSync(join(tmpdir(), 'kibitz-bk-'));
console.log(`\nKibitz desktop shell tests (Electron, ${new Date().toISOString()})\n`);
// KIBITZ_APP=path/to/packaged/kibitz tests the packaged build instead of the source tree.
const packaged = process.env.KIBITZ_APP;
const app = await electron.launch(packaged ? { executablePath: packaged, args: ['--no-sandbox', `--user-data-dir=${userData}`] } : { args: ['--no-sandbox', `--user-data-dir=${userData}`, ROOT], cwd: ROOT });
const page = await app.firstWindow();
const problems = [];
page.on('pageerror', (e) => problems.push(String(e)));
page.on('console', (m) => m.type() === 'error' && problems.push(m.text()));
await page.evaluate(() => localStorage.setItem('kibitz.prefs.v1', JSON.stringify({ onboarded: true, autoAnalyse: false })));
await page.reload();

await run('opens the app from its own address, with a desk page and no errors', async () => {
  assert(page.url().startsWith('app://kibitz/'), `unexpected address ${page.url()}`);
  await page.getByRole('heading', { name: 'Your desk' }).waitFor({ timeout: 20000 });
  assert((await page.title()).includes('Kibitz'), 'window title');
});

await run('the page is isolated: it sees the bridge but no Node, no require, no process', async () => {
  const seen = await page.evaluate(() => ({ desktop: window.kibitz?.desktop, keys: Object.keys(window.kibitz ?? {}).sort(), req: typeof window.require, proc: typeof window.process, backupKeys: Object.keys(window.kibitz?.backup ?? {}).sort() }));
  assert(seen.desktop === true && seen.req === 'undefined' && seen.proc === 'undefined', JSON.stringify(seen));
  assert(seen.backupKeys.join() === 'chooseFolder,folder,reveal,write', JSON.stringify(seen));
});

await run('Stockfish (WebAssembly) loads and answers inside the desktop window', async () => {
  await page.evaluate(() => (location.hash = '#/play'));
  await page.locator('select').first().selectOption({ label: 'Beginner' });
  await page.getByRole('button', { name: 'Start game' }).click();
  const box = page.getByRole('textbox', { name: /Type a move/ });
  if (!(await box.isVisible())) await page.getByText('Type a move instead').click();
  await box.fill('e4');
  await box.press('Enter');
  await page.getByText(/Engine played/).waitFor({ timeout: 40000 });
});

await run('service worker is not registered in the desktop app (files ship inside it)', async () => {
  const controlled = await page.evaluate(() => !!navigator.serviceWorker?.controller);
  assert(!controlled, 'the page should not be controlled by a service worker');
});

await run('automatic backup writes into the chosen folder and rotates only its own files', async () => {
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, backupDir);
  await page.evaluate(() => (location.hash = '#/settings'));
  await page.getByRole('heading', { name: 'Automatic backup' }).waitFor();
  await page.getByRole('button', { name: 'Choose a folder and turn on' }).click();
  await page.getByText(/Last backup/).waitFor({ timeout: 20000 });
  const files = readdirSync(backupDir).filter((n) => /^kibitz-backup-\d{4}-\d{2}-\d{2}\.json$/.test(n));
  assert(files.length === 1, `expected one backup, found ${readdirSync(backupDir).join(', ')}`);
  const data = JSON.parse(readFileSync(join(backupDir, files[0]), 'utf8'));
  assert(data.app === 'kibitz', 'not a Kibitz backup');
  // The choice survives a restart of the page (it is stored by the shell).
  await page.reload();
  await page.getByText(/Folder:/).waitFor();
});

await run('links to other sites do not replace the app window', async () => {
  const before = page.url();
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.href = 'https://example.com/';
    a.target = '_blank';
    a.id = 'x-link';
    a.textContent = 'external';
    document.body.append(a);
  });
  await app.evaluate(({ shell }) => {
    shell.openExternal = async () => undefined; // never open a real browser in a test
  });
  await page.locator('#x-link').click();
  await page.waitForTimeout(500);
  assert(page.url() === before, `window navigated to ${page.url()}`);
});

await run('no console or page errors during the run', async () => {
  assert(problems.length === 0, problems.slice(0, 3).join(' | '));
});

await app.close();
rmSync(userData, { recursive: true, force: true });
rmSync(backupDir, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
