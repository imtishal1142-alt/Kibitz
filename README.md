# Kibitz: chess analysis and coaching, in your browser or on your desktop

Kibitz imports your games, has **Stockfish 19 (WebAssembly)** check every move in a Web Worker, and turns the results into explanations, puzzles and practice built from *your own* mistakes. It also lets you play the engine, run engine-vs-engine matches, and keep an honest estimate of your playing strength.

It is a static web app that also ships as a desktop app (Windows, Linux, macOS via Electron). There is no server, no account and no API key. Everything is stored on your own computer. After the first visit it works offline.

> **Honesty statement.** What the engine *measured* is kept apart from what the app *infers*, on screen and in these docs. Where something could not be verified (for example a live Chess.com import, which the build sandbox could not reach), it says so: see [docs/LIMITATIONS.md](docs/LIMITATIONS.md) and [docs/TESTING.md](docs/TESTING.md).

## Quick start

Requires **Node 22.12 or newer** and npm. The app runs in current Chromium-based browsers (the only ones it was tested in), and should work in any browser with WebAssembly, Web Workers and IndexedDB.

```bash
npm install
npm run dev          # copies the engine files, then serves http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Prepares engine assets, starts the Vite dev server (port 5173). |
| `npm run build` | Prepares engine assets, type-checks, and builds the production app into `dist/`. |
| `npm run preview` | Serves `dist/` locally (port 4173). |
| `npm test` | Prepares engine assets, then runs the unit and integration tests (Vitest). Engine tests drive the real Stockfish 19 build, run as a Node process speaking UCI. |
| `npm run typecheck` | `tsc --noEmit` with strict settings. |
| `npm run lint` | ESLint over `src`, `scripts`, `tests` and `electron`. |
| `npm run desktop` | Builds the app and opens it in the desktop shell (Electron). |
| `npm run desktop:pack` | Builds the desktop app for this computer into `release/` (unpacked folder, no installer). |
| `npm run desktop:dist` | Builds the installers for this computer's system into `release/`: on Windows an installer and a portable `.exe`, on Linux an AppImage and a `.deb`, on a Mac a `.dmg`. |
| `npm run test:e2e` | Browser tests against the production build (`dist/`) in Chromium, including accessibility scans. Build first. |
| `node scripts/prepare-assets.mjs --full` | Also copies the full-strength engine (about 99 MB) so it can be chosen in Settings. |
| `node scripts/build-openings.mjs` | Regenerates the bundled opening list from the public-domain lichess dataset (needs network; the generated file is committed). |

The browser tests need a Chromium binary. They look in `/opt/pw-browsers/` and honour `CHROME_PATH=/path/to/chrome`.

## Desktop app

The desktop app is the same app in its own window, with the engine and all files inside it, so it needs no browser and no internet except for the Chess.com import. It runs on **Windows**, Linux and macOS.

```bash
npm install
npm run desktop:dist      # run this on the system you want an installer for
```

- **On Windows** this makes `release/Kibitz Setup 0.4.1.exe` (installer) and a portable `.exe`. Building the installer needs a Windows machine (or Linux with Wine).
- The packages were also built once from Linux (a Windows portable `.exe` and `.zip`, a Linux AppImage and `.deb`; about 100 to 160 MB each, too large to attach to the delivery, so build your own as above). Only the Linux builds were run and tested; **the Windows files have never been run on Windows**. None of the builds is code-signed, so Windows SmartScreen or macOS Gatekeeper will warn the first time (on Windows: "More info", then "Run anyway"). See [docs/LIMITATIONS.md](docs/LIMITATIONS.md).
- Your data lives in the app's own data folder (on Windows `%APPDATA%\chess-coach`). Use **Settings, Automatic backup** to have a backup file written daily to a folder you choose.
- Desktop tests: `npm run build`, then `xvfb-run -a node tests/e2e/desktop.mjs` on Linux without a screen, or `node tests/e2e/desktop.mjs` with one. `KIBITZ_APP=release/linux-unpacked/kibitz` tests the packaged build.

## What is in it

- **Analysis.** Full-game analysis with per-move evaluation, best move and line, centipawn and win-chance loss, a documented grade for every move, tactics detection, critical moments, turning points, an evaluation graph, opening names, and an interactive board with variations, a threat check, FEN and PGN copy.
- **Explanations without an AI service.** Each explanation separates *verified by the engine* from *interpretation*. See [docs/ANALYSIS.md](docs/ANALYSIS.md).
- **Play.** Against Stockfish at a chosen strength, with clocks or untimed, takebacks, resignation, draw offers and claims, promotion choice, flip, highlights, optional sounds, typed move entry, FEN start positions. **Bots** are eleven named opponents (Stockfish, limited and styled in documented ways, none with a rating). **Match Lab** runs engine against engine with independent settings, optionally starting from a bot; series are saved and replayable.
- **Chess.com.** The official public Published-Data API only: profile and ratings, archive import with progress, cancel, retry and backoff, incremental sync, duplicate prevention. See [docs/CHESSCOM.md](docs/CHESSCOM.md).
- **Library.** Search, filter, sort, import PGN (paste or file), import FEN, export, delete.
- **Insights.** Recurring weaknesses (with an honest "tentative" label when the evidence is thin), move-quality statistics, and a strength estimate whose range is never narrower than the data supports. See [docs/STRENGTH.md](docs/STRENGTH.md).
- **Review like a coach.** Grades with icons (brilliant, great, best, excellent, good, book, inaccuracy, miss, mistake, blunder), accuracy for both players, a guided review with retry, and counts of every grade. Rules in [docs/ANALYSIS.md](docs/ANALYSIS.md); they are this app's own, not Chess.com's.
- **Daily practice.** Today's session, streak, retests of old mistakes, a Progress page with an honest practice check, time-use analysis, opponent and theory notes, games from your own mistake positions, a human-like opponent.
- **Training.** Personalised puzzles checked by the engine, with hints and spaced repetition; opening repertoire trainer; Guess the Move; Mistake Replay; Blunder Prevention; Candidate Moves; Endgame Lab; Position Notebook; Post-Game Reflection; Training Calendar.
- **Offline and backup.** Installable, works offline, optional automatic backup to a folder. See Desktop app and [docs/DATA.md](docs/DATA.md).
- **Privacy.** Local only; backup, restore and "delete all my data" in Settings. See [docs/DATA.md](docs/DATA.md).
- **Accessibility and polish.** Light and dark themes, responsive down to 320 px, keyboard operation (including playing moves by typing), reduced-motion option, onboarding, a clearly labelled demo game.

The complete list, with where each part is tested, is in [docs/FEATURES.md](docs/FEATURES.md).

## Deploying

`npm run build` produces a plain static site in `dist/`.

- Upload it to any static host (GitHub Pages, Netlify, S3, nginx). The build uses relative asset paths (`base: './'`) and hash-based routes (`#/analysis`), so it works from a sub-path and needs **no rewrite rules**.
- Serve `.wasm` files as `application/wasm` (all common hosts do).
- The default engine is single-threaded, so **no special headers** (COOP/COEP, `SharedArrayBuffer`) are required.
- Use HTTPS for a public site. After the page has loaded, nothing needs the network except the optional Chess.com import. A service worker (generated by `npm run build`) stores the whole app, engine included, on the first visit, so it reloads and runs offline afterwards. Serve it over https (or localhost); a service worker is not available from `file://`.
- Data is kept per origin. If you change the site's address, the new address starts empty; use Settings, Download backup, then Restore.

