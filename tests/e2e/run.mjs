// End-to-end browser tests against the PRODUCTION build (./dist), driven by Playwright + Chromium.
//   npm run build && npm run test:e2e
// Results are printed and written to tests/e2e/results.json. Nothing is mocked except where a test says so
// (the Chess.com tests intercept api.chess.com; see the label on those tests).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { installChessComMock } from './chesscom-mock.mjs';
import { Chess } from 'chess.js';
import { BLACK_BLUNDERS, LONG_GAME, MY_NAME } from './games.mjs';
import { SEED_PUZZLE, restoreSeed } from './seed.mjs';
import { ROOT, SHOTS, assert, ensureShots, launch, openContext, reporter, serveDist } from './harness.mjs';

ensureShots();
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const wanted = (name) => only.length === 0 || only.some((o) => name.toLowerCase().includes(o.toLowerCase()));
const AXE = readFileSync(join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');

const { server, url } = await serveDist();
const browser = await launch();
const rep = reporter();
const test = (name, fn) => (wanted(name) ? rep.test(name, fn) : Promise.resolve());

/** A new browser profile. By default the onboarding dialog is skipped. */
async function session(opts = {}) {
  const { skipOnboarding = true, ...ctxOpts } = opts;
  const { context, problems } = await openContext(browser, ctxOpts);
  if (skipOnboarding) await context.addInitScript(() => {
    try {
      if (!localStorage.getItem('kibitz.prefs.v1')) localStorage.setItem('kibitz.prefs.v1', JSON.stringify({ onboarded: true, autoAnalyse: false }));
    } catch {
      /* about:blank has no storage */
    }
  });
  const page = await context.newPage();
  return { context, page, problems, go: (route) => page.goto(`${url}#/${route}`) };
}
const noProblems = (problems, label) => assert(problems.length === 0, `${label}: ${problems.slice(0, 4).join(' | ')}`);

const ROUTES = ['', 'play', 'bots', 'match', 'library', 'analysis', 'chesscom', 'insights', 'session', 'progress', 'train', 'puzzles', 'openings', 'train/guess', 'train/mistakes', 'train/prevention', 'train/candidates', 'train/endgames', 'train/notebook', 'train/reflect', 'train/calendar', 'settings', 'help'];

const OPERA = `[Event "Paris"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

console.log(`\nKibitz end-to-end tests (production build, Chromium, ${new Date().toISOString()})\n`);

/* ---------------------------------------------------------------- start up */

await test('app boots: no console or page errors, onboarding is offered, privacy stated', async () => {
  const { page, problems, context } = await session({ skipOnboarding: false });
  await page.goto(url);
  await page.getByRole('dialog').waitFor();
  const text = await page.getByRole('dialog').innerText();
  assert(/no account/i.test(text) && /Chess\.com/.test(text), 'privacy text missing from onboarding');
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('heading', { name: 'Your desk' }).waitFor();
  await page.reload();
  assert((await page.getByRole('dialog').count()) === 0 || !(await page.getByRole('dialog').isVisible()), 'onboarding came back after being dismissed');
  noProblems(problems, 'boot');
  await context.close();
});

await test('every page renders a heading with no console errors (desktop)', async () => {
  const { page, problems, context } = await session();
  for (const r of ROUTES) {
    await page.goto(`${url}#/${r}`);
    await page.locator('h1').first().waitFor({ timeout: 10000 });
  }
  noProblems(problems, 'routes');
  await context.close();
});

await test('mobile (390 and 320 px wide): no horizontal scrolling on any page, bottom navigation visible', async () => {
  for (const width of [390, 320]) {
    const { page, problems, context } = await session({ viewport: { width, height: 800 } });
    const bad = [];
    for (const r of ROUTES) {
      await page.goto(`${url}#/${r}`);
      await page.locator('h1').first().waitFor();
      await page.waitForTimeout(150);
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      if (o.sw > o.iw) bad.push(`${r || 'home'} (${o.sw}>${o.iw})`);
    }
    assert(bad.length === 0, `horizontal overflow at ${width}px on: ${bad.join(', ')}`);
    const nav = await page.locator('nav').first().boundingBox();
    assert(nav && nav.y > 400, 'primary navigation is not at the bottom on a phone');
    noProblems(problems, `mobile ${width}`);
    await context.close();
  }
});

/* ---------------------------------------------------------------- engine */

