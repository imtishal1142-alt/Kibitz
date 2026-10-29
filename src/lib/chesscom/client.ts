// Client for the official Chess.com Published-Data API (https://www.chess.com/news/view/published-data-api).
// Only public, documented, read-only endpoints are used. No credentials are ever requested or sent.
//
// Politeness: requests are strictly serial with a minimum gap between them (Chess.com allows
// unlimited serial access but rate-limits parallel bursts with HTTP 429). 429 and 5xx responses are
// retried with exponential backoff (honouring Retry-After). Browsers do not allow setting a
// User-Agent header, so none is sent.

export type ChessComErrorCode = 'invalid-username' | 'not-found' | 'rate-limited' | 'network' | 'server' | 'cancelled' | 'bad-response';

export class ChessComError extends Error {
  readonly code: ChessComErrorCode;
  readonly status?: number;
  constructor(code: ChessComErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'ChessComError';
    this.code = code;
    this.status = status;
  }
}

export const API_BASE = 'https://api.chess.com/pub';

/** Chess.com usernames: 3-25 characters, letters, digits, underscore or hyphen. */
export function validateUsername(input: string): { ok: true; username: string } | { ok: false; error: string } {
  const u = input.trim().replace(/^@/, '');
  if (!u) return { ok: false, error: 'Enter your Chess.com username.' };
  if (u.length < 3 || u.length > 25) return { ok: false, error: 'Chess.com usernames have 3 to 25 characters.' };
  if (!/^[A-Za-z0-9_-]+$/.test(u)) return { ok: false, error: 'Usernames can only contain letters, numbers, underscores and hyphens (no spaces or @).' };
  return { ok: true, username: u };
}

export interface ClientOptions {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  maxRetries?: number;
  minIntervalMs?: number;
  baseUrl?: string;
  now?: () => number;
  random?: () => number;
}

const abortErr = () => new ChessComError('cancelled', 'The request was cancelled.');

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortErr());
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortErr());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class ChessComClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private readonly maxRetries: number;
  private readonly minInterval: number;
  private readonly base: string;
  private readonly now: () => number;
  private readonly random: () => number;
  private tail: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;
  /** Number of HTTP requests actually issued (useful for tests and the UI). */
  requests = 0;

  constructor(opts: ClientOptions = {}) {
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
    this.sleep = opts.sleep ?? defaultSleep;
    this.maxRetries = opts.maxRetries ?? 4;
    this.minInterval = opts.minIntervalMs ?? 250;
    this.base = opts.baseUrl ?? API_BASE;
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
  }

  /** Serialise all requests through a single queue. */
  getJson<T>(pathOrUrl: string, signal?: AbortSignal): Promise<T> {
    const run = () => this.fetchWithRetry<T>(pathOrUrl, signal);
    const next = this.tail.then(run, run);
    this.tail = next.catch(() => undefined);
    return next;
  }

  private async fetchWithRetry<T>(pathOrUrl: string, signal?: AbortSignal): Promise<T> {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${this.base}${pathOrUrl}`;
    let lastError: ChessComError | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (signal?.aborted) throw abortErr();
      const wait = this.lastRequestAt + this.minInterval - this.now();
      if (wait > 0) await this.sleep(wait, signal);
      this.lastRequestAt = this.now();
      this.requests++;
      let res: Response;
      try {
        res = await this.fetchImpl(url, { signal, headers: { Accept: 'application/json' } });
      } catch (e) {
        if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) throw abortErr();
        lastError = new ChessComError('network', 'Could not reach Chess.com. Check your internet connection (or whether a browser extension or network is blocking api.chess.com) and try again.');
        // A blocked or offline connection rarely fixes itself in seconds, so only two quick retries: failing fast beats a 30-second wait.
        if (attempt >= Math.min(this.maxRetries, 2)) break;
        await this.backoff(attempt, undefined, signal);
        continue;
      }
      if (res.ok) {
        try {
          return (await res.json()) as T;
        } catch {
          throw new ChessComError('bad-response', 'Chess.com returned data that could not be read.', res.status);
        }
      }
      if (res.status === 404 || res.status === 410) {
        throw new ChessComError('not-found', 'Chess.com has no public data at that address.', res.status);
      }
      if (res.status === 429) {
        lastError = new ChessComError('rate-limited', 'Chess.com is asking us to slow down (rate limit). Wait a minute and resume the import: finished months are already saved.', 429);
        if (attempt < this.maxRetries) await this.backoff(attempt, res.headers.get('Retry-After'), signal);
        continue;
      }
      if (res.status >= 500) {
        lastError = new ChessComError('server', `Chess.com had a server problem (HTTP ${res.status}). Try again in a few minutes.`, res.status);
        if (attempt < this.maxRetries) await this.backoff(attempt, res.headers.get('Retry-After'), signal);
        continue;
      }
      throw new ChessComError('bad-response', `Chess.com refused the request (HTTP ${res.status}).`, res.status);
    }
    throw lastError ?? new ChessComError('network', 'The request failed.');
  }

  private async backoff(attempt: number, retryAfter: string | null | undefined, signal?: AbortSignal): Promise<void> {
    let ms = Math.min(30_000, 1000 * 2 ** attempt);
    const ra = retryAfter ? Number(retryAfter) : NaN;
    if (Number.isFinite(ra) && ra > 0) ms = Math.min(60_000, ra * 1000);
    ms += Math.floor(this.random() * 250);
    await this.sleep(ms, signal);
  }

  getProfile(username: string, signal?: AbortSignal): Promise<RawProfile> {
    return this.getJson<RawProfile>(`/player/${encodeURIComponent(username.toLowerCase())}`, signal);
  }
  getStats(username: string, signal?: AbortSignal): Promise<RawStats> {
    return this.getJson<RawStats>(`/player/${encodeURIComponent(username.toLowerCase())}/stats`, signal);
  }
  async getArchives(username: string, signal?: AbortSignal): Promise<string[]> {
    const r = await this.getJson<{ archives?: string[] }>(`/player/${encodeURIComponent(username.toLowerCase())}/games/archives`, signal);
    return Array.isArray(r.archives) ? r.archives : [];
  }
  getMonth(archiveUrl: string, signal?: AbortSignal): Promise<{ games?: RawGame[] }> {
    return this.getJson<{ games?: RawGame[] }>(archiveUrl, signal);
  }
}

/* ----------------------------- raw API shapes ----------------------------- */

export interface RawProfile {
  avatar?: string;
  url?: string;
  name?: string;
  username?: string;
  title?: string;
  followers?: number;
  country?: string;
  location?: string;
  last_online?: number;
  joined?: number;
  status?: string;
  is_streamer?: boolean;
  league?: string;
}

interface RawRating {
  last?: { rating: number; date: number; rd?: number };
  best?: { rating: number; date: number; game?: string };
  record?: { win: number; loss: number; draw: number };
}
export type RawStats = Record<string, RawRating | unknown>;

export interface RawGamePlayer {
  rating?: number;
  result?: string;
  username?: string;
  uuid?: string;
}
export interface RawGame {
  url?: string;
  pgn?: string;
  time_control?: string;
  end_time?: number;
  rated?: boolean;
  time_class?: string;
  rules?: string;
  uuid?: string;
  fen?: string;
  initial_setup?: string;
  accuracies?: { white?: number; black?: number };
  white?: RawGamePlayer;
  black?: RawGamePlayer;
}
