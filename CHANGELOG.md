# Changelog

## 1.4.0

- **Kibi, a coach with a face.** A drawn, animated character (blinks, bobs, nine expressions, mouth moves while speaking) now greets you on the Desk, comments on each of your moves during a game, reacts to puzzles, opening drills, endgame lessons and positional quizzes, explains graded moves in Review, and sits in every empty state. It can read its lines aloud with your device's speech voices (off by default). Settings, Coach: show or hide it, live comments, voice, voice choice and speed. Its words are a fixed phrase pool plus facts the engine verified; it is not an AI model.
- **Tactic patterns** (Train): eleven patterns (hanging pieces, winning material, forks, pins, skewers, discovered attacks, checkmate, back-rank mates, quiet moves, sacrifices, promotion), each with how to spot it, an example board and a button that opens a practice set of that pattern.
- **683 puzzles**, up from 51, with themes and three levels, found by engine self-play and re-checked at depth 14.
- **One look across the app.** A shared stylesheet unifies cards, hover and press states, section labels, buttons and empty states; the Train hub fits all five learning cards in one row; endgame practice positions now have unique, descriptive titles.
- Fixes: the engine-match replay end-to-end test no longer races the move list.

## 1.3.0

- **Playing board matches the Bots page.** The Bots page, the Play setup screen and the game itself now show the board at the same size and the same place on the page (checked by an automated test at 1440 px wide). On the Play setup screen the board is a preview beside the settings.
- **Piece styles** (Settings): Classic, Minimal, Ink, Palette (the second colour follows your accent colour) and Figurines. They apply to the game boards and to the board on the Bots page. Under the default black-and-white theme Ink, Palette and Minimal look alike; the difference shows with a coloured palette.
- **Piece animation**: a piece speed setting (Fast, Normal, Slow), a ripple on captures, a pulse on a king in check and a ring on the selected piece. "Piece effects" turns the extras off; Reduce motion turns all of it off.
- **Endgames: 49 lessons** (26 added): pawn breakthrough, two connected pawns, the right bishop against the wrong-bishop draw, and 23 practice positions found by engine search (king and pawn, rook and pawn against rook, rook against a pawn, bishop and pawn). Each is a position where only the best move keeps the result and the next-best move already gives it up; the claims are re-checked at depth 22 in the tests.
- **Positional trainer: 16 ideas** (8 added: protected passed pawn, connected passed pawns, rook on the seventh, knight on the rim, base of a pawn chain, king stuck in the centre, lead in development, pawn shield) and 34 diagrams in all. Each diagram is checked by the same detector the app uses. The quiz now draws twelve positions at a time from the whole set.
- **Openings: 78 more named lines** (Colle-Zukertort, Chelyabinsk, Evans lines, Milner-Barry, Botvinnik Semi-Slav, Yugoslav Attack, Fried Liver, Traxler and more) and **77 more engine-found traps**, 138 in all across 49 openings. Same rule as before: the natural-looking move must lose clearly at depth 14, the reply must be a real tactic and the final position must stay clearly better for the trap-setter (depth 16).

## 1.2.0