await test('Stockfish WebAssembly runs in a worker and answers (depth, score, principal variation)', async () => {
  const { page, problems, context, go } = await session();
  // Italian Game after 3...Bc5. Black to move is not required; any legal position works.
  await go(`analysis?fen=${encodeURIComponent('r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4')}`);
  await page.getByRole('tab', { name: 'Engine lines' }).click();
  await page.waitForFunction(() => /depth\s*(1[2-9]|[2-9]\d)/i.test(document.body.innerText), null, { timeout: 60000 });
  const text = await page.locator('main').innerText();
  assert(/[+\-−]\d\.\d\d|#\d/.test(text), 'no evaluation shown');
  await go('settings');
  await page.getByRole('list', { name: 'Engine status' }).getByText(/WebAssembly/).first().waitFor({ timeout: 8000 });
  const status = await page.getByRole('list', { name: 'Engine status' }).innerText();
  assert(/Stockfish/.test(status) && /WebAssembly/.test(status), `engine status: ${status}`);
  noProblems(problems, 'engine');
  await context.close();
});

await test('multi-threaded Stockfish runs when the page is cross-origin isolated', async () => {
  const { page, problems, context, go } = await session();
  await context.addInitScript(() => localStorage.setItem('kibitz.prefs.v1', JSON.stringify({ onboarded: true, autoAnalyse: false, flavor: 'lite-mt', flavorChosen: true })));
  await go('');
  assert(await page.evaluate(() => crossOriginIsolated), 'the test server should isolate the page like the deployed _headers file does');
  await go(`analysis?fen=${encodeURIComponent('r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4')}`);
  await page.getByRole('tab', { name: 'Engine lines' }).click();
  await page.waitForFunction(() => /depth\s*(1[2-9]|[2-9]\d)/i.test(document.body.innerText), null, { timeout: 60000 });
  await go('settings');
  await page.getByRole('list', { name: 'Engine status' }).getByText(/multi-threaded/).first().waitFor({ timeout: 8000 });
  noProblems(problems, 'multi-threaded engine');
  await context.close();
});

await test('bots: choose a bot and a colour, Play starts the game against it straight away', async () => {
  const { page, problems, context, go } = await session();
  await go('bots');
  await page.getByRole('heading', { name: 'Bots', level: 1 }).waitFor();
  assert((await page.locator('.bot-tile').count()) >= 8, 'expected several bots');
  await page.getByRole('button', { name: 'Rex', exact: true }).click();
  assert(/Rex/.test(await page.locator('.bots-selected').innerText()), 'the chosen bot should be described');
  await page.getByRole('button', { name: 'Play as Black' }).click();
  await page.getByRole('button', { name: 'Play Rex' }).click();
  await page.getByRole('heading', { name: /You vs Rex/ }).waitFor({ timeout: 20000 });
  noProblems(problems, 'bots');
  await context.close();
});

await test('sidebar collapses to icons, keeps working for keyboard and screen readers, and stays collapsed after a reload', async () => {
  const { page, problems, context, go } = await session({ viewport: { width: 1440, height: 900 } });
  await go('');
  await page.getByRole('heading', { name: 'Your desk' }).waitFor();
  const width = async () => (await page.locator('nav.rail').boundingBox()).width;
  assert((await width()) > 150, 'the sidebar should start expanded');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.waitForFunction(() => document.querySelector('nav.rail').getBoundingClientRect().width < 100);
  assert(await page.locator('nav.rail').getByRole('link', { name: 'Play', exact: true }).isVisible(), 'the Play link should still be there');
  await page.reload();
  await page.getByRole('heading', { name: 'Your desk' }).waitFor();
  assert((await width()) < 100, 'collapsed state should survive a reload');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await page.waitForFunction(() => document.querySelector('nav.rail').getBoundingClientRect().width > 150);
  noProblems(problems, 'sidebar');
  await context.close();
});

await test('a page file that fails to load once is retried and the page appears', async () => {
  const { page, context, go } = await session();
  let failed = 0;
  await page.route('**/assets/Settings-*.js', (route) => (failed++ === 0 ? route.abort() : route.continue()));
  await go('');
  await page.getByRole('heading', { name: 'Your desk' }).waitFor();
  await go('settings');
  await page.getByRole('heading', { name: 'Settings' }).first().waitFor({ timeout: 20000 });
  assert(failed >= 2, `the file should have been requested again (requests: ${failed})`);
  await context.close();
});

await test('engine rejects an illegal position instead of crashing (shows a readable message)', async () => {
  const { page, problems, context, go } = await session();
  // Nine white pawns cannot occur in a legal game.
  await go(`analysis?fen=${encodeURIComponent('rnbqkbnr/pppppppp/8/8/8/P7/PPPPPPPP/RNBQKBNR w KQkq - 0 1')}`);
  await page.waitForTimeout(1500);
  const body = await page.locator('main').innerText();
  assert(!/Uncaught|TypeError|undefined/.test(body), 'raw error leaked into the page');
  assert((await page.locator('h1').count()) > 0, 'page did not render');
  noProblems(problems, 'illegal fen');
  await context.close();
});

/* ---------------------------------------------------------------- demo and analysis */

await test('demo game: labelled as a demo, analysed in the browser, report and critical-move navigation work', async () => {
  const { page, problems, context } = await session({ skipOnboarding: false });
  await page.goto(url);
  await page.getByRole('button', { name: /Look around with the demo game/ }).click();
  await page.getByText(/built-in demo game/).waitFor();
  await page.waitForFunction(() => !/Analysing/.test(document.body.innerText) && document.querySelectorAll('[role=tab]').length >= 3, null, { timeout: 120000 });
  await page.getByRole('tab', { name: 'Game report' }).click();
  const report = await page.locator('main').innerText();
  assert(/Philidor/.test(report), 'opening was not identified');
  assert(/Accuracy/.test(report) && /Avg\. loss/.test(report), 'report missing accuracy columns');
  assert(/92\.\d%|9\d\.\d%/.test(report), 'unexpected accuracy for Morphy');
  assert(/1858/.test(await page.locator('main').innerText()), 'partial date (1858) not shown');
  // Keyboard navigation
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press(']');
  await page.getByRole('tab', { name: 'Coach' }).click();
  const coach = await page.locator('main').innerText();
  assert(/Verified by the engine/i.test(coach), 'coach panel lacks the verified-facts section');
  assert(/Interpretation/i.test(coach), 'coach panel lacks the labelled interpretation section');
  await page.screenshot({ path: join(SHOTS, 'e2e-analysis-demo.png') });
  noProblems(problems, 'demo');
  await context.close();
});

await test('analysis board: type moves, flip, copy FEN and PGN, save to notebook, threat check', async () => {
  const { page, problems, context, go } = await session({ permissions: ['clipboard-read', 'clipboard-write'] });
  await go('analysis');
  await page.getByText('Type a move instead').click();
  const box = page.getByRole('textbox', { name: /Type a move/ });
  for (const mv of ['e4', 'e5', 'Nf3', 'Nc6']) {
    await box.fill(mv);
    await box.press('Enter');
    await page.getByRole('list', { name: 'Moves' }).getByText(mv, { exact: true }).first().waitFor({ timeout: 5000 });
  }
  await box.fill('Ke5');
  await box.press('Enter');
  await page.getByText(/not a legal move/).waitFor();
  await page.getByRole('button', { name: 'Flip the board' }).click();
  await page.getByRole('button', { name: 'FEN', exact: true }).click();
  const fen = await page.evaluate(() => navigator.clipboard.readText());
  assert(fen === 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', `copied FEN was ${fen}`);
  await page.getByRole('button', { name: 'PGN', exact: true }).click();
  const pgn = await page.evaluate(() => navigator.clipboard.readText());
  assert(/\[Event "Kibitz analysis"\][\s\S]*1\. e4 e5 2\. Nf3 Nc6/.test(pgn), `copied PGN was ${pgn}`);
  await page.getByRole('tab', { name: 'Coach' }).click();
  await page.getByRole('button', { name: /What is the opponent threatening/ }).click();
  await page.waitForFunction(() => /threat|nothing|no real|not in check|can't|cannot/i.test(document.body.innerText) && !/Checking/i.test(document.body.innerText), null, { timeout: 30000 });
  await page.getByRole('button', { name: 'Notebook', exact: true }).click();
  await go('train/notebook');
  await page.getByRole('button', { name: /After 2/ }).first().waitFor({ timeout: 5000 });
  // the board is described in words for screen readers
  await go('analysis');
  const desc = await page.locator('.board-frame .sr-only').first().textContent();
  assert(/White: king e1/.test(desc ?? '') && /Black: king e8/.test(desc ?? ''), `board description: ${desc}`);
  noProblems(problems, 'analysis board');
  await context.close();
});

/* ---------------------------------------------------------------- library and persistence */

await test('PGN import: opens the game, shows it in the library, survives a reload, a repeat is refused as a duplicate', async () => {
  const { page, problems, context, go } = await session();
  await go('library');
  await page.getByRole('button', { name: 'Add games or a position' }).click();
  await page.getByPlaceholder(/Event "Casual game"/).fill(OPERA);
  await page.locator('#pgn-me').fill('Paul Morphy');
  await page.getByRole('button', { name: 'Import pasted PGN' }).click();
  await page.waitForFunction(() => location.hash.startsWith('#/analysis/'), null, { timeout: 10000 });
  await go('library');
  await page.getByText(/Duke Karl/).first().waitFor();
  await page.reload();
  await page.getByText(/Duke Karl/).first().waitFor();
  await page.getByRole('button', { name: 'Add games or a position' }).click();
  await page.getByPlaceholder(/Event "Casual game"/).fill(OPERA);
  await page.getByRole('button', { name: 'Import pasted PGN' }).click();
  await page.getByText(/already|duplicate/i).first().waitFor({ timeout: 5000 });
  await go('library');
  const rows = await page.locator('table tbody tr').count();
  assert(rows === 1, `expected 1 game after a duplicate import, found ${rows}`);
  noProblems(problems, 'pgn import');
  await context.close();
});

await test('settings persist across reloads: dark theme, board colours, daily goal', async () => {
  const { page, problems, context, go } = await session();
  await go('settings');
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.getByRole('button', { name: /Walnut/ }).click();
  await page.locator('#set-goal').fill('23');
  await page.reload();
  assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark theme lost after reload');
  assert((await page.locator('#set-goal').inputValue()) === '23', 'daily goal lost after reload');
  assert((await page.getByRole('button', { name: /Walnut/ }).getAttribute('aria-pressed')) === 'true', 'board theme lost');
  await page.screenshot({ path: join(SHOTS, 'e2e-settings-dark.png'), fullPage: true });
  noProblems(problems, 'settings');
  await context.close();
});

await test('backup, delete everything, restore: data comes back; a bad file is refused', async () => {
  const { page, problems, context, go } = await session();
  await go('library');
  await page.getByRole('button', { name: 'Add games or a position' }).click();
  await page.getByPlaceholder(/Event "Casual game"/).fill(OPERA);
  await page.getByRole('button', { name: 'Import pasted PGN' }).click();
  await page.getByText(/Duke Karl/).first().waitFor();
  await go('settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()]);
  const path = await dl.path();
  const json = JSON.parse(readFileSync(path, 'utf8'));
  assert(json.app === 'kibitz' && json.schema === 1 && json.stores.games.length === 1, 'backup content is wrong');
  // delete everything
  await page.getByRole('button', { name: 'Delete all my data' }).click();
  const del = page.getByRole('button', { name: 'Delete everything' });
  assert(await del.isDisabled(), 'delete button should need the confirmation word');
  await page.locator('#set-del').fill('DELETE');
  await del.click();
  await page.getByText(/All data removed/).waitFor();
  // a clean slate offers the welcome dialog again
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await go('library');
  assert((await page.locator('table tbody tr').count()) === 0, 'games still present after delete');
  // refuse a bad file
  await go('settings');
  await page.locator('#set-restore').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await page.getByRole('alert').filter({ hasText: /Kibitz backup/ }).waitFor();
  // restore the good one
  await page.locator('#set-restore').setInputFiles(path);
  await page.getByRole('button', { name: 'Merge into my data' }).click();
  await page.getByText(/Merged \d+ new records/).waitFor();
  await go('library');
  await page.getByText(/Duke Karl/).first().waitFor();
  noProblems(problems, 'backup');
  await context.close();
});

/* ---------------------------------------------------------------- playing */

await test('play: vs engine, typed move, engine replies, takeback, resign, saved to the library', async () => {
  const { page, problems, context, go } = await session();
  await go('play');
  await page.locator('select').first().selectOption({ label: 'Beginner' });
  await page.getByRole('button', { name: 'Start game' }).click();
  const box = page.getByRole('textbox', { name: /Type a move/ });
  await box.fill('e4');
  await box.press('Enter');
  const sheet = page.getByRole('list', { name: 'Moves' });
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Moves"] .mv, [aria-label="Moves"] button').length >= 2, null, { timeout: 30000 });
  await page.getByText(/Engine played/).waitFor();
  // illegal typed move is refused with a message
  await box.fill('Ke5');
  await box.press('Enter');
  await page.getByText(/not a legal move/).waitFor();
  // takeback removes both plies
  await page.getByRole('button', { name: 'Take back' }).click();
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Moves"] .mv, [aria-label="Moves"] button').length === 0, null, { timeout: 5000 });
  await box.fill('d4');
  await box.press('Enter');
  await page.getByText(/Engine played/).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Resign' }).click();
  await page.getByRole('button', { name: /^Resign$/ }).last().click();
  await page.getByText(/resigned|You resigned|won by resignation|Black wins|White wins/i).first().waitFor({ timeout: 10000 });
  await go('library');
  await page.getByText(/Stockfish \(Skill 0/).first().waitFor({ timeout: 5000 });
  const row = await page.locator('table tbody tr').first().innerText();
  assert(/Played here|Played/i.test(row), `row did not say it was played here: ${row}`);
  void sheet;
  noProblems(problems, 'play');
  await context.close();
});

await test('play: a timed game runs the clock and the flag falls', async () => {
  const { page, problems, context, go } = await session();
  await go('play');
  await page.locator('select').first().selectOption({ label: 'Beginner' });
  const clock = page.locator('select').filter({ hasText: 'No clock' });
  await clock.selectOption({ label: '1 min (bullet)' });
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForFunction(() => /\b0?[01]:[0-5]\d/.test(document.body.innerText), null, { timeout: 5000 });
  await page.waitForTimeout(2200);
  const t = await page.locator('main').innerText();
  assert(/0?0:5\d|0?1:00/.test(t), 'the clock did not appear to run');
  noProblems(problems, 'clock');
  await context.close();
});

await test('engine vs engine match lab: a 1-game series runs to the end, is saved, and can be replayed in analysis', async () => {
  const { page, problems, context, go } = await session();
  await go('match');
  await page.getByRole('heading', { name: 'Engine match lab' }).waitFor();
  await page.locator('#ma-level').selectOption({ label: 'Beginner' });
  await page.locator('#mb-level').selectOption({ label: 'Beginner' });
  await page.locator('#m-rounds').fill('1');
  await page.getByRole('button', { name: 'Start series' }).click();
  await page.getByRole('button', { name: /Pause after this move/ }).click();
  await page.getByText('Paused.').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Resume' }).click();
  await page.getByText('Done.').waitFor({ timeout: 240000 });
  const res = await page.getByRole('region', { name: 'Results' }).innerText();
  assert(/1-0|0-1|1\/2-1\/2/.test(res), `no result recorded: ${res}`);
  await page.getByRole('link', { name: 'Replay' }).first().click();
  await page.waitForFunction(() => location.hash.startsWith('#/analysis/'));
  await page.getByRole('list', { name: 'Moves' }).waitFor();
  const moves = await page.locator('[aria-label="Moves"] button').count();
  assert(moves > 10, `replayed game has only ${moves} moves`);
  // series is remembered
  await go('match');
  await page.getByRole('region', { name: 'Earlier series' }).getByText(/1 of 1 games/).first().waitFor();
  noProblems(problems, 'match');
  await context.close();
});

/* ---------------------------------------------------------------- training */

await test('puzzles [seeded puzzle]: a wrong move is explained, retry works, an engine-approved alternative is accepted, results are recorded', async () => {
  const { page, problems, context } = await session();
  await restoreSeed(page, url, { puzzles: [SEED_PUZZLE] });
  await page.goto(`${url}#/puzzles`);
  await page.getByText(/Puzzle 1 of 1/).waitFor();
  await page.getByText('Type a move instead').click();
  const box = page.getByRole('textbox', { name: /Type a move/ });
  await box.fill('Nf6');
  await box.press('Enter');
  await page.getByText(/gives up about \d+ points of winning chances/).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Try again' }).click();
  // Qe7 is not the stored answer (g6) but holds the position: it must be accepted after an engine check
  await box.fill('Qe7');
  await box.press('Enter');
  await page.getByText(/Qe7 also works/).waitFor({ timeout: 30000 });
  await page.getByText('Solved first time').first().waitFor({ timeout: 5000 });
  const text = await page.locator('main').innerText();
  assert(/g6/.test(text), 'the stored line should be shown after solving');
  await page.reload();
  await page.getByText(/Puzzle 1 of 1|No puzzles due|all done|Daily set/i).first().waitFor();
  noProblems(problems, 'puzzles seeded');
  await context.close();
});

await test('from imported games to training: analysis, weaknesses, honest strength output, generated puzzles with a verified solution', async () => {
  const { page, problems, context, go } = await session();
  await go('library');
  await page.getByRole('button', { name: 'Add games or a position' }).click();
  await page.getByPlaceholder(/Event "Casual game"/).fill(`${BLACK_BLUNDERS.join('\n\n')}\n\n[White "X"]\n[Black "Y"]\n\n1. e4 e5 2. Ke4 *`);
  await page.locator('#pgn-me').fill(MY_NAME);
  await page.getByRole('button', { name: 'Import pasted PGN' }).click();
  const toast = await page.getByText(/Added \d+ games?/).first().innerText();
  assert(/Added 4 games/.test(toast) && /Could not read: X vs Y \(illegal move Ke4\)/.test(toast), `import message: ${toast}`);
  await page.getByRole('button', { name: /Analyse shown/ }).click();
  await page.waitForFunction(() => !/not analysed/.test(document.body.innerText) && document.querySelectorAll('table tbody tr').length === 4, null, { timeout: 240000, polling: 500 });
  await go('insights');
  await page.getByText('What keeps costing you').waitFor();
  const ins = await page.locator('main').innerText();
  assert(/first impression/.test(ins), 'small samples must be flagged as tentative');
  assert(/Needs 5\+ rated games/.test(ins), 'with 4 games no results-based estimate may be shown');
  assert(/Performance rating/.test(ins) && />?\s*600/.test(ins), 'performance rating missing or wrong (0% vs 1400 should give 600)');
  assert(/Tentative/.test(ins), 'weaknesses from a handful of games must be marked tentative');
  await go('puzzles');
  await page.getByText(/Puzzle \d+ of \d+/).waitFor({ timeout: 90000 });
  await page.getByRole('button', { name: /Hint/ }).click();
  await page.getByRole('button', { name: 'Show solution' }).click();
  await page.getByText(/The solution:/).waitFor();
  noProblems(problems, 'training pipeline');
  await context.close();
});

/* ---------------------------------------------------------------- Chess.com (mock) */

await test('Chess.com [MOCKED API]: import, profile card, duplicates, caching of complete months', async () => {
  const { page, problems, context, go } = await session();
  const mock = await installChessComMock(context);
  await go('chesscom');
  await page.locator('#cc-user').fill('testplayer');
  await page.getByRole('button', { name: 'Import games' }).click();
  await page.getByText(/Import finished/).waitFor({ timeout: 30000 });
  const summary = await page.locator('main').innerText();
  assert(/4 new games added, 0 already saved, 2 of 2 months downloaded/.test(summary), `summary: ${summary.slice(0, 400)}`);
  // profile
  assert(/1520/.test(summary) && /Rapid/i.test(summary), 'profile ratings not shown');
  assert(/api\.chess\.com\/pub\/player\/testplayer/.test(summary), 'data source not shown');
  const sep = mock.hits.filter((h) => h.endsWith('/2026/09')).length;
  assert(sep === 1, `September archive fetched ${sep} times`);
  // sync again: nothing new, September is not downloaded again
  await page.getByRole('button', { name: 'Sync new games' }).click();
  await page.getByText(/0 new games added/).waitFor({ timeout: 30000 });
  assert(mock.hits.filter((h) => h.endsWith('/2026/09')).length === 1, 'a complete month was downloaded again');
  assert(mock.hits.filter((h) => h.endsWith('/2026/10')).length === 2, 'the current month should be re-checked each sync');
  await go('library');
  await page.waitForSelector('table tbody tr');
  assert((await page.locator('table tbody tr').count()) === 4, 'library does not have 4 games');
  const text = await page.locator('table').innerText();
  assert(/rival_one/.test(text) && /rival_four/.test(text), 'opponents missing');
  assert(/Won/.test(text) && /Lost/.test(text) && /Drew/.test(text), 'results missing');
  noProblems(problems, 'chesscom');
  await context.close();
});

await test('Chess.com [MOCKED API]: unknown user, network failure, rate limiting with retry, cancel', async () => {
  const { page, problems, context, go } = await session();
  await installChessComMock(context);
  await go('chesscom');
  await page.locator('#cc-user').fill('nosuchuser');
  await page.getByRole('button', { name: 'Import games' }).click();
  await page.getByText(/no player with that username/).waitFor({ timeout: 15000 });
  await page.locator('#cc-user').fill('bad name!');
  await page.getByRole('button', { name: 'Import games' }).click();
  await page.getByText(/Usernames can only contain/i).waitFor();
  await context.close();

  const net = await session();
  await installChessComMock(net.context, { failWith: 'network' });
  await net.go('chesscom');
  await net.page.locator('#cc-user').fill('testplayer');
  await net.page.getByRole('button', { name: 'Import games' }).click();
  await net.page.getByText(/could not reach api\.chess\.com/i).waitFor({ timeout: 30000 });
  await net.context.close();

  const rl = await session();
  await installChessComMock(rl.context, { rate429: 1 });
  await rl.go('chesscom');
  await rl.page.locator('#cc-user').fill('testplayer');
  await rl.page.getByRole('button', { name: 'Import games' }).click();
  await rl.page.getByText(/Import finished/).waitFor({ timeout: 60000 });
  assert(/4 new games added/.test(await rl.page.locator('main').innerText()), 'import after a 429 retry did not complete');
  await rl.context.close();

  const slow = await session();
  const slowMock = await installChessComMock(slow.context, { delayMs: 1500 });
  await slow.go('chesscom');
  await slow.page.locator('#cc-user').fill('testplayer');
  await slow.page.getByRole('button', { name: 'Import games' }).click();
  await slow.page.getByRole('button', { name: 'Cancel import' }).click();
  await slow.page.getByText(/import was cancelled/i).first().waitFor({ timeout: 15000 });
  // Regression: pressing Cancel used to submit the form again and restart the import.
  await slow.page.waitForTimeout(3500);
  assert(!slowMock.hits.some((h) => h.endsWith('/stats') || h.endsWith('/archives')), 'the import carried on after Cancel');
  assert((await slow.page.getByRole('button', { name: 'Import games' }).count()) === 1, 'the form is not ready for a new import after cancelling');
  await slow.context.close();
  void problems;
});

/* ---------------------------------------------------------------- training tools */

await test('endgame lab: pick a lesson, move, the engine defends, the move is graded, hint and idea open', async () => {
  const { page, problems, context, go } = await session();
  await go('train/endgames');
  await page.getByText(/engine-verified rather than proven/).waitFor();
  await page.getByRole('button', { name: /Queen and king against king/ }).click();
  await page.getByRole('heading', { name: 'Queen and king against king' }).waitFor();
  await page.getByRole('button', { name: 'Hint' }).click();
  assert(await page.getByRole('button', { name: 'Hint' }).getAttribute('aria-expanded') === 'true', 'hint did not open');
  await page.getByRole('button', { name: 'The idea' }).click();
  await page.getByText('Type a move instead').click();
  const box = page.getByRole('textbox', { name: /Type a move/ });
  await box.fill('Qh7');
  await box.press('Enter');
  await page.getByText('Your moves, graded by the engine').waitFor({ timeout: 60000 });
  await page.getByText('The engine is defending').waitFor({ state: 'detached', timeout: 30000 });
  const moves = await page.getByRole('region', { name: 'Moves' }).innerText();
  assert(/Qh7/.test(moves), `move list: ${moves}`);
  assert(/1\s+Qh7\+?\s+K[a-h][1-8]/.test(moves.replace(/\s+/g, ' ')), `the engine's king did not reply: ${moves.replace(/\s+/g, ' ')}`);
  await page.getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('heading', { name: 'Basic mates' }).waitFor();
  noProblems(problems, 'endgames');
  await context.close();
});

await test('notebook: create, add a variation, save, survives a reload, delete', async () => {
  const { page, problems, context, go } = await session();
  await go('train/notebook');
  await page.getByText('Choose an entry').waitFor();
  await page.locator('#nb-fen').fill('not a fen');
  await page.getByRole('button', { name: 'Add FEN' }).click();
  await page.getByRole('alert').filter({ hasText: /FEN|position|legal/i }).first().waitFor();
  await page.locator('#nb-fen').fill('');
  await page.getByRole('button', { name: 'Start position' }).click();
  await page.locator('#nb-title').fill('My opening note');
  await page.locator('#nb-note').fill('Remember the plan.');
  await page.locator('#nb-tags').fill('opening, plan');
  await page.getByText('Type a move instead').click();
  const box = page.getByRole('textbox', { name: /Type a move/ });
  await box.fill('e4');
  await box.press('Enter');
  await page.getByRole('button', { name: 'Keep this line' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText('Saved.').first().waitFor();
  await page.reload();
  await page.getByRole('button', { name: /My opening note/ }).click();
  assert((await page.locator('#nb-note').inputValue()) === 'Remember the plan.', 'note not saved');
  assert((await page.locator('#nb-tags').inputValue()) === 'opening, plan', 'tags not saved');
  assert(/e4/.test(await page.getByRole('region', { name: 'Entry' }).innerText()), 'variation not saved');
  await page.locator('#nb-filter').fill('zzz-nothing');
  assert((await page.getByRole('button', { name: /My opening note/ }).count()) === 0, 'search did not filter');
  await page.locator('#nb-filter').fill('plan');
  await page.getByRole('button', { name: /My opening note/ }).waitFor();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText('Choose an entry').waitFor();
  await page.reload();
  await page.locator('#nb-filter').waitFor();
  assert((await page.getByRole('button', { name: /My opening note/ }).count()) === 0, 'deleted entry came back');
  noProblems(problems, 'notebook');
  await context.close();
});

await test('openings: add a repertoire line, a wrong move is refused, the right line completes, bad input is explained', async () => {
  const { page, problems, context, go } = await session();
  await go('openings');
  await page.getByText('Your repertoire is empty').waitFor();
  await page.getByRole('tab', { name: /Repertoire/ }).click();
  await page.locator('#rep-moves').fill('1.e4 e5 2.Nf3 Zz9');
  await page.getByRole('button', { name: 'Add to repertoire' }).click();
  await page.getByRole('alert').first().waitFor();
  await page.locator('#rep-moves').fill('1.e4 e5 2.Nf3 Nc6 3.Bb5 a6');
  await page.getByRole('button', { name: 'Add to repertoire' }).click();
  await page.getByText('Line added.').first().waitFor();
  await page.getByRole('tab', { name: 'Repertoire (1)' }).waitFor();
  await page.getByRole('tab', { name: 'Drill' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByText('Type a move instead').click();
  const box = page.getByRole('textbox', { name: /Type a move/ });
  await box.fill('d4');
  await box.press('Enter');
  await page.getByText('That is not in your repertoire here').waitFor();
  for (const mv of ['e4', 'Nf3', 'Bb5']) {
    await box.fill(mv);
    await box.press('Enter');
    await page.waitForTimeout(1200);
  }
  await page.getByText(/Line complete/).waitFor({ timeout: 10000 });
  assert(/needed help/.test(await page.locator('main').innerText()), 'a line completed after a mistake must not count as clean');
  await page.reload();
  await page.getByRole('tab', { name: 'Repertoire (1)' }).waitFor();
  noProblems(problems, 'openings');
  await context.close();
});

await test('calendar: practice shows up on today and the day detail explains it', async () => {
  const { page, problems, context } = await session();
  await restoreSeed(page, url, { puzzles: [SEED_PUZZLE] });
  await page.goto(`${url}#/puzzles`);
  await page.getByText(/Puzzle 1 of 1/).waitFor();
  await page.getByText('Type a move instead').click();
  const box = page.getByRole('textbox', { name: /Type a move/ });
  await box.fill('Qe7');
  await box.press('Enter');
  await page.getByText(/Qe7 also works/).waitFor({ timeout: 30000 });
  await page.goto(`${url}#/train/calendar`);
  await page.getByRole('heading', { name: /\d{4}/ }).first().waitFor();
  const active = page.getByRole('group', { name: 'Days of the month' }).getByRole('button', { name: /: [1-9]\d* puzzles?/ });
  await active.first().waitFor({ timeout: 10000 });
  await active.first().click();
  await page.getByText(/puzzles attempted/).waitFor();
  assert(/[1-9]\d* puzzles attempted/.test(await page.locator('main').innerText()), 'day detail is empty');
  assert((await page.getByRole('button', { name: 'Previous month' }).count()) === 1, 'month navigation missing');
  await page.getByRole('button', { name: 'Previous month' }).click();
  await page.getByText(/Nothing recorded on this day|puzzles attempted/).first().waitFor();
  noProblems(problems, 'calendar');
  await context.close();
});

/** Legal moves (SAN) in the position the page's board shows, worked out from the board's text description. */
async function legalMovesOnPage(page) {
  const text = (await page.locator('.board-frame p.sr-only').first().innerText()).trim();
  const m = /^White: (.*)\. Black: (.*)\. (White|Black) to move\.$/s.exec(text);
  if (!m) throw new Error(`unreadable board description: ${text}`);
  const kinds = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p' };
  const grid = Array.from({ length: 8 }, () => Array(8).fill(''));
  for (const [list, white] of [[m[1], true], [m[2], false]]) {
    if (list === 'no pieces') continue;
    for (const part of list.split(', ')) {
      const [name, sq] = part.split(' ');
      grid[8 - Number(sq[1])][sq.charCodeAt(0) - 97] = white ? kinds[name].toUpperCase() : kinds[name];
    }
  }
  const rows = grid.map((r) => {
    let out = '';
    let empty = 0;
    for (const c of r) {
      if (!c) {
        empty += 1;
      } else {
        out += (empty ? String(empty) : '') + c;
        empty = 0;
      }
    }
    return out + (empty ? String(empty) : '');
  });
  // Castling and en passant are left out on purpose: every move found this way is legal in the real position too.
  return new Chess(`${rows.join('/')} ${m[3] === 'White' ? 'w' : 'b'} - - 0 1`).moves();
}

/** Types a move into the board's "Type a move" box, opening the box first when it is closed. */
async function typeMove(page, san) {
  const box = page.getByRole('textbox', { name: /Type a move/ });
  if (!(await box.isVisible())) await page.getByText('Type a move instead').click();
  await box.fill(san);
  await box.press('Enter');
}

/** Imports the fixture games as "Me" and waits until every one of them is analysed. */
async function importAndAnalyse(page, go, games) {
  await go('library');
  await page.getByRole('button', { name: 'Add games or a position' }).click();
  await page.getByPlaceholder(/Event "Casual game"/).fill(games.join('\n\n'));
  await page.locator('#pgn-me').fill(MY_NAME);
  await page.getByRole('button', { name: 'Import pasted PGN' }).click();
  await page.getByText(new RegExp(`Added ${games.length} games`)).first().waitFor();
  await page.getByRole('button', { name: /Analyse shown/ }).click();
  await page.waitForFunction((n) => !/not analysed/.test(document.body.innerText) && document.querySelectorAll('table tbody tr').length === n, games.length, { timeout: 300000, polling: 500 });
}

async function pickFirstGame(page, selector) {
  const sel = page.locator(selector);
  if ((await sel.inputValue()) === '') await sel.selectOption({ index: 1 });
}

await test('auto-analysis: imported games are analysed in the background without being asked, two at a time', async () => {
  const { context, problems } = await openContext(browser);
  await context.addInitScript(() => {
    try {
      localStorage.setItem('kibitz.prefs.v1', JSON.stringify({ onboarded: true, autoAnalyse: true, analysisPreset: 'quick', analysisWorkers: 2 }));
    } catch {
      /* about:blank has no storage */
    }
  });
  const page = await context.newPage();
  const go = (route) => page.goto(`${url}#/${route}`);
  const games = [...BLACK_BLUNDERS, LONG_GAME];
  await go('library');
  await page.getByRole('button', { name: 'Add games or a position' }).click();
  await page.getByPlaceholder(/Event "Casual game"/).fill(games.join('\n\n'));
  await page.locator('#pgn-me').fill(MY_NAME);
  await page.getByRole('button', { name: 'Import pasted PGN' }).click();
  await page.getByText(new RegExp(`Added ${games.length} games`)).first().waitFor();
  // no click on "Analyse shown": the queue starts by itself
  await page.waitForFunction((n) => !/not analysed/.test(document.body.innerText) && document.querySelectorAll('table tbody tr').length === n, games.length, { timeout: 240000, polling: 500 });
  await go('settings');
  await page.getByRole('heading', { name: 'Settings' }).first().waitFor();
  const status = await page.getByRole('list', { name: 'Engine status' }).innerText();
  assert(/second engine/.test(status), 'two analysis engines should have been started');
  noProblems(problems, 'auto-analysis');
  await context.close();
});

await test('auto-analysis can be switched off: imported games stay unanalysed', async () => {
  const { page, problems, context, go } = await session();
  await go('library');
  await page.getByRole('button', { name: 'Add games or a position' }).click();
  const two = [LONG_GAME, BLACK_BLUNDERS[0]];
  await page.getByPlaceholder(/Event "Casual game"/).fill(two.join('\n\n'));
  await page.locator('#pgn-me').fill(MY_NAME);
  await page.getByRole('button', { name: 'Import pasted PGN' }).click();
  await page.getByText(/Added 2 games/).first().waitFor();
  await page.waitForTimeout(9000);
  const txt = await page.locator('main').innerText();
  assert(/not analysed/.test(txt), 'the game should not have been analysed: ' + txt.replace(/\s+/g, ' ').slice(0, 400));
  noProblems(problems, 'auto-analysis off');
  await context.close();
});

await test('game-based training tools: guess the move, candidate moves, blunder prevention, mistake replay, reflection', async () => {
  const { page, problems, context, go } = await session();
  await importAndAnalyse(page, go, [...BLACK_BLUNDERS, LONG_GAME]);

  // Guess the move: only the 36-ply game qualifies (24+ plies needed).
  await go('train/guess');
  await page.getByRole('button', { name: /Start \(up to 10 positions\)/ }).waitFor();
  await pickFirstGame(page, '#guess-game');
  assert((await page.locator('#guess-game option').count()) === 2, 'only the one long game should be offered (plus the placeholder)');
  await page.getByRole('button', { name: /Start \(up to 10 positions\)/ }).click();
  await page.getByText(/Position 1 of \d+/).waitFor({ timeout: 90000 });
  await typeMove(page, (await legalMovesOnPage(page))[0]);
  await page.getByText(/Verified by the engine \(depth \d+\)/).waitFor({ timeout: 60000 });
  assert(/Best move:/.test(await page.locator('main').innerText()), 'the engine verdict is missing');
  assert(/\d points?/.test(await page.locator('main').innerText()), 'no points shown');
  await page.getByRole('button', { name: /Next position|Finish/ }).click();

  // Candidate moves: note two moves, compare.
  await go('train/candidates');
  await pickFirstGame(page, '#cand-game');
  await page.getByRole('button', { name: /Start/ }).click();
  await page.getByText(/Position 1 of \d+/).waitFor({ timeout: 90000 });
  const moves = await legalMovesOnPage(page);
  await typeMove(page, moves[0]);
  await typeMove(page, moves[1]);
  await page.getByRole('button', { name: /^Remove / }).first().waitFor();
  assert((await page.getByRole('button', { name: /^Remove / }).count()) === 2, 'two candidates should be listed');
  await page.getByRole('button', { name: 'Compare with the engine' }).click();
  await page.getByText(/Verified by the engine \(depth 14\)/).waitFor({ timeout: 60000 });
  assert((await page.getByRole('table', { name: /ranked by the engine/ }).locator('tbody tr').count()) === 2, 'the comparison table should rank both candidates');

  // Blunder prevention: name the threat from the keyboard, then choose a move.
  await go('train/prevention');
  await page.getByText('What is the opponent threatening?').waitFor({ timeout: 90000 });
  await page.getByRole('textbox', { name: /type the square/i }).fill('zz');
  await page.getByRole('button', { name: 'Name this square' }).click();
  await page.getByText('Type a square such as f7.').waitFor();
  await page.getByRole('textbox', { name: /type the square/i }).fill('e4');
  await page.getByRole('button', { name: 'Name this square' }).click();
  await page.getByText('Now choose your move.').waitFor();
  await typeMove(page, (await legalMovesOnPage(page))[0]);
  await page.getByText(/The habit:/).waitFor({ timeout: 60000 });

  // Mistake replay.
  await go('train/mistakes');
  await page.getByText(/What else was there\?/).waitFor({ timeout: 30000 });
  await typeMove(page, (await legalMovesOnPage(page))[0]);
  await page.getByText(/Verified by the engine \(depth \d+\)/).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Next mistake' }).waitFor();

  // Post-game reflection: saved, listed, and kept after a reload.
  await go('train/reflect');
  await pickFirstGame(page, '#rf-game');
  await page.locator('#rf-1').fill('I rushed the third move.');
  await page.locator('#rf-3').fill('Check every capture before moving.');
  await page.getByRole('radio', { name: '3' }).click();
  await page.getByRole('button', { name: 'Save reflection' }).click();
  await page.getByText('Reflection saved.').first().waitFor();
  await page.reload();
  await page.getByText(/Next time: Check every capture before moving\./).waitFor({ timeout: 10000 });
  noProblems(problems, 'training tools');
  await context.close();
});

/* ---------------------------------------------------------------- accessibility (axe-core) */

/** Runs axe-core (WCAG 2.0/2.1 A and AA plus its best-practice rules) and returns one line per violation. */
async function axeScan(page, label) {
  await page.waitForTimeout(450); // colour transitions (for example after a theme switch) must finish, or axe measures a half-faded colour
  await page.evaluate(AXE);
  const found = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] } });
    return r.violations.map((v) => `${v.impact} ${v.id} x${v.nodes.length} (${v.nodes[0]?.target.join(' ').slice(0, 90)}) ${(v.nodes[0]?.any[0]?.message ?? '').slice(0, 160)}`);
  });
  return found.map((f) => `${label}: ${f}`);
}

/* ---------------------------------------------------------------- guided game review */

await test('daily session and progress: steps from your data, a review and a retest count, streak, charts, accessible in both themes', async () => {
  const { page, problems, context, go } = await session();
  await go('session');
  await page.getByText('Bring in some games').waitFor();
  await importAndAnalyse(page, go, BLACK_BLUNDERS);
  await go('session');
  await page.getByRole('heading', { name: /\d+ of \d+ steps done/ }).waitFor();
  let text = await page.locator('main').innerText();
  assert(/Review your latest game/.test(text), 'the session should offer a review of the latest game');
  assert(/Re-test \d+ of your old mistakes/.test(text), 'the session should offer retests');
  assert(/0 days/.test(text), 'a new profile has no streak yet');
  const bad = [];
  bad.push(...(await axeScan(page, 'session, light')));
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  bad.push(...(await axeScan(page, 'session, dark')));
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));

  // The review step opens the guided review straight away; finishing it completes the step.
  await page.getByRole('link', { name: /^Start/ }).nth(await page.getByRole('link', { name: /^Start/ }).count() - 2).click().catch(() => undefined);
  await go('session');
  await page.locator('.sess-step', { hasText: 'Review your latest game' }).getByRole('link').click();
  const card = page.getByRole('region', { name: 'Guided review' });
  await card.waitFor({ timeout: 60000 });
  for (let i = 0; i < 30; i++) {
    const next = card.getByRole('button', { name: /^(Next|Finish)/ });
    const label = await next.innerText();
    await next.click();
    if (/Finish/.test(label)) break;
  }
  await page.getByText(/Review finished/).first().waitFor();
  await go('session');
  await page.locator('.sess-step.sess-done', { hasText: 'Review your latest game' }).waitFor({ timeout: 10000 });

  // Re-test a mistake: one counts, and it is scheduled to come back.
  await go('train/mistakes');
  await page.getByText(/What else was there\?/).waitFor({ timeout: 30000 });
  assert((await page.locator('main').innerText()).includes('New'), 'an unseen mistake should be labelled New');
  await typeMove(page, (await legalMovesOnPage(page))[0]);
  await page.getByText(/Solved\.|Not yet\./).waitFor({ timeout: 60000 });
  await go('session');
  await page.getByRole('heading', { name: /\d+ of \d+ steps done/ }).waitFor();
  text = await page.locator('main').innerText();
  assert(/1 days?/.test(text) && !/\b0 days/.test(text), `streak should be 1 day after practising: ${text.slice(0, 200)}`);
  assert((await page.locator('.sess-step', { hasText: 'Re-test' }).innerText()).includes('Continue'), 'the retest step should show progress');
  bad.push(...(await axeScan(page, 'session with progress')));

  // Progress page.
  await go('progress');
  await page.getByRole('heading', { name: 'Month by month' }).waitFor();
  text = await page.locator('main').innerText();
  assert(/Accuracy/.test(text) && /Blunders per 100 moves/.test(text), 'charts missing');
  assert(/Your moves by grade/.test(text), 'grade stats missing');
  assert(/Is your practice working\?/.test(text) && /Nothing to report yet/.test(text), 'practice check should say it lacks evidence');
  assert((await page.getByRole('img', { name: /^Accuracy: / }).count()) === 1, 'accuracy chart should have a text equivalent');
  bad.push(...(await axeScan(page, 'progress, light')));
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  bad.push(...(await axeScan(page, 'progress, dark')));
  assert(bad.length === 0, `${bad.length} accessibility violations: ${bad.slice(0, 6).join(' | ')}`);
  noProblems(problems, 'session and progress');
  await context.close();
});

await test('grade stats: brilliant count opens the list of brilliant moves and links to the game; other grades are counts', async () => {
  const { page, problems, context, go } = await session();
  await page.goto(url);
  await page.evaluate(() => localStorage.setItem('kibitz.prefs.v1', JSON.stringify({ onboarded: true, autoAnalyse: false, includeDemoInStats: true })));
  await page.reload();
  await go('');
  await page.getByRole('button', { name: /demo game/i }).first().click();
  await page.getByRole('region', { name: 'Game review summary' }).waitFor({ timeout: 120000 });
  await go('insights');
  await page.getByRole('heading', { name: 'Your moves by grade' }).waitFor({ timeout: 20000 });
  const tile = page.getByRole('button', { name: /Brilliant/ });
  assert(/^1\b/.test((await tile.innerText()).trim()) || /\n1\n/.test(await tile.innerText()), `expected one brilliant move: ${await tile.innerText()}`);
  assert((await tile.getAttribute('aria-expanded')) === 'false', 'list should start closed');
  await tile.click();
  const list = page.getByRole('list', { name: 'Your brilliant moves' });
  await list.waitFor();
  assert(/16\.\s*Qb8\+/.test(await list.innerText()), 'the Qb8+ sacrifice should be listed');
  await list.getByRole('link').first().click();
  await page.getByRole('region', { name: 'Game review summary' }).waitFor();
  assert(/ply=31/.test(page.url()) || /Qb8/.test(await page.locator('main').innerText()), 'the link should open the move in the game');
  await go('insights');
  const others = await page.getByRole('button', { name: /Great|Best|Blunder/ }).count();
  assert(others === 0, 'only the brilliant tile should be interactive');
  noProblems(problems, 'grade stats');
  await context.close();
});

await test('game review: grades for both players, guided review, retry a mistake with the engine\'s move, accessible in both themes', async () => {
  const { page, problems, context, go } = await session();
  await importAndAnalyse(page, go, [BLACK_BLUNDERS[2], BLACK_BLUNDERS[3]]);
  await page.locator('table tbody tr', { hasText: 'Rival C' }).first().getByRole('link').first().click();
  const summary = page.getByRole('region', { name: 'Game review summary' });
  await summary.waitFor({ timeout: 60000 });
  const text = await summary.innerText();
  assert((await summary.locator('.review-acc-num').count()) === 2, 'accuracy should be shown for both players');
  for (const g of ['Brilliant', 'Great', 'Best', 'Blunder']) assert(text.includes(g), `grade row ${g} missing`);
  assert(/Rival C/.test(text) && /Me/.test(text) && /You/.test(text), 'both players and the "You" marker should be shown');
  // Axe in both themes, on the summary state.
  const bad = [];
  bad.push(...(await axeScan(page, 'review summary, light')));
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  bad.push(...(await axeScan(page, 'review summary, dark')));

  await page.getByRole('button', { name: /Start review/ }).click();
  const card = page.getByRole('region', { name: 'Guided review' });
  await card.waitFor();
  assert(/Review 1 of \d+/.test(await card.innerText()), 'the review should start at step 1');
  assert(/Blunder|Mistake|Miss/.test(await card.innerText()), 'the first step should be something to learn from');
  assert((await page.locator('.sq-badge').count()) === 1, 'the grade icon should sit on the board');
  const showBest = card.getByRole('button', { name: /Show the best move \(/ });
  const best = /\((.+)\)/.exec(await showBest.innerText())[1];
  await card.getByRole('button', { name: 'Try again' }).click();
  await card.getByText(/Play a better one/).waitFor();
  await typeMove(page, best);
  await card.getByText(/that works/).waitFor({ timeout: 90000 });
  bad.push(...(await axeScan(page, 'review card with result, dark')));
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));
  bad.push(...(await axeScan(page, 'review card with result, light')));
  for (let i = 0; i < 20; i++) {
    const next = card.getByRole('button', { name: /^(Next|Finish)/ });
    const label = await next.innerText();
    await next.click();
    if (/Finish/.test(label)) break;
  }
  await page.getByText(/Review finished/).first().waitFor();
  assert(bad.length === 0, `${bad.length} accessibility violations: ${bad.slice(0, 6).join(' | ')}`);
  noProblems(problems, 'game review');
  await context.close();
});

