# Third-party notices

Kibitz is licensed under the GNU General Public License v3.0 or later (see `LICENSE`). It includes or depends on the following. Licences were read from each package's own `package.json` in the installed versions.

## Shipped with the app (in `dist/`)

| Component | Version | Licence | Notes |
| --- | --- | --- | --- |
| **Stockfish.js** (Chess.com, LLC), built from **Stockfish** (T. Romstad, M. Costalba, J. Kiiski, G. Linscott and contributors) | 19.0.1 | **GPL-3.0** | The engine, as WebAssembly and asm.js, copied from the `stockfish` npm package into `/engines/` together with its licence text (`LICENSE-stockfish-GPL-3.0.txt`) and a notice. Sources: https://github.com/nmrugg/stockfish.js and https://github.com/official-stockfish/Stockfish. Because the app distributes it, the app as a whole is distributed under GPL-3.0-or-later and the corresponding source must be offered to those who receive it. |
| **chess.js** | 1.4.0 | BSD-2-Clause | Rules, move generation, PGN and FEN. |
| **React**, **React DOM** | 19.3.0 | MIT | |
| **React Router** (`react-router-dom`) | 7.18.4 | MIT | |
| **react-chessboard** | 5.12.1 | MIT | The board. Its dependency **@dnd-kit/core** 6.3.1 is MIT. |
| **idb** | 8.0.4 | ISC | IndexedDB wrapper. |
| **Bricolage Grotesque** (`@fontsource-variable/bricolage-grotesque`) | 5.3.0 | SIL OFL 1.1 | Display font, bundled. |
| **IBM Plex Sans** and **IBM Plex Mono** (`@fontsource/ibm-plex-sans`, `@fontsource/ibm-plex-mono`) | 5.3.0 | SIL OFL 1.1 | Text and monospace fonts, bundled. |
| **Opening names** (`src/data/openings.json`) | generated | CC0 1.0 (public domain) | Built from https://github.com/lichess-org/chess-openings by `scripts/build-openings.mjs`. |

## Shipped only with the desktop app

| Component | Version | Licence | Notes |
| --- | --- | --- | --- |
| **Electron** | 45.0.0 | MIT | Includes **Chromium** and other components under their own licences; the full list is shipped in the app as `LICENSES.chromium.html` and `LICENSE.electron.txt`. |
| App icons (`public/icons`) | | Same as the app (GPL-3.0-or-later) | An original drawing made for this project. |

## Formulas taken from published work

- The centipawn-to-win-chance curve and the per-move accuracy curve are those published by Lichess (https://lichess.org/page/accuracy and its documentation). Only the published formulas are used; no Lichess code or data is included.

## Development tools (not shipped)

Vite, Vitest, TypeScript, `electron-builder` (MIT, builds the desktop packages), ESLint, `typescript-eslint`, Playwright (`playwright-core`), `axe-core` (MPL-2.0, used only by the browser tests), `fake-indexeddb` and jsdom, each under its own licence.

## Data sources

Chess.com's Published-Data API (https://www.chess.com/news/view/published-data-api) is queried from the user's browser on request. Kibitz is not affiliated with or endorsed by Chess.com, Lichess or the Stockfish project. "Chess.com" and "Lichess" are used only to name the services.
