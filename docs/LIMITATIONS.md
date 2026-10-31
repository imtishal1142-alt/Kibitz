# Known limitations

Written to be read, not skimmed past. Items marked **Not verified** are things the app is built to do but that could not be proven in the environment where it was built.

## Not verified

1. **A live Chess.com import.** The sandbox the app was built in could not reach `api.chess.com`. The client was tested against recorded and scripted responses (unit tests with a scripted `fetch`, and browser tests that intercept the network and reply with fixtures; both are labelled "mocked" in the test names). The endpoints, response shapes and rate-limit behaviour are taken from Chess.com's published documentation and from the author's knowledge of it, not from a live call. If a live import fails for a reason that is not your network, an extension, or Chess.com being down, treat it as a bug. See [CHESSCOM.md](CHESSCOM.md).
2. **Browsers other than Chromium.** The browser tests run in Chromium only. Firefox and Safari should work (WebAssembly, Workers and IndexedDB are standard) but were not tried.
3. **Screen readers.** Automated accessibility scans and keyboard-only tests pass, and the board has text alternatives, but no person has used the app with a screen reader. Do not read the passing scans as WCAG conformance.
4. **Large histories.** Tests use fixtures of a handful of games and a few mocked months. Importing and analysing thousands of games has not been stress-tested; it should work (storage is IndexedDB, imports are one month at a time, analysis is queued) but the speed and the memory use at that scale are unmeasured.
5. **Offline use and installation.** The service worker is tested in Chromium only. Installing the web app from the browser menu was not exercised. Offline needs one visit over https or localhost first; Chess.com import always needs the network.

## Engine and analysis

- **Single-threaded, "Lite" network by default.** Analysis is slower and slightly weaker than desktop Stockfish. It is still far stronger than any human, and depth, not raw strength, is what limits the usefulness of the verdicts. A full-strength single-threaded build (about 99 MB) can be added with `node scripts/prepare-assets.mjs --full`; it was loaded and run once in the browser but is not part of the automated tests. Multi-threaded builds are not shipped, because they need cross-origin isolation headers that a static host may not provide.
- **Grades depend on depth.** A move graded "best" at depth 14 might be revised at depth 30. Every stored analysis records the depth it used. The grade thresholds are this app's own choice; other tools use other numbers and will disagree on some moves.
- **`UCI_Elo` is not a human rating.** The opponent levels use Stockfish's own strength limiter, calibrated by its developers against engine rating lists at fast time controls. It is not a Chess.com, Lichess or FIDE rating. Someone rated 1500 online will not necessarily score 50% against "1500".
- **Endgame verdicts are engine-verified, not proven.** Each Endgame Lab position's claim ("White wins", "Black can hold") was checked with Stockfish at depth 22. There is no tablebase.
- **No opening book for the opponent.** The engine plays from its own search from move one.
- **Explanations are written by rules, not by a language model.** They are accurate about what the engine and the board show, and the *interpretation* part (category, lesson) is a heuristic reading that can be wrong or incomplete. The interface labels the two parts differently.
- **Tactics detection is not exhaustive.** It recognises a fixed set of patterns (forks, pins, skewers, discovered attacks, pieces left en prise, back-rank mates). A move can be a blunder for a reason the patterns do not name; those fall under the general categories.
- **Standard chess only.** Chess.com variants (Chess960, bughouse and others) are skipped on import and named in the summary. Pasted PGN for other variants is not supported and may be refused or misread; the app does not check for it specially.

## Strength estimate

- **Not calibrated against an outside dataset.** No data set of players with known ratings and engine-analysed games was available, so the move-quality-implied rating is a self-calibrated experiment and is labelled that way. The backtest measures how well the estimate predicted *your own* later results, not how close it is to any official rating. See [STRENGTH.md](STRENGTH.md).
- **Games against the engine do not feed the estimate**, because they have no opponent rating.
- **No rating history.** Chess.com's public API has no rating-history endpoint. The sparkline is built from the rating recorded after each game you imported.
- Small samples give wide ranges, and the app shows them as wide. Below five rated games in a time class it declines to estimate.

## Training

- **Puzzles:** the first move is accepted if it is a stored answer or the engine rates it within 5 percentage points of winning chances of its best move; later moves in a longer sequence must follow the engine's line, so a second, equally good path through a long sequence is marked wrong.
- **Puzzles are only as good as the games** you have analysed. With few games there are few puzzles, and mostly of the kind you actually miss.
- The weakness patterns are *tentative* until at least 4 occurrences across at least 3 games, and a trend needs at least 9 analysed games.
- The puzzle rating is a private practice number, not a chess rating.

## Play

