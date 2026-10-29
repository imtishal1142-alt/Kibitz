# Features

"Checked by" says how each area was verified. **Unit** means a Vitest test (several of them drive the real Stockfish 19 build, run as a Node process speaking UCI; the browser Worker path is covered by the browser tests); **Browser** means a Playwright test against the production build in Chromium. "Not verified" means exactly that. Test names and the results of the last run are in [TESTING.md](TESTING.md).

## Engine

| Feature | Notes | Checked by |
| --- | --- | --- |
| Stockfish 19 in a Web Worker | WebAssembly "Lite" single-thread build by default; asm.js fallback; optional full network. | Unit (real engine); Browser (Lite). Full build run once by hand in the browser: it loaded and searched; not part of the automated suite. |
| UCI handling | `uci`/`isready` handshake, `position`, `go` (depth, movetime, clocks), `stop`, `setoption`, MultiPV, info parsing. | Unit |
| Cancel and restart | A new request stops the old search and waits for it to finish before the next `position`/`go`, so a stale `bestmove` cannot be attributed to the wrong request. | Unit |
| Evaluation perspective | All scores leave the engine module from **White's** point of view. | Unit |
| Progress | Depth, speed and line count are reported while searching. | Unit, Browser |
| Strength option | UCI `UCI_LimitStrength` + `UCI_Elo` (1320 to 3190) or `Skill Level` (0 to 20), plus depth and time caps. | Unit |
| Watchdog and crash handling | A stalled search or a dead worker is detected; the next request restarts the engine and the interface says so. Illegal positions are rejected with a readable message. | Unit, Browser |
| Cache | Evaluations are cached in IndexedDB, keyed by position and engine build; reused only if at least as deep and with at least as many lines; cleared in Settings. | Unit (reuse rules with a stand-in engine; repeat analysis with the real engine) |

## Play

| Feature | Notes | Checked by |
| --- | --- | --- |
| Human vs Stockfish | Choose colour (or random), level, clock, optional FEN start. | Unit (game session); Browser |
| Clocks | Based on timestamps, so a background tab cannot drift; increments; untimed games. Flag fall ends the game. | Unit; Browser |
| Takeback, resign, draw | Takeback removes your move and the engine's reply. Resignation asks for confirmation. Draw offers are answered by the engine (accepts at roughly equal, never offers). Threefold and fifty-move draws can be claimed; fivefold and seventy-five-move end the game. | Unit; Browser (takeback, resign) |
| Promotion | Choice dialog, or auto-queen in Settings. | Unit (rules) |
| Board | Flip, last-move and legal-move highlights, coordinates, optional sounds, board colours, glyph or classic pieces. | Browser (settings persist) |
| Typed moves | "Type a move" under every board that accepts moves (`Nf3`, `e2e4`, `O-O`): the keyboard-only way to play. | Browser |
| Opponent strength | Full, `UCI_Elo`, Skill Level, Shallow (depth cap) or Human-like. | Unit; Browser |
| Engine vs engine (Match Lab) | Independent settings for each side, series length, alternating colours, pause after the current move, resume, stop, restart. Every game is saved; series are listed and replayable in the analysis board. | Browser |
| Closing the tab mid-game | The browser asks for confirmation. Leaving by in-app navigation ends the game unsaved. | Not automated |

## Library and import

| Feature | Notes | Checked by |
| --- | --- | --- |
| PGN import | Paste or file; multiple games; names the games it cannot read and why (for example an illegal move). | Unit; Browser |
| FEN import | Validates legality; opens the analysis board or notebook. | Unit; Browser |
| Duplicate prevention | By Chess.com game id and by a content fingerprint, so the same game arriving by PGN and by API is stored once. | Unit; Browser |
| Search, filter, sort | Opponent, opening, ECO, tag; source; time class; result; analysed state. | Browser (table and counts only; each filter control is not individually tested) |
| Export | PGN of the shown games; PGN or FEN from the analysis board. | Unit; Browser |
| Persistence | IndexedDB with a versioned schema. | Unit (fake IndexedDB); Browser (reload) |

## Chess.com (official Published-Data API)

See [CHESSCOM.md](CHESSCOM.md).