- **Opening guide** (Openings → Library → "Which opening?"): advice for four rating ranges (under 1000, 1000 to 1600, 1600 to 2000, over 2000) naming what to play as White, against 1.e4 and against 1.d4, and a list of every opening from most defensive to most offensive. Every opening has a character card: how offensive it is, its style (attacking, positional, solid, counter-attacking, gambit, system), how much theory it needs and which rating ranges it suits. The rating advice is common coaching guidance and is labelled as such; it is not statistics from this app.
- **"What to play against..."**: answers to the most common moves (1.e4, 1.d4, 1.c4, 1.Nf3, the Italian, Ruy Lopez, King's Gambit, Open Sicilian and the usual anti-Sicilians, Queen's Gambit, Indian defences, London, Trompowsky, and White's choices against the French and Caro-Kann), each with the move, a short why, the rating ranges it suits and a link to study that opening.
- **Filters and sorting** in the library: by side, style, rating range, and sort by most defensive, most offensive or least theory.
- **Many more lines**: 130 named lines for 43 openings (Berlin, Marshall, Open Spanish, Winawer, Poisoned Pawn, Yugoslav Attack, Sveshnikov, Meran, Ragozin, Averbakh, Hedgehog and more). Each opening page has an "Other lines" section where every line can be watched or played yourself.
- **More traps**: 61 traps found by engine search (marked as such) across 39 openings, plus the Budapest knight mate, Fool's mate and the Noah's Ark trap. The engine-found traps are positions where a natural-looking move loses to a real tactic; each is checked at depth 16. They are not from a book and have no names. Three new openings: Barnes Opening (Fool's mate), Blackmar-Diemer Gambit and Albin Countergambit (84 in all).

## 1.1.0

- **Interactive lessons.** Every opening in the library and every trap has a "Play it yourself" drill: you move for your side, the book replies are played for you, a wrong move is refused with a hint (the arrow appears after two misses), and the number of times you completed each line is remembered on your device. Endgame lessons gained "Watch the best line", which asks the engine for its best line from the start position and lets you step through it with arrows (on top of playing it out against the engine with graded moves, which was already there).
- **Bigger opening library**: 81 openings (41 added: more Sicilians, Ruy Lopez, Italian, French, Caro-Kann, Queen's Gambit, Indian, Dutch, English and system openings, and gambits such as the Danish, Smith-Morra, Benko, Vienna and Latvian). Every line is replayed for legality in the tests. The new ones have no traps yet.
- **Bigger endgame library**: 22 lessons (9 added: two bishops against king, king-in-front pawn endings, knight and pawn, a stalemate-trick draw, cutting the king off with a rook, saving a lost rook ending with perpetual check, queen against a pawn on the seventh, opposite-coloured bishops, and Reti's study). Each claim is checked with Stockfish at depth 22. A tenth, Saavedra's study, was dropped because the engine did not confirm the win at that depth.
- **Colour palettes** (Settings): Ocean, Forest, Sunset, Violet and Rose, next to the default black and white. A palette changes the accent colour, the page tint and the Train hero card; every palette passes the automated contrast scan in light and dark.
- **More motion**: cards rise in one after another, cards and buttons respond to hover and press, the brand mark tilts, Train icons float gently, and a confetti burst marks a finished drill, an achieved endgame goal and a perfect positional quiz. All of it stops with "Reduce motion" or the system setting.

## 1.0.0

- **Positional play** (Train → Positional play): eight ideas (isolated, doubled, passed and backward pawns, outposts, rooks on open files, the bishop pair, the bad bishop) each with a diagram whose highlighted squares are checked by the same detector the app uses, what to do if you have it and if your opponent does, plus a "train your eye" quiz where you click the feature on the board.
- **Quiet mistakes are explained**: where a move loses ground with no tactic involved, Review now compares the position after your move with the position after the engine's move and says what changed (bishop pair given up, pawns doubled or isolated, an outpost missed or granted, a passed pawn created for the opponent, king cover weakened, pieces left undeveloped). It replaces the old "could not verify a concrete tactic" line. When no listed feature explains it, it says so instead of guessing.
- **Library puzzle pack** (Puzzles → Add the library pack): puzzles from engine self-play games started in the opening library, kept only when one move clearly stands out (Stockfish depth 13, two lines), with themes (mate, fork, pin, skewer, discovered attack, promotion, hanging piece, win material). They join your own puzzles: daily set, repetition, by-theme practice. The pack is small (51 puzzles, mostly level 1: 19 hanging-piece, 12 win-material, 8 other tactics, 5 forks, 3 pins, 2 skewers, 2 mates). A sample is re-checked at depth 16 in the tests.
- Train hub lists Positional play; a duplicate Engine match tile is gone; puzzle changes now refresh open pages (a notification after saving puzzles was never sent).

## 0.5.0

- Black-and-white look: white-dominant in light mode, black-dominant in dark mode, black-and-white board by default (people on the old green default move to it once; other board colours are kept). Move-grade colours stay, because they carry meaning.
- Board size: drag the bottom-right corner of the board to make it bigger or smaller (Analysis, Play, Match, Puzzles). It never grows past what fits on screen, the page does not move, the size is remembered, double-click resets, and the arrow keys work on the handle. Settings has a reset button.
- "Fix this first" card on the desk: your most important recurring weakness, how often it happens, and what to practise.
- Review notes: each move now also says what it threatens next and what the opponent's best reply is (from the engine line), both checked for legality.
- Today's session adds one rotating "something different" exercise (guess the move, endgame lesson, candidate moves, blunder prevention, opening check), changing daily and skipping the one already chosen for your weakness.
- Opening library (Openings → Library): 40 openings (the main e4 and d4 openings, plus Sicilian, Indian and gambit systems), each with the idea, plans for both sides, typical mistakes, a stepping board, classic traps (Légal's mate, Scholar's mate, Blackburne Shilling, Caro-Kann smothered mate, Elephant trap, Petrov queen trap, Kieninger trap) and what your own games say: how often you reached it, your record, and your costliest mistakes in it with links. Trap lines are replayed in tests; checkmate claims are checked to end in mate and material claims are checked with the engine.
- Endgame lab: new groups Bishop endgames and Queen endgames and four more lessons (hold the draw with the opposition, rook behind the passed pawn, the wrong-coloured bishop, queen against rook), each checked with Stockfish at depth 22.
- Faster: the Desk, Session, Insights and Progress pages no longer freeze while they work out your weaknesses (explanations are prepared in idle time and remembered; measured with 400 games: about 1.6 s of frozen page on every visit became under 0.1 s), opening lines are read directly from the move text instead of replaying every game, the games list shows 100 rows at a time, and background analysis no longer makes pages reload their data more than once a second.
- Simpler: the sidebar has six entries (Desk, Play, Games, Train, Insights, Settings); Bots, Match, Chess.com, Analysis, Session and Progress are reached from those pages. The Train page is a picture-led hub with an animated session card.
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
