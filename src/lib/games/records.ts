// Build and describe stored games.
import type { Color, GameRecord, GameResult, GameSource, UserOutcome } from '../types';
import { hashString, parsePgn, parseTimeControl, pgnDateToIso, timeClassOf } from '../chess/rules';

export function outcomeFor(result: GameResult, color: Color): UserOutcome | undefined {
  if (result === '1/2-1/2') return 'draw';
  if (result === '1-0') return color === 'w' ? 'win' : 'loss';
  if (result === '0-1') return color === 'b' ? 'win' : 'loss';
  return undefined;
}

/** Fingerprint identical games across sources: same players + same move list. */
export function fingerprintOf(white: string, black: string, ucis: string[]): string {
  return `fp:${hashString(`${white.toLowerCase()}|${black.toLowerCase()}`)}${hashString(ucis.join(' '))}${ucis.length.toString(36)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Text for a PGN date that is only partly known ("1858.??.??" gives "1858"), or "Date unknown". Empty when the date is complete. */
export function partialDateLabel(h: Record<string, string>): string {
  const raw = h['UTCDate'] ?? h['Date'] ?? '';
  const m = /^(\d{4}|\?\?\?\?)[.-](\d{2}|\?\?)[.-](\d{2}|\?\?)/.exec(raw);
  if (!m || m[1] === '????') return 'Date unknown';
  if (m[2] === '??') return m[1]!;
  if (m[3] === '??') return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
  return '';
}

function endTimeFrom(h: Record<string, string>): number {
  const d = (h['EndDate'] ?? h['UTCDate'] ?? h['Date'] ?? '').replace(/\./g, '-');
  const t = h['EndTime'] ?? h['UTCTime'] ?? '00:00:00';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d) && /^\d{1,2}:\d{2}:\d{2}$/.test(t)) {
    const ms = Date.parse(`${d}T${t.padStart(8, '0')}Z`);
    if (Number.isFinite(ms)) return ms;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const ms = Date.parse(`${d}T00:00:00Z`);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

export interface FromPgnOptions {
  source: GameSource;
  userName?: string;
  id?: string;
  url?: string;
  /** Overrides applied last (for example Chess.com ratings or time class). */
  extra?: Partial<GameRecord>;
  now?: number;
}

export function gameFromPgn(pgn: string, opts: FromPgnOptions): GameRecord {
  const parsed = parsePgn(pgn);
  const h = parsed.headers;
  const white = h['White'] && h['White'] !== '?' ? h['White'] : 'White';
  const black = h['Black'] && h['Black'] !== '?' ? h['Black'] : 'Black';
  const ucis = parsed.moves.map((m) => m.uci);
  const fingerprint = fingerprintOf(white, black, ucis);
  const tc = h['TimeControl'];
  const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  const userKey = opts.userName?.trim().toLowerCase();
  const userColor: Color | undefined = userKey ? (white.toLowerCase() === userKey ? 'w' : black.toLowerCase() === userKey ? 'b' : undefined) : undefined;
  const endTime = endTimeFrom(h) || (opts.now ?? Date.now());
  const record: GameRecord = {
    id: opts.id ?? `${opts.source}:${fingerprint}`,
    source: opts.source,
    pgn,
    white,
    black,
    whiteElo: num(h['WhiteElo']),
    blackElo: num(h['BlackElo']),
    result: parsed.result,
    termination: h['Termination'],
    date: pgnDateToIso(h['UTCDate'] ?? h['Date']) || new Date(endTime).toISOString().slice(0, 10),
    ...(partialDateLabel(h) ? { dateLabel: partialDateLabel(h) } : {}),
    endTime,
    timeControl: tc,
    timeClass: timeClassOf(tc),
    rules: h['Variant']?.toLowerCase() ?? 'chess',
    url: opts.url ?? h['Link'],
    eco: h['ECO'],
    opening: h['Opening'],
    plies: parsed.moves.length,
    startFen: parsed.startFen === parsed.fens[0] && h['FEN'] ? h['FEN'] : undefined,
    tags: [],
    addedAt: opts.now ?? Date.now(),
    analyzed: 0,
    fingerprint,
  };
  if (userColor) {
    record.userColor = userColor;
    record.userName = userColor === 'w' ? white : black;
    record.opponent = userColor === 'w' ? black : white;
    record.userRating = userColor === 'w' ? record.whiteElo : record.blackElo;
    record.opponentRating = userColor === 'w' ? record.blackElo : record.whiteElo;
    record.userOutcome = outcomeFor(record.result, userColor);
  }
  return { ...record, ...opts.extra };
}

export function incrementSeconds(g: Pick<GameRecord, 'timeControl'>): number {
  return parseTimeControl(g.timeControl)?.inc ?? 0;
}

export function playerLabel(g: GameRecord, color: Color): string {
  const name = color === 'w' ? g.white : g.black;
  const elo = color === 'w' ? g.whiteElo : g.blackElo;
  return elo ? `${name} (${elo})` : name;
}

export function resultLabel(g: GameRecord): string {
  if (g.userOutcome === 'win') return 'Won';
  if (g.userOutcome === 'loss') return 'Lost';
  if (g.userOutcome === 'draw') return 'Drew';
  return g.result === '1/2-1/2' ? '½-½' : g.result;
}

/** Games that count towards personal statistics (demo games are excluded unless asked). */
export function isPersonal(g: GameRecord, includeDemo = false): boolean {
  if (g.source === 'demo') return includeDemo;
  return g.userColor !== undefined;
}