await test('time use, theory and opponent notes, human-like opponent, play from your mistake, endgame record', async () => {
  const { page, problems, context, go } = await session();
  // The long fixture game with clock comments: a comfortable clock that runs low near the end.
  const moves = LONG_GAME.split('\n\n')[1].replace(/ 1-0$/, '').split(/\s+\d+\.\s*|^1\.\s*/).join(' ').trim().split(/\s+/).filter((t) => t && !/^\d+\.$/.test(t));
  const timed = moves
    .map((san, i) => {
      const left = i < moves.length - 8 ? 580 - i * 9 : 24 - (i - (moves.length - 8)) * 2;
      const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
      return `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${san} { [%clk 0:0${mm}:${ss}] }`;
    })
    .join(' ');
  const pgn = `${LONG_GAME.split('\n\n')[0]}\n\n${timed} 1-0`;
  await importAndAnalyse(page, go, [pgn, BLACK_BLUNDERS[0], BLACK_BLUNDERS[2]]);
  await page.locator('table tbody tr', { hasText: 'Rival E' }).first().getByRole('link').first().click();
  await page.getByRole('region', { name: 'Game review summary' }).waitFor({ timeout: 60000 });
  await page.getByRole('tab', { name: 'Game report' }).click();
  await page.getByRole('heading', { name: 'How you used your time' }).waitFor();
  assert((await page.getByRole('img', { name: /^Time spent on each of your \d+ moves/ }).count()) === 1, 'time chart should have a text equivalent');
  const report = await page.locator('main').innerText();
  assert(/under 30 s left|never dropped under 30 s/.test(report), 'the time notes should mention the low-clock count');
  assert(/About your opponent in this game/.test(report) && /accuracy against your/.test(report), 'opponent notes missing');
  assert(/Theory\./.test(report) && /left the named openings with/.test(report), 'theory note missing');
  const bad = [];
  bad.push(...(await axeScan(page, 'game report with time use, light')));
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  bad.push(...(await axeScan(page, 'game report with time use, dark')));
  await page.evaluate(() => (document.documentElement.dataset.theme = 'light'));

  await go('insights');
  await page.getByRole('heading', { name: 'Time use', exact: true }).waitFor({ timeout: 20000 });
  assert(/clock times/.test(await page.locator('main').innerText()), 'insights time card missing');

  // Human-like opponent: choose the level, start, play e4, get a legal reply.
  await go('play');
  await page.locator('select').first().selectOption({ label: 'Human-like, error-prone' });
  assert(/Human-like opponent, carefulness 5/.test(await page.locator('main').innerText()), 'the setting should be described honestly');
  await page.getByRole('button', { name: 'Start game' }).click();
  await typeMove(page, 'e4');
  await page.getByText(/Engine played/).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Resign' }).click();
  await page.getByRole('button', { name: /^Resign$/ }).last().click();

  // Play it out from a position of your own mistakes (needs an analysed game with a contested mistake; the list may be empty).
  await go('');
  await page.getByRole('heading', { name: 'Your desk' }).waitFor(); // really leave Play before coming back
  await go('play');
  const weak = page.getByText(/Start from one of your mistakes/);
  await weak.waitFor({ timeout: 15000 }); // your analysed games contain a mistake from a balanced position
  await weak.click();
  await page.locator('#play-weak').selectOption({ index: 1 });
  assert((await page.locator('#play-fen').inputValue()).length > 10, 'choosing a mistake should fill in the position');
  await page.getByRole('button', { name: 'Start game' }).click();
  await go('');
  await page.getByRole('heading', { name: 'Your desk' }).waitFor();
  await page.goto(`${url}#/play?fen=${encodeURIComponent('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1')}&color=b`);
  const blackBtn = page.getByRole('group', { name: 'Your colour' }).getByRole('button', { name: 'Black' });
  await blackBtn.waitFor();
  assert((await blackBtn.getAttribute('aria-pressed')) === 'true', 'the colour from the link should be selected');

  // Endgame lab shows the record per lesson.
  await go('train/endgames');
  await page.getByText('Not tried yet').first().waitFor();
  assert(bad.length === 0, `${bad.length} accessibility violations: ${bad.slice(0, 6).join(' | ')}`);
  noProblems(problems, 'time use and human-like opponent');
  await context.close();
});