## Engine

Stockfish 19.0.1 as built by [Stockfish.js](https://github.com/nmrugg/stockfish.js), run in a dedicated Web Worker and driven through the standard UCI protocol. The default is the small single-threaded "Lite" WebAssembly build (about 1.8 MB); an asm.js fallback is included for browsers without WebAssembly; the full-strength build is optional. Details, options and caveats: [docs/ENGINE.md](docs/ENGINE.md).

## Documentation

| File | Contents |
| --- | --- |
| [docs/FEATURES.md](docs/FEATURES.md) | Feature list, with how each was verified. |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | Known limitations and things not verified. |
| [docs/ENGINE.md](docs/ENGINE.md) | Stockfish configuration, UCI usage, evaluation perspective, caching, strength settings. |
| [docs/ANALYSIS.md](docs/ANALYSIS.md) | Move classification, accuracy, tactics, explanations, weaknesses, puzzles. |
| [docs/STRENGTH.md](docs/STRENGTH.md) | Strength-estimation methodology. |
| [docs/CHESSCOM.md](docs/CHESSCOM.md) | Connecting to Chess.com and what the API can and cannot do. |
| [docs/DATA.md](docs/DATA.md) | What is stored, backup, restore and clearing data. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the code is organised. |
| [docs/TESTING.md](docs/TESTING.md) | How to run the tests, and the real results of the last run. |
| [CHANGELOG.md](CHANGELOG.md) | Release notes. |

## Licence

Kibitz is distributed under the **GNU General Public License v3.0 or later** (see [LICENSE](LICENSE)) because it ships Stockfish, which is GPL-3.0. Third-party notices are in [NOTICE.md](NOTICE.md). If you host a modified copy, the GPL requires that you offer its source to your users.
