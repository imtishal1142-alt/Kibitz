# Stockfish configuration

## What runs

**Stockfish 19.0.1**, as compiled to WebAssembly by [Stockfish.js](https://github.com/nmrugg/stockfish.js) (npm package `stockfish`), running in a dedicated Web Worker. The app talks to it with the standard **UCI** protocol over `postMessage`; nothing is sent to a server.

`npm run prepare-assets` (run automatically by `dev`, `build` and `test`) copies the engine files from `node_modules/stockfish/bin/` into `public/engines/`, writes `public/engines/manifest.json`, and copies the GPL text and a notice next to the binaries. The engine files are generated, not committed.

| Flavour id | Files | Size | Notes |
| --- | --- | --- | --- |
| `lite-wasm` (default) | `stockfish-19-lite-single.js` + `.wasm` | about 1.8 MB | Single thread. Small download; no special headers needed. |
| `asm` | `stockfish-19-asm.js` | about 3.2 MB | asm.js fallback for browsers without WebAssembly. Slow. |
| `full-wasm` (optional) | `stockfish-19-single.js` + `.wasm` | about 99 MB | Strongest network, still single thread. Added only by `node scripts/prepare-assets.mjs --full`. |

The flavours present in the manifest are what Settings, Engine offers. Pick one there; the choice is stored in your preferences and the engine restarts. Run the `--full` command, then `npm run build` again, to make the full build available in a production bundle. (It was run once in the browser and searched normally; it is not covered by the automated tests.)

No multi-threaded build is shipped: those need `SharedArrayBuffer`, which a browser only allows on pages served with cross-origin-isolation headers (COOP/COEP). A single-threaded build works on any static host.

## UCI usage

- Handshake: `uci`, wait for `uciok`, read the option list, then `isready`/`readyok`. A timeout here produces an "engine did not respond" error that mentions the engine files and WebAssembly.
- Per search: `stop` (if one is running) and wait for its `bestmove`, then `isready`/`readyok`, then `setoption` for anything that changed, `position fen … [moves …]`, `go depth N`, `go movetime N`, or `go wtime … btime … winc … binc …`.
- Parsed from `info`: depth, selective depth, `multipv`, `score cp|mate` (with the `lowerbound`/`upperbound` flag), nodes, nps, time, `pv`. A bound-flagged line never replaces a line already held at the same or a greater depth, so the displayed score does not flicker.
- Options the app sets: `Hash` (Settings offers 16, 32, 64, 128 or 256 MB; default 32), `MultiPV`, `UCI_LimitStrength`, `UCI_Elo` and `Skill Level`. `Threads` is never set, because every shipped build is single-threaded. An option the engine does not report is skipped and noted, not fatal.

## One search at a time

The engine controller allows one search at a time per engine. A new request supersedes the old one: it sends `stop`, waits for the old `bestmove`, re-synchronises with `isready`, and only then starts the new `position`/`go`. A late `bestmove` therefore cannot be attributed to the wrong request.

The app runs four separate engine instances, so one use never starves another: **live** (the analysis board), **batch** (game analysis queue), and **A** and **B** (the two sides of play and engine matches). Each is created on first use. Settings shows their status and has a Restart button.

## Evaluation perspective

**Every score the engine module returns is from White's point of view**: positive means better for White, whoever is to move. UCI engines report scores for the side to move; the controller converts when it parses `info`. Storage, the cache, the graph and the classifier all use White's view; the interface converts to the mover's view (`forMover`) only where it shows or compares a result "for you". Mate scores are kept as `mate N` (positive: White mates) and are never mixed into centipawn arithmetic except through a capped value (±1000 cp) for average centipawn loss.

## Progress, cancel, watchdog

- Search progress (depth, nodes per second, lines) is passed to the interface as it arrives.
- A search can be cancelled by an `AbortSignal`; the controller stops it cleanly and the engine stays usable.
- A watchdog checks that a running search is producing output. If it stalls, or the worker reports an error, the engine is marked dead, the interface says so, and the next request restarts it transparently.
- Positions are checked for legality before they are sent. An illegal FEN produces a readable message and never reaches the engine.

## Evaluation cache

Evaluations are stored in IndexedDB (`evalCache`) under the key `<position>|<engine name>#<flavour>`. The position part ignores the move counters, so transpositions share an entry. A stored result is reused only when it was searched **at least as deep** and with **at least as many lines** as the new request asks for. Because the flavour is in the key, switching the engine build never serves results computed by another build. A result is overwritten by a deeper or wider one. Settings can clear the cache, and it is pruned to a size cap. These rules are unit-tested with a stand-in engine.

## Opponent strength

Used by Play, the Endgame Lab and Match Lab:

| Mode | UCI settings |
| --- | --- |
| Full | No limit. |
| Elo | `UCI_LimitStrength = true`, `UCI_Elo` between 1320 and 3190. |
| Skill | `UCI_LimitStrength = false`, `Skill Level` 0 to 20. |
| Beginner | `Skill Level 0` with a very shallow search (depth cap 2) and a short think time. |

Each level can also carry a depth cap and a think time in milliseconds, or play from a real clock. The preset names (Beginner, Casual, Club player, Strong club, Master, Full strength) are labels for particular settings, shown with the exact UCI values underneath. **`UCI_Elo` is on the Stockfish developers' scale, not Chess.com's, Lichess's or FIDE's.** See [LIMITATIONS.md](LIMITATIONS.md).

## Analysis settings

Quick (depth 10, 2 lines), Standard (depth 14, 2 lines, the default) and Deep (depth 18, 3 lines) apply to full-game analysis; the analysis board's live panel has its own depth (default 20) and line count (default 3). Every saved analysis records the depth and engine it came from.

## Human-like opponent

`src/lib/engine/human.ts`, selected as *Human-like* in the opponent settings (or the two *Human-like* levels). Stockfish runs at full strength with MultiPV 5 and the usual think time; the app then chooses one of the five moves at random. For a *carefulness* `c` from 0 to 20, with `t = 1 − c/20`, the temperature is `0.4 + 9.6·t²` win-chance points and the largest loss it will accept is `3 + 27·t` points. Each candidate's weight is `exp(−loss / temperature)`, where loss is the win chance given up compared with the engine's first choice. At 20 it plays the first choice almost always; at 0 it often takes second or third choices that give up a few points, but never a move that loses more than 30. This produces plausible, graded mistakes instead of the random-looking blunders of the built-in `Skill Level` limiter. It is not calibrated to any rating, and the app does not claim one. Games against it are saved with the header `Human-like opponent, carefulness N`.
