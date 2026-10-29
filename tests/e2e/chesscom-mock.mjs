// A MOCK of the Chess.com Published-Data API, used only by the end-to-end tests (the sandbox the app was built in
// cannot reach api.chess.com). It follows the documented response shapes: player profile, stats, archive list and
// monthly archives. Passing these tests proves the app handles those shapes; it does NOT prove Chess.com's live service.
const USER = 'testplayer';

const game = (n, month, white, black, wr, br, whiteResult, blackResult, moves, endTime) => ({
  url: `https://www.chess.com/game/live/${9000 + n}`,
  uuid: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  time_control: '600',
  time_class: 'rapid',
  rules: 'chess',
  rated: true,
  end_time: endTime,
  white: { username: white, rating: wr, result: whiteResult, uuid: `w${n}` },
  black: { username: black, rating: br, result: blackResult, uuid: `b${n}` },
  pgn: `[Event "Live Chess"]\n[Site "Chess.com"]\n[Date "2026.${month}.10"]\n[Round "-"]\n[White "${white}"]\n[Black "${black}"]\n[Result "${whiteResult === 'win' ? '1-0' : blackResult === 'win' ? '0-1' : '1/2-1/2'}"]\n[WhiteElo "${wr}"]\n[BlackElo "${br}"]\n[TimeControl "600"]\n[EndTime "10:00:00 PDT"]\n[Termination "${white} won by resignation"]\n\n${moves} ${whiteResult === 'win' ? '1-0' : blackResult === 'win' ? '0-1' : '1/2-1/2'}`,
});

export const ARCHIVE = {
  '2026/09': [
    game(1, '09', USER, 'rival_one', 1490, 1530, 'win', 'resigned', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O', 1788000000),
    game(2, '09', 'rival_two', USER, 1480, 1500, 'win', 'checkmated', '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 Nbd7 7. Rc1 c6 8. Bd3 dxc4', 1788100000),
  ],
  '2026/10': [
    game(3, '10', USER, 'rival_three', 1510, 1555, 'resigned', 'win', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7', 1790000000),
    game(4, '10', 'rival_four', USER, 1600, 1520, 'agreed', 'agreed', '1. c4 e5 2. Nc3 Nf6 3. Nf3 Nc6 4. g3 d5 5. cxd5 Nxd5 6. Bg2 Nb6 7. O-O Be7 8. d3 O-O', 1790100000),
  ],
};

/**
 * Install the mock on a Playwright context. `hits` records every request path so tests can check caching.
 * options.failWith: 'network' | 429 | 500 makes the profile request fail; options.delayMs slows every response.
 */
export async function installChessComMock(context, options = {}) {
  const hits = [];
  const state = { failFirst429: options.rate429 ?? 0 };
  await context.route('https://api.chess.com/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    hits.push(path);
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
    if (options.failWith === 'network') return route.abort('failed');
    if (typeof options.failWith === 'number') return route.fulfill({ status: options.failWith, headers: cors, body: '{"message":"error"}' });
    const m = /^\/pub\/player\/([^/]+)(\/.*)?$/.exec(path);
    if (!m) return route.fulfill({ status: 404, headers: cors, body: '{"code":0,"message":"not found"}' });
    const user = decodeURIComponent(m[1]);
    if (user !== USER) return route.fulfill({ status: 404, headers: cors, body: '{"code":0,"message":"User \\"' + user + '\\" not found."}' });
    const rest = m[2] ?? '';
    if (state.failFirst429 > 0 && rest === '') {
      state.failFirst429--;
      return route.fulfill({ status: 429, headers: { ...cors, 'retry-after': '1' }, body: '{"message":"rate limited"}' });
    }
    if (rest === '') {
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ username: USER, name: 'Test Player', player_id: 1, url: `https://www.chess.com/member/${USER}`, country: 'https://api.chess.com/pub/country/PK', joined: 1500000000, last_online: 1790100000, status: 'basic', followers: 3, is_streamer: false }) });
    }
    if (rest === '/stats') {
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ chess_rapid: { last: { rating: 1520, date: 1790100000, rd: 60 }, best: { rating: 1560, date: 1780000000, game: 'https://www.chess.com/game/live/1' }, record: { win: 30, loss: 25, draw: 5 } }, chess_blitz: { last: { rating: 1410, date: 1789000000, rd: 70 }, record: { win: 10, loss: 12, draw: 1 } } }) });
    }
    if (rest === '/games/archives') {
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ archives: Object.keys(ARCHIVE).map((k) => `https://api.chess.com/pub/player/${USER}/games/${k}`) }) });
    }
    const am = /^\/games\/(\d{4}\/\d{2})$/.exec(rest);
    if (am && ARCHIVE[am[1]]) return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ games: ARCHIVE[am[1]] }) });
    return route.fulfill({ status: 404, headers: cors, body: '{"message":"not found"}' });
  });
  return { hits, USER };
}
