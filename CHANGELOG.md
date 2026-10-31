# Changelog

## 0.5.0

- Black-and-white look: white-dominant in light mode, black-dominant in dark mode, black-and-white board by default (people on the old green default move to it once; other board colours are kept). Move-grade colours stay, because they carry meaning.
- Board size: a slider with smaller/larger/reset under the board (Analysis, Play, Match) and in Settings; remembered, 60 to 140 percent.
- "Fix this first" card on the desk: your most important recurring weakness, how often it happens, and what to practise.
- Rounder buttons, flatter cards, sharper board frame.
- No further engines added: none of the other open-source engines found could be run in the browser with a compatible licence (see docs/LIMITATIONS.md).

## 0.4.1

**Maia bots.** Five new opponents, Maia 1100, 1300, 1500, 1700 and 1900: neural networks trained on human Lichess games, so they play the openings and make the mistakes of people at that level. They also appear as an opponent type in Play and in the Match Lab. They run in a Web Worker with a small runner written for this project (no search; about a tenth of a second per move on a laptop). The networks (GPL-3.0, CSSLab) download the first time one is played. Lc0 itself could not be added; see `docs/LIMITATIONS.md`.

## 0.4.0

**Look, from your Chess.com screenshots (structure and feel only; no artwork, names or icons of theirs).** The game review panel has a dark title bar, a coach bubble ("There are 4 critical moments…"), white and dark accuracy chips, grade counts on either side of a centred icon, and a large Start review button pinned to the bottom. Player strips have an avatar tile and a bolder clock. The Desk opens with a hero: your name and streak, Start game, Play bots, Engine vs engine, Analysis board, and three board cards (puzzles from your games, today's training, your last game). Pages fade in; cards lift on hover; all motion obeys the reduced-motion setting.

**Bots screen redone** as a board with a bot picker: choose a portrait (original drawn faces, not likenesses of anyone), choose a colour, press Play and the game starts at once.

## 0.3.2

**Pages that would not load.** After a new version is published, a tab that is still open can ask for page files that no longer exist. A page file that fails to load is now retried, then the stored copies of the app are cleared and the page reloads once (never in a loop), and if that fails a clear "reload the latest version" screen replaces the generic error.

**Collapsible sidebar.** A button at the bottom of the navigation rail shrinks it to icons (wide screens) and the choice is remembered. Labels stay available to screen readers and as tooltips.

## 0.3.1

**Faster analysis.** Games of yours that have no analysis are now analysed in the background by themselves (newest first, up to a limit you choose, off-switch in Settings; held back when the browser asks for data saving or the battery is low). The queue can analyse several games at once, each with its own engine (automatic from the number of cores, or 1 to 4). Positions analysed in any earlier game are reused when the saved result is deep enough, and the single- and multi-threaded Lite builds now share saved results. Measured on a 2-core test machine with 6 unrelated 60-move games at depth 14: 41 s per game one at a time, 18 s per game two at a time; a third engine gave no further gain on 2 cores. Your computer will differ.

## 0.3.0

**Interface.** A refined, board-first look: a dark navigation rail with labels (icon-only on narrow screens, bottom bar on phones), raised "pressable" buttons, flatter cards, a compact header on screens with a board so the board and both player strips fit without scrolling, and a board preview on the Play setup. Still no logos, names or artwork from any other site.

**Bots.** A Bots page with eleven named opponents in four tiers. Each is the bundled Stockfish limited by UCI_Elo, Skill Level, a depth cap or the human-like mode; some also carry a *style* (attacker, trader, defender), a modest bias toward captures and checks, or away from them, among the candidate moves it may play. No bot has a rating. Choosing a bot opens Play with its settings; the Match Lab can start either side from a bot.

**Engines.** The Lite build can run multi-threaded when the page is cross-origin isolated (Automatic picks it on computers with 3 or more cores, and falls back to single-threaded if it cannot start). Settings can choose a separate build for game review and puzzle generation. Only Stockfish builds are bundled: Torch (proprietary) and AlphaZero/AlphaGo (never released) cannot be added, and Lc0/Maia are not included (see `docs/LIMITATIONS.md`).

**Speed.** A lightweight copy of each analysis (without per-position data) makes lists load quickly (IndexedDB version 2, built and checked automatically); `_headers` for Cloudflare gives long caching of hashed assets and enables cross-origin isolation; long lists paint lazily.

## 0.2.0

**Review like a coach.** New grades on top of the loss grades: brilliant, great, book and miss, with icons on the board, the move list and the graph; a review summary with accuracy for both players; a guided review that walks through your mistakes and lets you try another move against the engine; counts of every grade on Insights and Progress, with the brilliant moves listed and linked. Accuracy is unchanged. Stored analyses are upgraded automatically.

**Practice that adds up.** Today's session (due puzzles, mistake retests, a game to review, a weakness drill, a reflection), a streak, retests of mistakes on a 1/3/7/14/30-day schedule, a Progress page with trends, and an honest "is your practice working?" check that says when it lacks evidence.

**Learn from the clock and the opponent.** Time use per game and across games, theory-departure and opponent notes in the game report.

**Practice games.** A human-like opponent that makes plausible mistakes, games from the positions where you went wrong, and a success record for each endgame.

**Offline, install, backup, desktop.** A service worker stores the whole app so it runs offline; a web manifest and icons make it installable; automatic daily backup to a folder you choose (newest 7 kept); an Electron desktop app with Windows, Linux and macOS packaging configured (Linux built and tested; Windows files built but not run; macOS not built).

**Look.** A new charcoal-and-green design, close in spirit to Chess.com's review screens (not a copy: no logos, names or artwork of theirs), light and dark.

**Internal.** Analysis format version 2; new `kv` keys; `device.` keys that are never exported; `npm run desktop`, `desktop:pack`, `desktop:dist`; the service worker is generated by `scripts/postbuild.mjs`.

## 0.1.0

First complete version.

**Engine.** Stockfish 19 (WebAssembly, single-threaded Lite build; asm.js fallback; optional full build) in Web Workers over UCI, with cancel and restart, MultiPV, a documented White-relative evaluation convention, progress, watchdog and crash recovery, strength limiting by `UCI_Elo` or `Skill Level`, and an evaluation cache keyed by position and engine build.

**Play.** Human against Stockfish and engine against engine, with clocks or untimed play, takebacks, resignation, draw offers and claims, promotion choice, board flip, highlights, optional sounds, typed move entry, FEN start positions, and a Match Lab with saved, replayable series.

**Chess.com.** Official Published-Data API only: profile and ratings with date and source, archive import with progress and cancel, incremental sync, duplicate prevention, retry with backoff, readable errors. *Not verified against the live service* (see `docs/LIMITATIONS.md`).

**Library.** Search, filter, sort, PGN and FEN import, export, delete, with named reasons for games that cannot be read.

**Analysis.** Whole-game analysis with grades from win-chance loss, flags (missed mate, allowed mate, missed win, turning point, critical), tactics read from the board, opening identification, critical moments, evaluation graph, variations, threat check, and a game report. Explanations separate engine-verified facts from interpretation, with no external AI service.

**Insights.** Weakness detection with honest evidence levels, move-quality statistics, a results-based strength estimate with a stated confidence level and range, a performance rating, a backtest, and an experimental move-quality-implied rating that appears only when its conditions are met. No accuracy-to-Elo formula is used.

**Training.** Engine-verified personalised puzzles with hints and spaced repetition; opening repertoire trainer; Guess the Move; Mistake Replay; Blunder Prevention; Candidate Moves; Endgame Lab; Position Notebook; Post-Game Reflection; Training Calendar.

**Data and privacy.** IndexedDB with a versioned schema, backup and restore (merge or replace), clear cache, reset settings, delete everything. No accounts, no analytics, no server.

**Quality.** Strict TypeScript, ESLint, 142 unit and integration tests, 25 browser tests including axe-core accessibility scans of every page in light and dark on desktop and phone, and a keyboard-only test. Responsive down to 320 px.
