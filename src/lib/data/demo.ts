// A built-in DEMO game so every screen can be explored before anything is imported.
// It is the 1858 "Opera Game" (Paul Morphy vs. the Duke of Brunswick and Count Isouard), a
// public-domain game. It is labelled as a demo everywhere it appears and is excluded from your
// statistics, weaknesses and strength estimate unless you opt in under Settings.
import { gameFromPgn } from '../games/records';
import type { GameRecord } from '../types';

export const DEMO_PGN = `[Event "DEMO: Opera Game (built-in sample, not your game)"]
[Site "Paris, France"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]
[ECO "C41"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

export const DEMO_ID = 'demo-opera-game';

export function demoGame(now = Date.now()): GameRecord {
  const g = gameFromPgn(DEMO_PGN, { source: 'demo', userName: 'Paul Morphy', now });
  return { ...g, id: DEMO_ID, tags: [...new Set([...g.tags, 'demo'])], notes: 'Built-in sample game for exploring the app. Not your game; excluded from your statistics by default.' };
}