| Feature | Checked by |
| --- | --- |
| Profile dashboard: avatar, ratings per time class, with the date and source of the data | Unit; Browser (mocked API) |
| Monthly archive import, progress, cancel | Unit; Browser (mocked API) |
| Incremental sync: finished months are not downloaded again; the current month is re-checked | Unit; Browser (mocked API) |
| Retry with exponential backoff, `Retry-After`, rate-limit handling, readable errors for unknown user and network failure | Unit; Browser (mocked API) |
| **A live import from api.chess.com** | **Not verified.** The build sandbox could not reach the service. |

## Analysis

See [ANALYSIS.md](ANALYSIS.md).

| Feature | Checked by |
| --- | --- |
| Whole-game analysis in a background queue, with progress and cancel; depth presets Quick (10), Standard (14), Deep (18) | Unit; Browser |
| Opening identification by position (transposition-safe) from a bundled CC0 list | Unit |
| Per-move evaluation, best move, principal variation, centipawn loss, win-chance loss | Unit |
| Loss grades: best, excellent, good, inaccuracy, mistake, blunder, forced (only legal move), with flags (missed mate, allowed mate, missed win, turning point, critical) | Unit |
| Context grades: **brilliant**, **great**, **book**, **miss** (rules in [ANALYSIS.md](ANALYSIS.md)); accuracy never depends on them | Unit (rules and a real game: Morphy's 16.Qb8+ is brilliant); Browser |
| Tactics facts read from the board: forks, pins, skewers, discovered attacks, pieces left en prise, back-rank mates, captures and their defenders | Unit |
| Critical moments and turning points, with `[` and `]` navigation | Unit; Browser |
| Evaluation graph and eval bar | Browser (renders) |
| Interactive board: variations, delete variation, flip, FEN and PGN copy, threat check, notebook save | Unit (line tree); Browser |
| Game report: accuracy, grade counts by phase, recommendations | Browser (renders, accessibility scan) |
| Labelled demo game, analysed in the browser, excluded from statistics unless you opt in | Browser |

## Game review (Chess.com-style)

| Feature | Checked by |
| --- | --- |
| Review summary with accuracy for **both** players, a grade count row for each, and a "You" marker | Browser (axe scan, light and dark) |
| Grade icons on the board square, in the move list and the eval graph | Browser |
| Guided review: walks through your mistakes, misses and blunders (and your best moments) one at a time, with the engine's move shown on request | Browser |
| **Try again**: play another move; the engine grades it against the position, and a move that holds counts as solved | Browser |
| Old analyses are upgraded to the current grade format from their stored evaluations, with no engine run | Unit |
| Moves by grade on Insights and Progress: counts for every grade; the **brilliant** count opens a list of those moves and the game each came from | Unit; Browser |

## Daily session, progress and retests

| Feature | Checked by |
| --- | --- |
| Today's session: due puzzles, due retests, a game to review, a weakness drill and a reflection, built only from what you have; marks steps done; streak | Unit; Browser |
| Retests: mistakes you solved come back after 1, 3, 7, 14, 30 days; failed ones come back in minutes | Unit; Browser |
| Progress: accuracy and mistakes per game over time, games reviewed, retests, with a text equivalent for every chart | Unit; Browser (axe scan) |
| "Is your practice working?": compares recent games with earlier ones for a practised weakness; says it lacks evidence below stated sample sizes | Unit; Browser |
| Time use: time per move for each game, moves in time trouble, fast mistakes, longest thinks; pooled across games on Insights | Unit; Browser |
| Theory and opponent notes in the game report: who left the named openings, what the list and Stockfish had there; opponent accuracy, mistakes and clock | Unit; Browser |

## Practice games

| Feature | Checked by |
| --- | --- |
| Human-like opponent (two levels and a "carefulness" slider): picks among the engine's top five moves with probabilities that favour better moves | Unit (sampling rules; real engine returns legal and forced moves); Browser |
| Start from one of your mistakes: a position that was still balanced, with the side you had | Unit; Browser |
| Endgame lab keeps attempts and successes per ending and shows them on the list | Unit; Browser (list) |

## Offline, install, backup and desktop

| Feature | Checked by |
| --- | --- |
| Offline: a service worker stores the whole build (about 6.5 MB, engine included); the app reloads and plays the engine with the network switched off | Browser (Chromium, network off) |
| Installable web app: manifest with standalone display, icons including a maskable one | Browser (manifest and icons load); installing itself was not exercised |
| Automatic backup to a chosen folder, once a day, newest 7 kept, only its own files touched | Unit; Browser (Chromium File System Access API with a real directory handle) |
| Backup reminder on Home when you have games and no backup for two weeks | Not automated |
| Desktop app (Electron): runs from its own address, isolated page, engine works, native folder choice for backups | Browser-driven tests of the real Electron app on Linux (source tree and packaged build) |
| Windows and macOS builds | Built for Windows (portable .exe and zip); **not run** on Windows. macOS **not built**. See [LIMITATIONS.md](LIMITATIONS.md) |

## Explanations

The explanation text is generated by the app with **no external AI service**. Each explanation shows a *Verified by the engine* block (facts checked against the position and the engine's lines) separately from an interpretation (category, lesson, suggested exercise) that is heuristic. Checked by: Unit; Browser (renders).

## Insights

| Feature | Checked by |
| --- | --- |
| Weakness detection by category, with counts, games, rate per 100 moves, share of points lost, trend, and a *tentative* label for thin evidence | Unit; Browser |
| Move-quality statistics (accuracy, average centipawn loss, grade rates) | Unit; Browser |
| Results-based strength estimate with a stated confidence level and an honest range, per time class | Unit; Browser |
| Performance rating, shown separately | Unit; Browser |
| Backtest against your own history (Brier score) | Unit |
| Experimental move-quality-implied rating, only when its stated conditions are met | Unit |
| Official, estimated and performance ratings, and move-quality statistics are never merged into one number | Unit; Browser |

Methodology: [STRENGTH.md](STRENGTH.md).

## Training

| Tool | What it does | Checked by |
| --- | --- | --- |
| Puzzles | Generated from your own games; each is re-searched at depth 16 and kept only if the engine's answer is clearly better and unique (or well ahead of your move). Hints, any engine-approved first move accepted, Leitner spaced repetition, an adaptive puzzle rating. | Unit; Browser |
| Opening trainer | Build a repertoire from lines you type or from your own games; drill it; see where your games leave it; explore opening theory. | Unit; Browser |
| Guess the move | Play a game forward; the engine grades each guess against the move played. | Browser |
| Mistake replay | Go back to your mistakes and try another move; the engine compares. | Browser |
| Blunder prevention | Name the threat first (click, or type the square), then choose a move. | Browser |
| Candidate moves | Note one to three candidates, then compare with the engine. | Browser |
| Endgame lab | Classic endings against the engine with a graded move list. Verdicts are engine-verified, not tablebase-proven. | Unit (every lesson's claim checked at depth 22); Browser |
| Position notebook | Save positions with notes, tags and variations; search; survives a reload. | Browser |
| Post-game reflection | Three questions and a self-rating, saved per game. | Browser |
| Training calendar | Activity by day, with a daily goal. | Browser |
| Engine Match Lab | See Play. | Browser |

## Settings, privacy and data

Theme (system, light, dark), board colours, piece set, sounds and volume, reduced motion, engine build, hash size, analysis depth and lines, daily goal, Chess.com username, demo-game opt-in. Backup (JSON), restore (merge or replace), clear the evaluation cache, reset settings, and "Delete all my data" (typed confirmation). See [DATA.md](DATA.md). Checked by: Unit (backup merge, idempotence); Browser (round trip, bad file refused).

## Accessibility and responsive design

- Responsive from 320 px; no horizontal page scroll on any page at 320 or 390 px; bottom navigation on phones. Browser test.
- Light and dark themes; text contrast checked with axe-core on every page in both themes. Browser test.
- Keyboard: skip link, visible focus, dialogs trap focus and close with Esc, shortcuts in the analysis board, moves can be typed everywhere a board accepts moves. Browser test.
- Board pieces are named for assistive technology (for example "white knight on g1"), and every board has a text description of the position.
- Automated scans (axe-core, WCAG 2.0/2.1 A and AA rules plus best practices) find no violations on the pages and states tested. **That is not a claim of WCAG conformance, and the app has not been tested with a screen reader by a person.**

## Not in this version

Multi-device sync or accounts; cloud storage; opening books or endgame tablebases; variants other than standard chess; multi-threaded Stockfish; automatic upload of anything anywhere.