- **Leaving the Play page by navigating inside the app ends the game without saving it.** Closing or reloading the tab asks for confirmation first (this prompt is not covered by an automated test).
- Games against the engine have no opponent rating.
- The engine accepts a draw offer when its own depth-12 evaluation is at most +0.20 pawns for it and it sees no mating win. It never offers or claims draws. That rule is this app's, not a property of Stockfish.

## Data and privacy

- **Data lives in one browser on one device.** A different browser, a different device, a private window, or a different address has its own empty copy. Clearing site data erases everything. Use Settings, then Download backup, to keep a copy; there is no cloud sync.
- Two tabs writing at once is not coordinated beyond what IndexedDB itself guarantees.

## Packaging

- The opening list adds about 0.6 MB (uncompressed) to the Openings page's code. The default engine adds about 1.8 MB, downloaded when it is first needed and cached by the browser.
- The app is GPL-3.0-or-later because it ships Stockfish; see [NOTICE.md](../NOTICE.md).

## Added in version 0.2

- **Desktop app.** Built and tested (real Electron, driven by Playwright) on Linux only, both from the source tree and from the packaged build. The **Windows** files (a portable `.exe` and a `.zip`) were built from Linux and **have never been run on Windows**. The Windows *installer* (NSIS) could not be built here because it needs Wine; build it on a Windows machine with `npm run desktop:dist`. **macOS** was not built or tested (it needs a Mac). None of the builds is code-signed, so Windows SmartScreen and macOS Gatekeeper will warn on first run. There is no auto-update. Each Electron build is about 100 to 130 MB.
- **Brilliant, great, miss are this app's rules**, not Chess.com's (which are not public). See [ANALYSIS.md](ANALYSIS.md). Accuracy differs from Chess.com's number.
- **Automatic backup** depends on the File System Access API (Chromium browsers) or the desktop app; the browser may ask permission again after a restart, and the app can then only wait for your click. Other browsers get a reminder only.
- **Time analysis** needs games with clock times. Games without `[%clk]` comments are skipped, and the patterns need enough moves (see ANALYSIS.md).
- **Opponent and theory notes** do not know how common a line is, because the bundled list holds names only; there is no database of strong players' games.
- **Human-like opponent** is not calibrated to a rating.
- **"Is your practice working?"** compares groups of games; it cannot show that practice caused a change, and it says nothing when the samples are small.
- **Not tested**: any screen reader; browsers other than Chromium; Android (the web app is responsive and installable in principle, but no Android build or device test was done); live Chess.com import.

## Engines other than Stockfish (0.3)

- **Torch** is Chess.com's proprietary engine and **AlphaZero/AlphaGo** were never released. They cannot be included.
- **Lc0** (the full engine, with search) is not included. The only ready-made WebAssembly build I found (Lichess's `zerofish`, AGPL-3.0) crashes on its first search in a browser, and I could not rebuild it here. Small networks without search can be run, and that is what the Maia bots use (below).
- **Maia** (1100, 1300, 1500, 1700, 1900; Lichess scale) is included as bots and as an opponent type. A network file is read and run by `src/lib/engine/lc0net.ts` in a Web Worker: one forward pass per move, no search. The input encoding and the policy-channel layout were reconstructed from the file format and checked against the shipped networks (known openings, the Black-side mirroring, a hanging queen), not against Lc0's own source or output, so some rare details (for example under-promotions, which Maia bots never play, and the 50-move counter scaling) may differ. Maia cannot evaluate a position, so it is not offered as a review engine.
- Maia's ratings are those of the Lichess players it learned from. They do not translate to Chess.com ratings, and a bot is not guaranteed to score what its band suggests.
- The Maia networks (6 MB) are downloaded the first time a Maia bot is played and then kept by the browser; they are not part of the offline copy until then.
- Another open-source chess engine that runs in the browser as WebAssembly is Fairy-Stockfish (GPL-3.0, `fairy-stockfish-nnue.wasm` on npm). It is not included: for ordinary chess it is a Stockfish derivative with no clear benefit here.
- Bot "styles" are a bias in move choice among Stockfish's top five moves, not a different engine. Bots have no rating.
- Layout was checked in Chromium at 320, 390 and 1440 px and by automated accessibility scans; Firefox, Safari, Windows and a screen reader were not tested.

## Deploying to Cloudflare

Build with `npm run build` and deploy the `dist` folder. `dist/_headers` is honoured by Workers static assets and Pages: it sets the cross-origin isolation headers (needed for the multi-threaded engine) and long caching for hashed files. Each file must be under 25 MB, so keep the optional 99 MB "full" engine out of the deployed folder (it is not built by default).