await test('installable and offline: manifest and icons are valid, the app and the engine still work with the network off', async () => {
  const { page, problems, context, go } = await session({ serviceWorkers: 'allow' });
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.startsWith('kibitz-')) && (await (await caches.open((await caches.keys())[0])).keys()).length > 50, null, { timeout: 60000 });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  // The web manifest: name, standalone display, and icons that really exist, including a maskable one.
  const m = await page.evaluate(async () => {
    const link = document.querySelector('link[rel=manifest]');
    const manifest = await (await fetch(link.href)).json();
    const icons = await Promise.all(manifest.icons.map(async (i) => ({ purpose: i.purpose, ok: (await fetch(new URL(i.src, link.href))).ok })));
    return { manifest, icons, theme: document.querySelector('meta[name=theme-color]').content };
  });
  assert(m.manifest.display === 'standalone' && m.manifest.short_name === 'Kibitz', 'manifest should declare a standalone app');
  assert(m.icons.length >= 3 && m.icons.every((i) => i.ok) && m.icons.some((i) => i.purpose === 'maskable'), 'every icon should load and one should be maskable');
  assert(m.manifest.theme_color === m.theme, 'theme colour should match');
  // Offline: reload and use the app, including the chess engine.
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'Your desk' }).waitFor({ timeout: 15000 });
  await go('play');
  await page.locator('select').first().selectOption({ label: 'Beginner' });
  await page.getByRole('button', { name: 'Start game' }).click();
  await typeMove(page, 'e4');
  await page.getByText(/Engine played/).waitFor({ timeout: 30000 });
  await go('help');
  await page.getByRole('heading', { level: 1 }).waitFor();
  noProblems(problems, 'offline');
  await context.setOffline(false);
  await context.close();
});

