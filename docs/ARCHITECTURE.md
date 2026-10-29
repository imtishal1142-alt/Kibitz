# Architecture

Kibitz is a client-only single-page app: **Vite 8 + React 19 + TypeScript (strict)**, hash routing (`react-router-dom` `HashRouter`), `chess.js` for rules, `react-chessboard` for the board, `idb` for IndexedDB, Stockfish 19 in Web Workers. There is no backend.

```
                 ┌────────────────────────────── browser ───────────────────────────────┐
  pages/ ──────▶ │ hooks/ (data, prefs, hotkeys, live analysis)                         │
  components/    │      │                                                               │
                 │      ▼                                                               │
                 │ services/ (long-lived state: engines hub, analysis queue, Chess.com   │
                 │            job, play engine glue, toasts, sound)                     │
                 │      │                                                               │
                 │      ▼                                                               │
                 │ lib/  pure logic: chess rules, classification, analysis, tactics,    │
                 │       strength, training, Chess.com client/mapper/sync, storage      │
                 │      │                                   │                           │
                 │      ▼                                   ▼                           │
                 │ IndexedDB (idb) + localStorage     Web Workers: Stockfish (WASM)     │
                 └──────────────────────────────────────────────────────────────────────┘
                                         │ (only when you ask)
                                         ▼
                              https://api.chess.com/pub
```

Dependencies point downwards only: `lib/` never imports from `pages/`, `components/`, `hooks/` or `services/`, which is what makes it testable in plain Node.

## Directory map

