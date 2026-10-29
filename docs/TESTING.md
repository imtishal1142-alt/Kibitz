# Testing

## How to run

```bash
npm install
npm run typecheck      # tsc --noEmit, strict
npm run lint           # eslint src scripts tests electron
npm test               # prepares engine assets, then Vitest (unit and integration)
npm run build          # prepares assets, type-checks, production build into dist/
npm run test:e2e       # browser tests against dist/ (build first)
npm run test:e2e -- puzzles      # run only tests whose name contains "puzzles"
xvfb-run -a node tests/e2e/desktop.mjs   # the desktop app (real Electron); build first. Without a screen use xvfb-run
KIBITZ_APP=release/linux-unpacked/kibitz xvfb-run -a node tests/e2e/desktop.mjs   # the packaged build
```

The browser tests drive the **production build** (`dist/`, served by a small static server in `tests/e2e/harness.mjs`) with `playwright-core` and a system Chromium. They look for Chromium in `/opt/pw-browsers/`; set `CHROME_PATH` to use another binary. Each test gets a fresh browser context, so no test sees another's data. Results are printed and written to `tests/e2e/results.json` (running a subset overwrites that file with the subset).

## Real results of the last full run

Environment: Linux sandbox, Node v22.22.0, Vitest 5.0.4, Playwright-core 1.64.1 driving Chromium 141.0.7390.37, Electron 45.0.0, axe-core 4.10.2. Run on 2026-10-28, version 0.3.1.

| Check | Result |
| --- | --- |
| `npm run typecheck` | exit 0, no errors |
| `npm run lint` | exit 0, no errors, no warnings |
| `npm test` | **16 files, 191 tests, all passed** (about 35 s) |
| `npm run build` | exit 0; `dist/` is 6.5 MB across 92 files (all stored for offline use) |
| `npm run test:e2e` | **33 passed, 0 failed** (about 440 s of test time) |
| `tests/e2e/desktop.mjs` (real Electron, source tree) | **7 passed, 0 failed** |
| `tests/e2e/desktop.mjs` against the packaged Linux build (`linux-unpacked`) | **7 passed, 0 failed** |

Unit tests per file: `engine` 24, `analysis` 20, `chesscom` 19, `play` 19, `rules` 18, `training` 17, `library` 14, `data` 10, `grades` 10, `progress` 10, `linetree` 7, `autobackup` 6, `time` 6, `desktop` 3, `human` 1.

Not run: the Windows build (built from Linux, never started), macOS (not built), the Windows NSIS installer (needs Wine or Windows), a real screen reader, any browser other than Chromium, a live Chess.com import. These numbers are from one machine. They show that the tests passed there; they do not prove the absence of bugs.

## What the unit tests do

- Run **real Stockfish 19** (the same Lite build the app ships, run as a Node child process speaking UCI over stdio; see `tests/helpers/nodeEngine.ts`) for the engine, analysis, puzzle, weakness, endgame and threat-check tests. A fault-injecting wrapper reproduces stalls and crashes to test the watchdog and restart.
- Use `fake-indexeddb` for storage, backup, restore and sync tests.
- Use a scripted `fetch` for the Chess.com client and importer (no network).
- Test the strength model on **synthetic** players whose true rating is known (this checks the maths, not real-world accuracy).
- Test every Endgame Lab lesson's claim against the engine at depth 22.

New in 0.2: `grades.test.ts` (brilliant, great, book and miss rules; a real game graded; lossless upgrade from the old format; the grade tally), `progress.test.ts` (trends, practice check, session, streak, retests), `time.test.ts`, `autobackup.test.ts` (daily rule, rotation touches only its own files, device keys never exported, the desktop bridge path, failures recorded), `desktop.test.ts` (the Electron backup writer in a temporary folder: names refused, atomic write, rotation), `human.test.ts` (the human-like opponent with the real engine). Files: `engine.test.ts` (UCI parsing, controller, cancel, restart, watchdog, illegal positions, strength options), `analysis.test.ts` (win chance and accuracy, grades and flags, tactics, openings, whole-game analysis, cache reuse rules), `rules.test.ts` (FEN, PGN, legality, terminal states, time controls), `play.test.ts` (clocks, draws, takeback, resign, claims), `linetree.test.ts` (variations, PGN export), `chesscom.test.ts`, `training.test.ts`, `library.test.ts` (demo game, repertoire, plan, guess grading, endgames, threats), `data.test.ts` (backup merge, idempotence, performance rating, partial dates).

## What the browser tests do

Each name below is the test's name in the output.

