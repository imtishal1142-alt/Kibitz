// These tests use a scripted `fetch` and FIXTURES that follow the response shapes documented for
// the Chess.com Published-Data API. They verify our client/sync logic (parsing, retries, rate
// limits, incremental sync, de-duplication, persistence). They do NOT prove that api.chess.com is
// reachable from your network: see README "Verification status".
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChessComClient, ChessComError, validateUsername } from '../src/lib/chesscom/client';
import type { RawGame } from '../src/lib/chesscom/client';
import { mapChessComGame } from '../src/lib/chesscom/mapper';
import { syncChessCom } from '../src/lib/chesscom/sync';
import { buildPgn } from '../src/lib/chess/rules';
import { gameFromPgn } from '../src/lib/games/records';
import { clearAllData } from '../src/lib/storage/backup';
import { closeDb } from '../src/lib/storage/db';
import { addGames, getArchiveMeta, getProfile, listGames } from '../src/lib/storage/repos';

const ME = 'TestUser';
const SCHOLAR = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'];
const RUY = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'];
const QGD = ['d2d4', 'd7d5', 'c2c4', 'e7e6'];
const SICILIAN = ['e2e4', 'c7c5', 'g1f3', 'd7d6'];
const ENGLISH = ['g1f3', 'g8f6', 'c2c4', 'g7g6'];
const LONDON = ['d2d4', 'g8f6', 'c1f4', 'e7e6'];

interface Fx {
  id: string;
  ucis: string[];
  me: 'white' | 'black';
  myResult: string;
  oppResult: string;
  end: number; // epoch seconds
  tc?: string;
  cls?: string;
  rules?: string;
  opp?: string;
  noPgn?: boolean;
}

function raw(fx: Fx): RawGame {
  const opp = fx.opp ?? 'rival';
  const white = fx.me === 'white' ? ME : opp;
  const black = fx.me === 'white' ? opp : ME;
  const whiteResult = fx.me === 'white' ? fx.myResult : fx.oppResult;
  const blackResult = fx.me === 'white' ? fx.oppResult : fx.myResult;
  const result = whiteResult === 'win' ? '1-0' : blackResult === 'win' ? '0-1' : whiteResult === 'checkmated' || whiteResult === 'resigned' ? '0-1' : '1/2-1/2';
  const d = new Date(fx.end * 1000);
  const pgn = buildPgn({
    headers: {
      Event: 'Live Chess',
      Site: 'Chess.com',
      White: white,
      Black: black,
      WhiteElo: '1500',
      BlackElo: '1600',
      TimeControl: fx.tc ?? '600',
      UTCDate: d.toISOString().slice(0, 10).replace(/-/g, '.'),
      UTCTime: d.toISOString().slice(11, 19),
      Link: `https://www.chess.com/game/live/${fx.id}`,
    },
    ucis: fx.ucis,
    result: result as '1-0' | '0-1' | '1/2-1/2',
  });
  return {
    url: `https://www.chess.com/game/live/${fx.id}`,
    pgn: fx.noPgn ? undefined : pgn,
    time_control: fx.tc ?? '600',
    end_time: fx.end,
    rated: true,
    time_class: fx.cls ?? 'rapid',
    rules: fx.rules ?? 'chess',
    uuid: `uuid-${fx.id}`,
    accuracies: { white: 80.5, black: 70.2 },
    white: { rating: 1500, result: whiteResult, username: white, uuid: 'w' },
    black: { rating: 1600, result: blackResult, username: black, uuid: 'b' },
  };
}

const t = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d, 12) / 1000);

interface World {
  profile?: object | null;
  stats?: object | null;
  archives: string[];
  months: Record<string, RawGame[] | ((n: number) => Response)>;
}

function archiveUrl(y: number, m: number) {
  return `https://api.chess.com/pub/player/testuser/games/${y}/${String(m).padStart(2, '0')}`;
}

function makeFetch(world: World, log: string[] = []) {
  let inFlight = 0;
  let maxInFlight = 0;
  const calls: Record<string, number> = {};
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await Promise.resolve();
    inFlight--;
    calls[url] = (calls[url] ?? 0) + 1;
    log.push(url);
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers });
    if (url.endsWith('/player/testuser')) return world.profile === null ? json({}, 404) : json(world.profile ?? { username: 'TestUser', url: 'https://www.chess.com/member/TestUser', avatar: 'https://images.chesscomfiles.com/x.png', joined: 1500000000, country: 'https://api.chess.com/pub/country/PK' });
    if (url.endsWith('/player/testuser/stats')) return world.stats === null ? json({}, 404) : json(world.stats ?? { chess_rapid: { last: { rating: 1512, date: 1700000000, rd: 60 }, best: { rating: 1600, date: 1690000000 }, record: { win: 10, loss: 8, draw: 2 } }, tactics: { highest: { rating: 2000 } } });
    if (url.endsWith('/games/archives')) return json({ archives: world.archives });
    const month = world.months[url];
    if (month === undefined) return json({}, 404);
    if (typeof month === 'function') return month(calls[url] ?? 1);
    return json({ games: month });
  }) as typeof fetch;
  return { fn, calls, maxInFlight: () => maxInFlight };
}