| Path | Contents |
| --- | --- |
| `src/lib/engine/` | `uci.ts` parsing and building UCI lines; `engine.ts` the controller (one search at a time, cancel, watchdog, perspective conversion) over an abstract `UciTransport`; `transport.ts` the browser Worker transport and engine discovery; `strength.ts` the opponent strength presets and their UCI options; `human.ts` the human-like move sampler. |
| `src/lib/chess/` | `rules.ts` FEN/PGN helpers, legality, terminal states, game phase, time controls; `eval.ts` score maths (win chance, accuracy, formatting); `classify.ts` grades and flags; `openings.ts` opening lookup; `captured.ts`. |
| `src/lib/analysis/` | `gameAnalysis.ts` whole-game analysis and the evaluation cache rules; `assess.ts` single-move assessment and the threat check; `tactics.ts` board facts; `explain.ts` the explanations and categories; `grades.ts` brilliant/great/book/miss; `review.ts` the guided-review steps; `tally.ts` and `progress.ts` the counts and trends behind Insights and Progress; `timeAnalysis.ts`; `opponentNotes.ts`; `weaknesses.ts`; `lineTree.ts` the variation tree behind the analysis board. |
| `src/lib/play/session.ts` | Rules, clocks, draw handling, takeback and PGN for a game in the app. Pure and driven by a timestamp argument, so it is deterministic to test. |
| `src/lib/games/` | Game records from PGN and from Chess.com, the personal-game filter, entries joining a game and its analysis. |
| `src/lib/chesscom/` | `client.ts` (serial queue, retry/backoff, error taxonomy), `mapper.ts` (API object to record), `sync.ts` (the import: archives, incremental sync, duplicates). |
| `src/lib/strength/estimate.ts` | The estimator, performance rating, backtest and report ([STRENGTH.md](STRENGTH.md)). |
| `src/lib/training/` | Puzzles, spaced repetition, repertoire, guess grading, endgame lessons and their record, the daily plan, `session.ts` (today's session), `streak.ts`, `retest.ts`, `reviewed.ts`, `weakspots.ts`. |
| `src/lib/storage/` | `db.ts` schema and versioning; `repos.ts` typed reads and writes; `backup.ts` backup, restore, clear; `autoBackup.ts` automatic backups (folder handle in the browser, a bridge in the desktop app); `prefs.ts` settings; `events.ts` change notifications. |
| `src/lib/data/` | The labelled demo game. |
| `src/data/openings.json` | Generated opening list (committed; `scripts/build-openings.mjs` rebuilds it). |
| `src/services/` | Stateful singletons: `engines.ts` (the hub of four engines: `live`, `batch`, `a`, `b`), `analysisQueue.ts`, `chesscomJob.ts`, `playEngine.ts`, `sound.ts`, `toast.ts`, `store.ts` (a tiny external store read with `useSyncExternalStore`). |
| `src/hooks/` | React glue: data queries that refresh on storage events, prefs, hotkeys, live analysis. |
| `src/components/` | Board (with typed-move entry and named pieces), scoresheet, eval bar and graph, dialogs and other UI primitives. |
| `src/pages/` | One file per screen; `pages/tools/` holds the training tools; `pages/analysis/` holds the analysis tabs. Pages are lazy-loaded. |
| `src/styles/` | `tokens.css` (colours as design tokens, light and dark) and `app.css`. |
| `electron/` | The desktop shell (CommonJS, Electron main process): `main.cjs` window, private `app://kibitz/` address, menu and IPC; `preload.cjs` the only bridge the page sees; `backup.cjs` the backup writer (tested on its own). `src/types/desktop.d.ts` types the bridge. |
| `public/` | Static files copied into the build as they are: the engine, `manifest.webmanifest`, icons, and `sw.js` (the service worker template). |
| `scripts/` | `prepare-assets.mjs` (engine files), `build-openings.mjs`, `postbuild.mjs` (fills the service worker's file list and version), `make-icons.mjs` (renders the PNG icons). |
| `tests/` | Vitest tests (`*.test.ts`); `tests/e2e/` the Playwright-driven browser tests; `tests/helpers/nodeEngine.ts` runs the real Stockfish build as a Node child process for unit tests. |

## Key design decisions

**Engine behind a transport.** `Engine` speaks UCI over an abstract `UciTransport`. In the browser the transport is a Web Worker. In unit tests it is the same Stockfish build running as a Node child process over stdio, wrapped when needed by a transport that injects faults (stalls, crashes). So the controller's cancel, restart and watchdog logic is tested against genuine UCI traffic, and the Worker path is covered by the browser tests.

**Scores are White-relative everywhere they are stored.** Conversion to "your" point of view happens at display and comparison time only (`forMover`). This removes a whole class of sign errors.

**Win chance as the common currency.** Grades, flags, accuracy, puzzles and weaknesses all work in win-chance points, not centipawns ([ANALYSIS.md](ANALYSIS.md)).

**Measured versus inferred is a data-model rule, not just wording.** Explanations carry an `evidence` object (engine lines and board-checked facts) separately from the `category` and lesson; the interface renders them in separate blocks.

**Background work never blocks and never loses finished work.** Analysis, puzzle generation and the Chess.com import run as jobs with progress and cancel, visible on every screen in a bar. Games are saved one at a time as they finish.

**Local-first storage.** IndexedDB with a versioned schema (`oldVersion`-gated upgrade steps), writes announced through `events.ts` so open screens refresh (also across tabs of the same browser via `BroadcastChannel`). A backup format with its own schema number allows moving data between browsers.

**One build, three ways to run.** The same `dist/` is served as a website, stored for offline use by the service worker (`public/sw.js`, filled in by `scripts/postbuild.mjs` with every file and a hash), and packaged inside the Electron app, which serves it from `app://kibitz/` so the engine's WebAssembly loads with the right content type and the app has a stable storage origin. The page talks to the desktop shell only through `window.kibitz` (folder choice and backup writing); everything else is the same code.

**One build, any static host.** Relative asset paths and hash routes; engine files are plain static assets in `/engines/`; the default engine needs no cross-origin isolation.

**Failure containment.** An `ErrorBoundary` wraps the routed screen (and resets when you navigate), so a crash in one screen never touches stored data; engine and network failures are turned into readable messages with a next step.

**Accessibility is structural.** Every board has a text description of the position and named pieces; every board that accepts moves has typed entry; dialogs trap focus; colours are tokens with checked contrast in both themes and are always paired with a word or glyph.

## Build and bundle

`vite build` (Rolldown) produces route-level chunks. `manualChunks` splits `react`, `chess` and `board` (react-chessboard and dnd-kit) from the pages. The largest page chunk is Openings (about 0.6 MB, uncompressed) because it carries the opening list. The default engine (Lite WASM, about 1.8 MB) is fetched when it is first needed.

TypeScript is strict, with `noUncheckedIndexedAccess`, `noImplicitOverride` and `noFallthroughCasesInSwitch`. ESLint (flat config, `typescript-eslint`, `react-hooks`) runs over `src`, `scripts`, `tests` and `electron`.