| Test | What it checks |
| --- | --- |
| app boots | No console or page errors; onboarding offered and stays dismissed; privacy statement present. |
| every page renders a heading | All 20 routes load with no console errors. |
| mobile (390 and 320 px) | No horizontal scroll on any page; bottom navigation visible. |
| Stockfish WebAssembly runs in a worker | A real search in Chromium reaches depth 12 or more with a score and line; Settings shows the engine status. |
| engine rejects an illegal position | A readable message instead of a crash. |
| demo game | Labelled as a demo; analysed in the browser; report and critical-move navigation. |
| analysis board | Type moves, flip, copy FEN and PGN, save to notebook, threat check. |
| PGN import | Opens the game, listed, survives reload, repeat refused as a duplicate. |
| settings persist | Dark theme, board colours and daily goal survive a reload. |
| backup, delete, restore | Round trip; a bad file is refused. |
| play (two tests) | Typed move, engine reply, takeback, resign, saved to the library; a timed game's flag falls. |
| engine vs engine match lab | A one-game series runs to the end, is saved, and replays in analysis. |
| puzzles [seeded puzzle] | A wrong move is explained, retry works, an engine-approved alternative is accepted, results are recorded. |
| from imported games to training | Four imported games analysed; weaknesses marked tentative; no strength estimate with fewer than 5 rated games; performance rating shown; puzzles generated with a verified solution; an unreadable game is named with its reason. |
| Chess.com [MOCKED API] (two tests) | Import, profile card, duplicates, caching of finished months, unknown user, network failure, 429 with retry, cancel (and that it does not restart). |
| endgame lab, notebook, openings, calendar | Each tool's main flow, persistence and error handling. |
| game-based training tools | Guess the move, candidate moves, blunder prevention (including naming the threat by typing), mistake replay, reflection, on analysed games. |
| accessibility (axe-core), pages | Every page in light and dark, on desktop and on a phone: **zero violations** of WCAG 2.0/2.1 A and AA rules and best practices. |
| accessibility (axe-core), content | The same scan on pages with real content and open dialogs: library with an import form, analysis (three tabs), insights, puzzles, training tools, play in progress and a resign dialog, the delete dialog, onboarding. |
| game review | Accuracy for both players, grade rows, guided review, the grade icon on the board, retry with the engine's move, axe in both themes. |
| daily session and progress | Session steps built from data, a review and a retest counted, streak, charts with text equivalents, axe in both themes. |
| grade stats | The brilliant tile opens the list of those moves and links to the game; other grades are plain counts. |
| time use, theory and opponent notes, human-like opponent, play from your mistake, endgame record | A game with clock times: time chart, notes, theory note, opponent notes (axe in both themes); Insights time card; a game against the human-like opponent; a practice game started from one of your mistakes; a link with a colour; the endgame list's record. |
| installable and offline | Manifest and icons load; with the network off the app reloads and the engine still answers. |
| automatic backup | A real directory handle: a backup is written, only the newest 7 of its own files remain, other files are untouched, no device settings in the file, turn off, axe in both themes. |
| keyboard only | Skip link, board pieces named, typed moves without a mouse, Tab order not stuck. |

## What is mocked, and what is not verified

- **Chess.com**: the two Chess.com browser tests answer `api.chess.com` requests from fixtures inside the browser context (`tests/e2e/chesscom-mock.mjs`), and the unit tests use a scripted `fetch`. **No live Chess.com request was made** because the sandbox could not reach it. See [CHESSCOM.md](CHESSCOM.md).
- **Browsers**: Chromium only.
- **Assistive technology**: automated scans and keyboard tests only; nobody has used the app with a screen reader. The scans passing is not a claim of WCAG conformance.
- **Windows, macOS, Android, the installed web app**: see above. The web app's install prompt was not exercised; the manifest and icons were checked.
- **File System Access API**: tested with the browser's private file system standing in for a user-chosen folder (same interface); the native folder dialog was not used.
- **Full-strength engine**: loaded and searched once by hand in Chromium; not in the suite.
- **Closing the tab mid-game** (the confirmation prompt) and **sound output** are not automated.
- **Scale**: fixtures are a handful of games and months; large histories are untested.
- **The strength model** is tested on synthetic data only. It has not been validated against real rating data.

## Defects the tests found during development

Kept here because it is the honest record of what the testing was for. Each was fixed and has a regression test where noted.

- The "Skip to content" link sent the router to a non-existent route (a plain `#main` link under hash routing). Fixed; covered by the keyboard test.
- Pressing **Cancel** during a Chess.com import restarted the import (the button changed type before the click's default action ran). Fixed; covered.
- A network failure took about 32 seconds to report because of the full retry schedule. Now two quick retries; covered.
- The accessibility scans found: every board piece had no accessible name; the calendar used incomplete grid roles; an empty move list had a list role with no items; several greys and badge colours were below the 4.5:1 contrast ratio; some headings skipped a level. All fixed; the scans now fail on any recurrence.
- Naming the threatened square in Blunder Prevention needed a mouse. Added a typed alternative; covered.
- Every "best" move was marked with "!" on the scoresheet, which said nothing. Now only a best move that was the only good one gets it.
- The Position Notebook overflowed horizontally on a phone-width screen. Fixed; the mobile test now checks every page at 390 and 320 px.
- Games whose PGN date was only a year or a month were shown as if the date were complete. They now show the precision the PGN gave; unit-tested.
- Backup merge doubled attempts and strength reports when the same file was merged twice. Fixed; unit-tested.
- The engine cache could serve a result computed by a different Stockfish build. The build is now part of the key; unit-tested.
- Brilliant moves were first awarded to sacrifices the engine's line did not actually settle (the line stopped mid-exchange). A line cut off in the middle of an exchange now gives no verdict; unit-tested.
- Search noise gave the engine's own best move a small loss compared with the previous position. The engine's first choice is now never charged a loss; unit-tested.
- A test that left the Play page and came straight back raced the router (the old screen stayed until the new one finished loading). The test now waits for the page it left; the app itself was fine.
- Axe measured half-faded colours right after a theme switch (colour transitions). The scan now waits for them to finish.