const fastClient = (fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof ChessComClient>[0]> = {}) =>
  new ChessComClient({ fetchImpl, sleep: async () => undefined, minIntervalMs: 0, random: () => 0, ...extra });

beforeEach(async () => {
  await clearAllData();
});

describe('username validation', () => {
  it('accepts valid names and rejects bad ones with a reason', () => {
    expect(validateUsername(' @TestUser ')).toEqual({ ok: true, username: 'TestUser' });
    expect(validateUsername('ab')).toMatchObject({ ok: false });
    expect(validateUsername('a'.repeat(26))).toMatchObject({ ok: false });
    expect(validateUsername('bad name!')).toMatchObject({ ok: false });
    expect(validateUsername('')).toMatchObject({ ok: false });
    expect(validateUsername('good_name-1')).toMatchObject({ ok: true });
  });
});

describe('ChessComClient', () => {
  it('maps 404 to not-found and does not retry', async () => {
    const w = makeFetch({ profile: null, archives: [], months: {} });
    const c = fastClient(w.fn);
    await expect(c.getProfile('testuser')).rejects.toMatchObject({ code: 'not-found' });
    expect(c.requests).toBe(1);
  });

  it('retries 429 honouring Retry-After, then succeeds', async () => {
    const sleeps: number[] = [];
    let n = 0;
    const f = (async () => {
      n++;
      return n === 1 ? new Response('{}', { status: 429, headers: { 'Retry-After': '3' } }) : new Response(JSON.stringify({ ok: 1 }), { status: 200 });
    }) as typeof fetch;
    const c = new ChessComClient({ fetchImpl: f, sleep: async (ms) => void sleeps.push(ms), minIntervalMs: 0, random: () => 0 });
    expect(await c.getJson('/x')).toEqual({ ok: 1 });
    expect(sleeps).toContain(3000);
    expect(c.requests).toBe(2);
  });

  it('gives up after the retry budget with a rate-limit error', async () => {
    const f = (async () => new Response('{}', { status: 429 })) as typeof fetch;
    const c = fastClient(f, { maxRetries: 2 });
    await expect(c.getJson('/x')).rejects.toMatchObject({ code: 'rate-limited' });
    expect(c.requests).toBe(3);
  });

  it('reports server errors and network failures distinctly', async () => {
    const c1 = fastClient((async () => new Response('', { status: 503 })) as typeof fetch, { maxRetries: 1 });
    await expect(c1.getJson('/x')).rejects.toMatchObject({ code: 'server' });
    const c2 = fastClient((async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch, { maxRetries: 1 });
    await expect(c2.getJson('/x')).rejects.toMatchObject({ code: 'network' });
  });

  it('fails fast when the connection is blocked: at most two quick retries, however large the retry budget', async () => {
    const c = fastClient((async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch, { maxRetries: 4 });
    await expect(c.getJson('/x')).rejects.toMatchObject({ code: 'network' });
    expect(c.requests).toBe(3);
  });

  it('can be cancelled', async () => {
    const ac = new AbortController();
    const c = fastClient((async () => new Response('{}', { status: 200 })) as typeof fetch);
    ac.abort();
    await expect(c.getJson('/x', ac.signal)).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('never has more than one request in flight', async () => {
    const world: World = { archives: [], months: {} };
    const w = makeFetch(world);
    const c = fastClient(w.fn);
    await Promise.all([c.getProfile('testuser'), c.getStats('testuser'), c.getArchives('testuser')]);
    expect(c.requests).toBe(3);
    expect(w.maxInFlight()).toBe(1);
  });
});

describe('game mapping', () => {
  it('maps fields, colour, outcome and time class', () => {
    const r = mapChessComGame(raw({ id: '1', ucis: SCHOLAR, me: 'white', myResult: 'win', oppResult: 'checkmated', end: t(2024, 1, 10), cls: 'blitz', tc: '180+2' }), ME);
    const g = r.game!;
    expect(g.id).toBe('chesscom:uuid-1');
    expect(g).toMatchObject({ source: 'chesscom', userColor: 'w', userOutcome: 'win', timeClass: 'blitz', timeControl: '180+2', rated: true, opponent: 'rival', userRating: 1500, opponentRating: 1600, plies: 7, result: '1-0' });
    expect(g.termination).toBe('Black lost by checkmate');
    expect(g.chesscomAccuracies).toEqual({ white: 80.5, black: 70.2 });
    expect(g.endTime).toBe(t(2024, 1, 10) * 1000);
  });
  it('identifies the user case-insensitively and handles Black', () => {
    const g = mapChessComGame(raw({ id: '2', ucis: SCHOLAR, me: 'black', myResult: 'checkmated', oppResult: 'win', end: t(2024, 1, 11) }), 'testuser').game!;
    expect(g.userColor).toBe('b');
    expect(g.userOutcome).toBe('loss');
    expect(g.userRating).toBe(1600);
  });
  it('skips variants, missing PGNs and unparsable PGNs without throwing', () => {
    expect(mapChessComGame(raw({ id: '3', ucis: RUY, me: 'white', myResult: 'win', oppResult: 'resigned', end: 1, rules: 'chess960' }), ME).skipped).toBe('variant');
    expect(mapChessComGame(raw({ id: '4', ucis: RUY, me: 'white', myResult: 'win', oppResult: 'resigned', end: 1, noPgn: true }), ME).skipped).toBe('no-pgn');
    const bad = { ...raw({ id: '5', ucis: RUY, me: 'white', myResult: 'win', oppResult: 'resigned', end: 1 }), pgn: '1. e4 e5 2. Ke5' };
    expect(mapChessComGame(bad, ME).skipped).toBe('bad-pgn');
  });
});

describe('syncChessCom', () => {
  const jan = [raw({ id: '11', ucis: SCHOLAR, me: 'white', myResult: 'win', oppResult: 'checkmated', end: t(2024, 1, 5), opp: 'a' }), raw({ id: '12', ucis: RUY, me: 'black', myResult: 'win', oppResult: 'resigned', end: t(2024, 1, 20), opp: 'b' })];
  const feb = [raw({ id: '21', ucis: QGD, me: 'white', myResult: 'agreed', oppResult: 'agreed', end: t(2024, 2, 3), opp: 'c' }), raw({ id: '22', ucis: SICILIAN, me: 'white', myResult: 'resigned', oppResult: 'win', end: t(2024, 2, 9), opp: 'd' })];
  const mar = [raw({ id: '31', ucis: ENGLISH, me: 'black', myResult: 'win', oppResult: 'timeout', end: t(2024, 3, 2), opp: 'e', cls: 'bullet', tc: '60' })];
  const now = () => Date.UTC(2024, 2, 15);
  // Fresh copies per call: tests mutate their own world, never the shared fixtures.
  const world = (): World => ({ archives: [archiveUrl(2024, 1), archiveUrl(2024, 2), archiveUrl(2024, 3)], months: { [archiveUrl(2024, 1)]: [...jan], [archiveUrl(2024, 2)]: [...feb], [archiveUrl(2024, 3)]: [...mar] } });

  it('imports all archives newest-first, saves the profile with date and source, and persists everything', async () => {
    const log: string[] = [];
    const w = makeFetch(world(), log);
    const phases: string[] = [];
    const res = await syncChessCom({ username: ME, client: fastClient(w.fn), now, onProgress: (p) => p.month && phases.push(p.month) });
    expect(res).toMatchObject({ archivesTotal: 3, archivesFetched: 3, gamesSeen: 5, added: 5, duplicates: 0, cancelled: false });
    expect(log.filter((u) => /games\/\d{4}\/\d{2}$/.test(u))).toEqual([archiveUrl(2024, 3), archiveUrl(2024, 2), archiveUrl(2024, 1)]);
    expect(phases[0]).toBe('2024-03');
    const profile = await getProfile(ME);
    expect(profile?.source).toBe('https://api.chess.com/pub/player/testuser');
    expect(profile?.fetchedAt).toBe(now());
    expect(profile?.lastSync).toBe(now());
    expect(profile?.stats['chess_rapid']?.last?.rating).toBe(1512);
    expect(profile?.profile.country).toBe('PK');
    // survives a "page refresh" (connection closed and reopened)
    await closeDb();
    const games = await listGames();
    expect(games).toHaveLength(5);
    expect(games[0]!.id).toBe('chesscom:uuid-31'); // newest first
    expect((await getArchiveMeta(archiveUrl(2024, 1)))?.final).toBe(true);
    expect((await getArchiveMeta(archiveUrl(2024, 3)))?.final).toBe(false);
  });

  it('syncs incrementally: finished months are not requested again and only new games are added', async () => {
    const w1 = makeFetch(world());
    await syncChessCom({ username: ME, client: fastClient(w1.fn), now });
    const w2world = world();
    (w2world.months[archiveUrl(2024, 3)] as RawGame[]).push(raw({ id: '32', ucis: LONDON, me: 'white', myResult: 'win', oppResult: 'resigned', end: t(2024, 3, 12), opp: 'f' }));
    const w2 = makeFetch(w2world);
    const res = await syncChessCom({ username: ME, client: fastClient(w2.fn), now });
    expect(res).toMatchObject({ added: 1, duplicates: 1, archivesFetched: 1, archivesSkippedCached: 2 });
    expect(w2.calls[archiveUrl(2024, 1)]).toBeUndefined();
    expect(w2.calls[archiveUrl(2024, 2)]).toBeUndefined();
    expect(w2.calls[archiveUrl(2024, 3)]).toBe(1);
    expect(await listGames()).toHaveLength(6);
  });

  it('re-downloads everything with force and still creates no duplicates', async () => {
    const w1 = makeFetch(world());
    await syncChessCom({ username: ME, client: fastClient(w1.fn), now });
    const w2 = makeFetch(world());
    const res = await syncChessCom({ username: ME, client: fastClient(w2.fn), now, force: true });
    expect(res).toMatchObject({ added: 0, duplicates: 5, archivesFetched: 3 });
    expect(await listGames()).toHaveLength(5);
  });

  it('prevents duplicates across sources (same game imported later as PGN)', async () => {
    const w = makeFetch(world());
    await syncChessCom({ username: ME, client: fastClient(w.fn), now });
    const first = raw({ id: '11', ucis: SCHOLAR, me: 'white', myResult: 'win', oppResult: 'checkmated', end: t(2024, 1, 5), opp: 'a' });
    const asPgn = gameFromPgn(first.pgn!, { source: 'pgn', userName: ME });
    const res = await addGames([asPgn]);
    expect(res).toMatchObject({ added: 0, duplicates: 1 });
  });

  it('keeps finished months when the rate limit stops the import, and resumes later', async () => {
    const w0 = world();
    w0.months[archiveUrl(2024, 2)] = () => new Response('{}', { status: 429 });
    const w1 = makeFetch(w0);
    const res = await syncChessCom({ username: ME, client: fastClient(w1.fn, { maxRetries: 1 }), now });
    expect(res.stoppedEarly).toBe('rate-limited');
    expect(res.errors.join(' ')).toMatch(/slow down/);
    expect(res.added).toBe(1); // March was saved before February failed
    expect((await getProfile(ME))?.lastSync).toBeUndefined();
    const w2 = makeFetch(world());
    const res2 = await syncChessCom({ username: ME, client: fastClient(w2.fn), now });
    expect(res2.stoppedEarly).toBeUndefined();
    expect(await listGames()).toHaveLength(5);
  });

  it('can be cancelled and keeps what was already saved', async () => {
    const ac = new AbortController();
    const w = makeFetch(world());
    const res = await syncChessCom({ username: ME, client: fastClient(w.fn), now, signal: ac.signal, onProgress: (p) => p.phase === 'games' && p.archiveIndex === 1 && ac.abort() });
    expect(res.cancelled).toBe(true);
    expect(res.added).toBe(1);
    expect(await listGames()).toHaveLength(1);
  });

  it('handles unknown users, empty histories, missing stats and invalid usernames', async () => {
    await expect(syncChessCom({ username: ME, client: fastClient(makeFetch({ profile: null, archives: [], months: {} }).fn), now })).rejects.toMatchObject({ code: 'not-found', message: expect.stringMatching(/No Chess.com player named/) });
    const empty = await syncChessCom({ username: ME, client: fastClient(makeFetch({ stats: null, archives: [], months: {} }).fn), now });
    expect(empty).toMatchObject({ archivesTotal: 0, added: 0, errors: [] });
    expect((await getProfile(ME))?.stats).toEqual({});
    await expect(syncChessCom({ username: 'x', client: fastClient(makeFetch({ archives: [], months: {} }).fn) })).rejects.toBeInstanceOf(ChessComError);
  });

  it('counts skipped variants without failing the import', async () => {
    const w = world();
    w.months[archiveUrl(2024, 3)] = [raw({ id: '41', ucis: RUY, me: 'white', myResult: 'win', oppResult: 'resigned', end: t(2024, 3, 3), rules: 'chess960' }), ...mar];
    const res = await syncChessCom({ username: ME, client: fastClient(makeFetch(w).fn), now });
    expect(res.skipped).toEqual({ variant: 1 });
    expect(res.added).toBe(5);
  });
});
