// Convert Chess.com API objects into our stored records.
import type { ChessComProfile, ChessComRating, GameRecord, TimeClass } from '../types';
import { gameFromPgn } from '../games/records';
import type { RawGame, RawProfile, RawStats } from './client';

export type SkipReason = 'variant' | 'no-pgn' | 'bad-pgn' | 'no-username';

export interface MapResult {
  game?: GameRecord;
  skipped?: SkipReason;
  detail?: string;
}

const TIME_CLASSES: Record<string, TimeClass> = { bullet: 'bullet', blitz: 'blitz', rapid: 'rapid', daily: 'daily' };

const RESULT_TEXT: Record<string, string> = {
  checkmated: 'checkmate',
  resigned: 'resignation',
  timeout: 'timeout',
  abandoned: 'abandonment',
  agreed: 'agreement',
  repetition: 'repetition',
  stalemate: 'stalemate',
  insufficient: 'insufficient material',
  '50move': 'the 50-move rule',
  timevsinsufficient: 'timeout vs insufficient material',
};

export function describeTermination(white?: string, black?: string): string | undefined {
  const w = white ?? '';
  const b = black ?? '';
  if (w === 'win') return `Black lost by ${RESULT_TEXT[b] ?? b}`;
  if (b === 'win') return `White lost by ${RESULT_TEXT[w] ?? w}`;
  if (w && w === b) return `Draw by ${RESULT_TEXT[w] ?? w}`;
  return undefined;
}

export function gameIdOf(raw: RawGame): string | null {
  if (raw.uuid) return `chesscom:${raw.uuid}`;
  const m = /\/(?:game\/)?(?:live|daily)?\/?(\d+)\/?$/.exec(raw.url ?? '');
  return m ? `chesscom:${m[1]}` : null;
}

export function mapChessComGame(raw: RawGame, username: string): MapResult {
  if (!username) return { skipped: 'no-username' };
  if (raw.rules && raw.rules !== 'chess') return { skipped: 'variant', detail: raw.rules };
  if (!raw.pgn) return { skipped: 'no-pgn' };
  const id = gameIdOf(raw) ?? undefined;
  try {
    const timeClass = raw.time_class ? TIME_CLASSES[raw.time_class] : undefined;
    const game = gameFromPgn(raw.pgn, {
      source: 'chesscom',
      userName: username,
      id,
      url: raw.url,
      extra: {
        ...(timeClass ? { timeClass } : {}),
        ...(raw.time_control ? { timeControl: raw.time_control } : {}),
        ...(raw.end_time ? { endTime: raw.end_time * 1000, date: new Date(raw.end_time * 1000).toISOString().slice(0, 10) } : {}),
        rated: raw.rated,
        rules: 'chess',
        whiteElo: raw.white?.rating,
        blackElo: raw.black?.rating,
        termination: describeTermination(raw.white?.result, raw.black?.result),
        chesscomResults: { white: raw.white?.result ?? '', black: raw.black?.result ?? '' },
        chesscomAccuracies: raw.accuracies ? { white: raw.accuracies.white, black: raw.accuracies.black } : undefined,
      },
    });
    // Prefer the API's usernames over PGN headers for deciding which side is "me".
    const me = username.toLowerCase();
    const apiColor = raw.white?.username?.toLowerCase() === me ? 'w' : raw.black?.username?.toLowerCase() === me ? 'b' : undefined;
    if (apiColor && apiColor !== game.userColor) {
      const { userColor: _c, userName: _n, opponent: _o, userRating: _r, opponentRating: _or, userOutcome: _u, ...rest } = game;
      void [_c, _n, _o, _r, _or, _u];
      return { game: applyUser(rest as GameRecord, apiColor) };
    }
    return { game };
  } catch (e) {
    return { skipped: 'bad-pgn', detail: e instanceof Error ? e.message : String(e) };
  }
}

function applyUser(g: GameRecord, color: 'w' | 'b'): GameRecord {
  const opp = color === 'w' ? g.black : g.white;
  const me = color === 'w' ? g.white : g.black;
  const outcome = g.result === '1/2-1/2' ? 'draw' : (g.result === '1-0') === (color === 'w') && g.result !== '*' ? 'win' : g.result === '*' ? undefined : 'loss';
  return {
    ...g,
    userColor: color,
    userName: me,
    opponent: opp,
    userRating: color === 'w' ? g.whiteElo : g.blackElo,
    opponentRating: color === 'w' ? g.blackElo : g.whiteElo,
    userOutcome: outcome,
  };
}

const MODES = ['chess_rapid', 'chess_blitz', 'chess_bullet', 'chess_daily'] as const;

export function mapStats(raw: RawStats | undefined): Record<string, ChessComRating> {
  const out: Record<string, ChessComRating> = {};
  if (!raw) return out;
  for (const k of MODES) {
    const v = raw[k] as ChessComRating | undefined;
    if (v && typeof v === 'object' && (v.last || v.best || v.record)) {
      out[k] = { last: v.last, best: v.best, record: v.record ? { win: v.record.win, loss: v.record.loss, draw: v.record.draw } : undefined };
    }
  }
  return out;
}

export function mapProfile(username: string, raw: RawProfile, stats: RawStats | undefined, fetchedAt: number): ChessComProfile {
  const country = raw.country ? raw.country.split('/').pop() : undefined;
  return {
    username: (raw.username ?? username).toLowerCase(),
    fetchedAt,
    source: `https://api.chess.com/pub/player/${username.toLowerCase()}`,
    profile: {
      username: raw.username ?? username,
      name: raw.name,
      title: raw.title,
      avatar: raw.avatar,
      url: raw.url,
      country,
      location: raw.location,
      joined: raw.joined ? raw.joined * 1000 : undefined,
      lastOnline: raw.last_online ? raw.last_online * 1000 : undefined,
      followers: raw.followers,
      status: raw.status,
      isStreamer: raw.is_streamer,
      league: raw.league,
    },
    stats: mapStats(stats),
  };
}

/** Month label like "2024-03" from an archive URL. */
export function archiveMonth(url: string): { year: number; month: number } | null {
  const m = /\/games\/(\d{4})\/(\d{2})\/?$/.exec(url);
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
}