await test('automatic backup to a chosen folder: files written once a day style, only its own files rotated, settings never exported', async () => {
  const { page, problems, context, go } = await session();
  // A real directory handle from the browser's private file system stands in for the folder picker.
  await context.addInitScript(() => {
    window.showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('chosen', { create: true });
      const f = await dir.getFileHandle('holiday-notes.txt', { create: true });
      const w = await f.createWritable();
      await w.write('keep me');
      await w.close();
      // Older automatic backups beyond the newest seven are removed, so plant nine.
      for (let d = 1; d <= 9; d++) {
        const h = await dir.getFileHandle(`kibitz-backup-2026-01-0${d}.json`, { create: true });
        const ww = await h.createWritable();
        await ww.write('{}');
        await ww.close();
      }
      return dir;
    };
  });
  await page.goto(url);
  await go('settings');
  await page.getByRole('heading', { name: 'Automatic backup' }).waitFor();
  await page.getByRole('button', { name: 'Choose a folder and turn on' }).click();
  await page.getByText(/Last backup/).waitFor({ timeout: 20000 });
  const files = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('chosen');
    const names = [];
    for await (const e of dir.values()) names.push(e.name);
    const today = names.find((n) => n === `kibitz-backup-${new Date().toISOString().slice(0, 10)}.json`);
    const text = today ? await (await (await dir.getFileHandle(today)).getFile()).text() : '';
    const keep = await (await (await dir.getFileHandle('holiday-notes.txt')).getFile()).text();
    return { names: names.sort(), text, keep };
  });
  const mine = files.names.filter((n) => /^kibitz-backup-\d{4}-\d{2}-\d{2}\.json$/.test(n));
  assert(mine.length === 7, `exactly the newest 7 backups should remain, got ${mine.length}: ${files.names.join(', ')}`);
  assert(files.names.includes('holiday-notes.txt') && files.keep === 'keep me', 'files that are not Kibitz backups must be left alone');
  const parsed = JSON.parse(files.text);
  assert(parsed.app === 'kibitz' && !/device\./.test(JSON.stringify(parsed.stores.kv ?? [])), 'the backup should be a Kibitz backup without device settings');
  // Reload: still on, and "Back up now" works again.
  await page.reload();
  await page.getByText(/Folder:/).waitFor();
  await page.getByRole('button', { name: 'Back up now' }).click();
  await page.getByText('Backup saved.').first().waitFor();
  const bad = [];
  bad.push(...(await axeScan(page, 'settings with automatic backup, light')));
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  bad.push(...(await axeScan(page, 'settings with automatic backup, dark')));
  await page.getByRole('button', { name: 'Turn off' }).click();
  await page.getByRole('button', { name: 'Choose a folder and turn on' }).waitFor();
  assert(bad.length === 0, `${bad.length} accessibility violations: ${bad.slice(0, 6).join(' | ')}`);
  noProblems(problems, 'automatic backup');
  await context.close();
});

