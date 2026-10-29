// Glue between a GameSession and a Stockfish worker: configure an opponent, ask it for a move, and
// decide whether it accepts a draw. Used by the Play page and the Engine Match Lab.
import type { Engine } from '../lib/engine/engine';
import { describeConfig, goFor, optionsFor } from '../lib/engine/strength';
import { HUMAN_MULTIPV, pickHumanMove } from '../lib/engine/human';
import type { OpponentConfig } from '../lib/engine/strength';
import { forMover } from '../lib/chess/eval';
import { resolveMove } from '../lib/chess/rules';
import { styleBias } from '../lib/engine/bots';
import { gameFromPgn } from '../lib/games/records';
import type { GameSession } from '../lib/play/session';
import { addGames } from '../lib/storage/repos';
import type { Color, GameRecord, GameSource } from '../lib/types';
import { getEngine } from './engines';
import type { SlotId } from './engines';

/** Apply the opponent's strength options and start a fresh game in the engine. */
export async function prepareEngine(slot: SlotId, cfg: OpponentConfig): Promise<Engine> {
  const engine = await getEngine(slot);
  await engine.setOptions(optionsFor(cfg));
  await engine.newGame();
  return engine;
}

/** The engine's move in the session's current position. Returns null if the search was cancelled. */
export async function engineMove(engine: Engine, session: GameSession, cfg: OpponentConfig): Promise<string | null> {
  const now = Date.now();
  const time = session.time;
  const clock = time ? { wtime: Math.max(1, Math.round(session.remaining('w', now) ?? 1)), btime: Math.max(1, Math.round(session.remaining('b', now) ?? 1)), winc: time.w.incMs, binc: time.b.incMs } : undefined;
  const human = cfg.mode === 'human';
  const res = await engine.search({ fen: session.startFen, moves: session.ucis, multipv: human ? HUMAN_MULTIPV : 1, ...goFor(cfg, clock) });
  if (res.cancelled) return null;
  if (human) {
    const pick = pickHumanMove(res.lines, session.turn, cfg.skill, Math.random, cfg.style ? styleBias(cfg.style, (uci) => resolveMove(session.fen, uci)) : undefined);
    if (pick) return pick.uci;
  }
  return res.bestmove;
}

/**
 * Does the engine accept a draw offer? Rule (documented in the UI): it accepts when its own evaluation,
 * at a modest fixed depth, is level or worse for it: at most +0.20 pawns, and never when it sees a mate.
 */
export async function engineAcceptsDraw(engine: Engine, session: GameSession, engineColor: Color): Promise<{ accept: boolean; reason: string }> {
  const res = await engine.search({ fen: session.fen, depth: 12, multipv: 1 });
  if (res.cancelled || !res.lines[0]) return { accept: false, reason: 'The engine was interrupted and did not answer.' };
  const mine = forMover(res.lines[0].score, engineColor);
  if (mine.kind === 'mate') return mine.mate > 0 ? { accept: false, reason: 'The engine sees a forced win and declines.' } : { accept: true, reason: 'The engine sees it is getting mated and accepts.' };
  if (mine.cp <= 20) return { accept: true, reason: `The engine rates the position ${mine.cp >= 0 ? '+' : ''}${(mine.cp / 100).toFixed(2)} for itself (level or worse) and accepts.` };
  return { accept: false, reason: `The engine rates the position +${(mine.cp / 100).toFixed(2)} for itself and declines.` };
}

export const engineName = (cfg: OpponentConfig): string => {
  if (cfg.name) return cfg.name;
  switch (cfg.mode) {
    case 'full':
      return 'Stockfish (full strength)';
    case 'elo':
      return `Stockfish (UCI_Elo ${cfg.elo})`;
    case 'skill':
      return `Stockfish (Skill ${cfg.skill})`;
    case 'beginner':
      return `Stockfish (Skill ${cfg.skill}, depth ${cfg.depthCap ?? 2})`;
    case 'human':
      return `Human-like opponent (carefulness ${cfg.skill})`;
  }
};

export interface SaveOptions {
  white: string;
  black: string;
  source: GameSource;
  event: string;
  userColor?: Color;
  userName?: string;
  tags?: string[];
  headers?: Record<string, string>;
  /** Replace the fingerprint/id so identical engine games in one series are all kept. */
  uniqueKey?: string;
  engines?: { w?: OpponentConfig; b?: OpponentConfig };
}

/** Save a finished (or stopped) session into the library. Returns the new game id, or null if it was a duplicate. */
export async function saveSession(session: GameSession, o: SaveOptions): Promise<string | null> {
  const headers: Record<string, string> = {
    Event: o.event,
    White: o.white,
    Black: o.black,
    ...(o.engines?.w ? { WhiteType: 'program', WhiteEngine: describeConfig(o.engines.w) } : { WhiteType: 'human' }),
    ...(o.engines?.b ? { BlackType: 'program', BlackEngine: describeConfig(o.engines.b) } : { BlackType: 'human' }),
    ...o.headers,
  };
  const pgn = session.pgn(headers);
  const game: GameRecord = gameFromPgn(pgn, { source: o.source, userName: o.userName, extra: { tags: o.tags ?? [], ...(o.userColor ? { userColor: o.userColor } : {}) } });
  const rec: GameRecord = o.uniqueKey ? { ...game, id: `${game.source}:${o.uniqueKey}`, fingerprint: `${game.fingerprint}:${o.uniqueKey}` } : game;
  if (rec.plies === 0) return null;
  const r = await addGames([rec]);
  return r.added ? rec.id : null;
}