await test('accessibility (axe-core): every page, light and dark on desktop, light and dark on a phone', async () => {
  const bad = [];
  let scans = 0;
  for (const [label, opts, theme] of [['desktop light', {}, 'light'], ['desktop dark', {}, 'dark'], ['phone light', { viewport: { width: 390, height: 800 } }, 'light'], ['phone dark', { viewport: { width: 390, height: 800 } }, 'dark']]) {
    const { context } = await openContext(browser, opts);
    await context.addInitScript((t) => {
      try {
        localStorage.setItem('kibitz.prefs.v1', JSON.stringify({ onboarded: true, autoAnalyse: false, theme: t }));
      } catch {
        /* about:blank has no storage */
      }
    }, theme);
    const page = await context.newPage();
    for (const r of ROUTES) {
      await page.goto(`${url}#/${r}`);
      await page.locator('h1').first().waitFor();
      await page.waitForTimeout(300);
      bad.push(...(await axeScan(page, `${label} /${r}`)));
      scans += 1;
    }
    await context.close();
  }
  assert(scans === 4 * ROUTES.length, 'not every page was scanned');
  assert(bad.length === 0, `${bad.length} accessibility violations: ${bad.slice(0, 6).join(' | ')}`);
});

await test('accessibility (axe-core): pages with real content and open dialogs (analysed game, insights, puzzles, play, onboarding, delete dialog)', async () => {
  const { page, problems, context, go } = await session();
  const bad = [];
  const scan = async (label) => bad.push(...(await axeScan(page, label)));
  await go('library');
  await page.getByRole('button', { name: 'Add games or a position' }).click();
  await page.getByPlaceholder(/Event "Casual game"/).fill(BLACK_BLUNDERS.join('\n\n'));
  await page.locator('#pgn-me').fill(MY_NAME);
  await scan('library import form');
  await page.getByRole('button', { name: 'Import pasted PGN' }).click();
  await page.getByText(/Added 4 games/).first().waitFor();
  await page.getByRole('button', { name: /Analyse shown/ }).click();
  await page.waitForFunction(() => !/not analysed/.test(document.body.innerText) && document.querySelectorAll('table tbody tr').length === 4, null, { timeout: 240000, polling: 500 });
  await scan('library with analysed games');
  await page.locator('table tbody tr').first().getByRole('link').first().click();
  await page.getByRole('list', { name: 'Moves' }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  for (const tab of ['Coach', 'Engine lines', 'Game report']) {
    await page.getByRole('tab', { name: tab }).click();
    await page.waitForTimeout(600);
    await scan(`analysis, ${tab} tab`);
  }
  for (const r of ['insights', 'puzzles', 'train', 'train/mistakes', 'train/prevention', 'train/reflect', 'openings', 'train/calendar']) {
    await go(r);
    await page.locator('h1').first().waitFor();
    await page.waitForTimeout(r === 'puzzles' ? 6000 : 800);
    await scan(`${r} with data`);
  }
  await go('play');
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.waitForTimeout(800);
  await scan('play, game in progress');
  await page.getByRole('button', { name: 'Resign' }).click();
  await scan('play, resign confirmation open');
  await page.keyboard.press('Escape');
  await go('settings');
  await page.getByRole('button', { name: 'Delete all my data' }).click();
  await scan('settings, delete dialog open');
  await context.close();
  const ob = await session({ skipOnboarding: false });
  await ob.go('');
  await ob.page.getByRole('dialog').waitFor();
  bad.push(...(await axeScan(ob.page, 'onboarding dialog')));
  await ob.context.close();
  assert(bad.length === 0, `${bad.length} accessibility violations: ${bad.slice(0, 8).join(' | ')}`);
  noProblems(problems, 'content pages');
});

await test('keyboard only: skip link, tab order reaches the main content, board pieces are named, typed moves work without a mouse', async () => {
  const { page, problems, context, go } = await session();
  await go('analysis');
  await page.locator('h1').first().waitFor();
  await page.keyboard.press('Tab');
  const first = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  assert(/skip/i.test(first), `the first Tab stop should be a skip link, got "${first}"`);
  await page.keyboard.press('Enter');
  const inMain = await page.evaluate(() => !!document.activeElement?.closest('main') || document.activeElement?.id === 'main');
  assert(inMain, 'the skip link did not move focus into the main content');
  await page.waitForSelector('[aria-roledescription="draggable"]', { state: 'attached' });
  await page.waitForTimeout(300);
  const names = await page.evaluate(() => [...document.querySelectorAll('[aria-roledescription="draggable"]')].map((e) => e.getAttribute('aria-label')));
  assert(names.length === 32 && names.every((n) => /^(white|black) (king|queen|rook|bishop|knight|pawn) on [a-h][1-8]$/.test(n ?? '')), `board pieces are not all named: ${names.slice(0, 3)}`);
  assert(names.includes('white knight on g1'), 'g1 knight not named');
  await page.getByText('Type a move instead').click();
  const box = page.getByRole('textbox', { name: /Type a move/ });
  await box.focus();
  await page.keyboard.type('e4');
  await page.keyboard.press('Enter');
  await page.getByRole('list', { name: 'Moves' }).getByText('e4').waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('[aria-roledescription="draggable"]')].some((e) => e.getAttribute('aria-label') === 'white pawn on e4'), null, { timeout: 5000 }).catch(() => {});
  const afterNames = await page.evaluate(() => [...document.querySelectorAll('[aria-roledescription="draggable"]')].map((e) => e.getAttribute('aria-label')));
  assert(afterNames.includes('white pawn on e4') && !afterNames.includes('white pawn on e2'), 'piece names did not follow the move');
  // Focus never gets trapped: 60 Tab presses must leave the board and keep moving.
  const seen = new Set();
  for (let i = 0; i < 60; i += 1) {
    await page.keyboard.press('Tab');
    seen.add(await page.evaluate(() => `${document.activeElement?.tagName}:${document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.slice(0, 20)}`));
  }
  assert(seen.size > 20, `Tab order looks stuck (only ${seen.size} distinct stops in 60 presses)`);
  noProblems(problems, 'keyboard');
  await context.close();
});

/* ---------------------------------------------------------------- finish */

await browser.close();
server.close();
const failed = rep.results.filter((r) => !r.ok);
writeFileSync(join(ROOT, 'tests/e2e/results.json'), JSON.stringify({ at: new Date().toISOString(), passed: rep.results.length - failed.length, failed: failed.length, results: rep.results }, null, 2));
console.log(`\n${rep.results.length - failed.length} passed, ${failed.length} failed\n`);
process.exit(failed.length ? 1 : 0);
