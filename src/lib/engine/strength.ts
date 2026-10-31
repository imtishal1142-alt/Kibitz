// How an opponent engine plays: full strength or deliberately weakened, and how long it thinks.
//
// Stockfish offers two weakening mechanisms and both are real UCI options of the bundled build:
//   * UCI_LimitStrength + UCI_Elo (1320 to 3190). The number is calibrated by the Stockfish
//     developers against engine rating lists at fast time controls. It is NOT a Chess.com, Lichess
//     or FIDE rating, and the app never presents it as one.
//   * Skill Level (0 to 20): the engine considers several moves and sometimes plays a worse one.
// For beginners we add a node/depth limit on top, because even Skill Level 0 plays far above most
// people when it is allowed to search deeply.
import type { GoParams } from './uci';

export type StrengthMode = 'full' | 'elo' | 'skill' | 'beginner' | 'human' | 'maia';
/** A real, modest bias in which move a human-like opponent prefers among its candidates (see human.ts). */
export type BotStyle = 'attacker' | 'trader' | 'defender';

export interface OpponentConfig {
  mode: StrengthMode;
  elo: number; // 1320..3190 (mode 'elo')
  skill: number; // 0..20 (mode 'skill')
  /** Think time per move in milliseconds (ignored when `useClock` is on and the game is timed). */
  movetimeMs: number;
  /** Optional depth cap. Always applied for 'beginner'. */
  depthCap?: number;
  useClock: boolean;
  /** Rating band of the Maia network (mode 'maia'): 1100, 1300, 1500, 1700 or 1900, Lichess scale. */
  maia?: number;
  /** Move-choice bias, used by the human-like mode only. */
  style?: BotStyle;
  /** Display name of a bot (from the Bots page). */
  name?: string;
}

const MAIA = [1100, 1300, 1500, 1700, 1900];
const nearestMaiaRating = (r: number): number => MAIA.reduce((b, x) => (Math.abs(x - r) < Math.abs(b - r) ? x : b), 1100);

export const ELO_MIN = 1320;
export const ELO_MAX = 3190;

export const DEFAULT_OPPONENT: OpponentConfig = { mode: 'elo', elo: 1600, skill: 10, movetimeMs: 700, useClock: true };

export interface StrengthLevel {
  id: string;
  label: string;
  hint: string;
  config: OpponentConfig;
}

export const LEVELS: StrengthLevel[] = [
  { id: 'beginner', label: 'Beginner', hint: 'Skill Level 0 with a shallow search. Makes plenty of mistakes.', config: { mode: 'beginner', elo: ELO_MIN, skill: 0, movetimeMs: 200, depthCap: 2, useClock: false } },
  { id: 'casual', label: 'Casual', hint: 'Skill Level 5, search capped at depth 5.', config: { mode: 'skill', elo: ELO_MIN, skill: 5, movetimeMs: 300, depthCap: 5, useClock: false } },
  { id: 'club', label: 'Club player', hint: 'UCI_Elo 1600 (engine-list scale).', config: { mode: 'elo', elo: 1600, skill: 10, movetimeMs: 600, useClock: true } },
  { id: 'strong', label: 'Strong club', hint: 'UCI_Elo 2000 (engine-list scale).', config: { mode: 'elo', elo: 2000, skill: 15, movetimeMs: 900, useClock: true } },
  { id: 'master', label: 'Master', hint: 'UCI_Elo 2500 (engine-list scale).', config: { mode: 'elo', elo: 2500, skill: 18, movetimeMs: 1200, useClock: true } },
  { id: 'human-easy', label: 'Human-like, error-prone', hint: 'Plays like a person who sees the main ideas but slips: mostly sensible moves, now and then a plausible mistake.', config: { mode: 'human', elo: ELO_MIN, skill: 5, movetimeMs: 400, useClock: false } },
  { id: 'human-solid', label: 'Human-like, solid', hint: 'Like a careful club player: rarely a slip, and when it slips it is a small one.', config: { mode: 'human', elo: ELO_MIN, skill: 13, movetimeMs: 500, useClock: false } },
  { id: 'full', label: 'Full strength', hint: 'No limit. Far stronger than any human.', config: { mode: 'full', elo: ELO_MAX, skill: 20, movetimeMs: 1500, useClock: true } },
];

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));

/** UCI options that realise a configuration. Always sets every strength option so none lingers from a previous game. */
export function optionsFor(c: OpponentConfig): Record<string, string | number | boolean> {
  switch (c.mode) {
    case 'full':
    case 'human':
    case 'maia':
      return { UCI_LimitStrength: false, 'Skill Level': 20 };
    case 'elo':
      return { UCI_LimitStrength: true, UCI_Elo: clamp(c.elo, ELO_MIN, ELO_MAX), 'Skill Level': 20 };
    case 'skill':
    case 'beginner':
      return { UCI_LimitStrength: false, 'Skill Level': clamp(c.skill, 0, 20) };
  }
}

export interface ClockForGo {
  wtime: number;
  btime: number;
  winc: number;
  binc: number;
}

/** How long and how deep to search for one move. */
export function goFor(c: OpponentConfig, clock?: ClockForGo): GoParams {
  const depth = c.mode === 'beginner' ? clamp(c.depthCap ?? 2, 1, 20) : c.depthCap ? clamp(c.depthCap, 1, 30) : undefined;
  if (c.useClock && clock) return { ...clock, depth, movetime: undefined };
  return { movetime: clamp(c.movetimeMs, 20, 60_000), depth };
}

export function describeConfig(c: OpponentConfig): string {
  const think = c.useClock ? 'uses its clock' : `${(c.movetimeMs / 1000).toFixed(1)} s per move`;
  const cap = c.depthCap ? `, depth cap ${c.depthCap}` : '';
  switch (c.mode) {
    case 'full':
      return `Stockfish at full strength, ${think}${cap}`;
    case 'elo':
      return `Stockfish UCI_Elo ${c.elo} (engine-list scale), ${think}${cap}`;
    case 'skill':
      return `Stockfish Skill Level ${c.skill}, ${think}${cap}`;
    case 'beginner':
      return `Stockfish Skill Level ${c.skill}, depth ${c.depthCap ?? 2}`;
    case 'maia':
      return `Maia ${c.maia ?? 1500}: a neural network trained on games of people rated about ${c.maia ?? 1500} on Lichess (Lichess scale, not Chess.com), one move choice per turn with no search`;
    case 'human':
      return `Human-like opponent, carefulness ${c.skill} of 20 (full-strength Stockfish picks among its top moves), ${think}${cap}`;
  }
}

export function sanitizeConfig(c: Partial<OpponentConfig> | undefined): OpponentConfig {
  const m = { ...DEFAULT_OPPONENT, ...c };
  return {
    mode: (['full', 'elo', 'skill', 'beginner', 'human', 'maia'] as const).includes(m.mode) ? m.mode : 'elo',
    elo: clamp(m.elo, ELO_MIN, ELO_MAX),
    skill: clamp(m.skill, 0, 20),
    movetimeMs: clamp(m.movetimeMs, 20, 60_000),
    depthCap: m.depthCap ? clamp(m.depthCap, 1, 30) : undefined,
    useClock: !!m.useClock,
    maia: m.mode === 'maia' ? nearestMaiaRating(m.maia ?? 1500) : undefined,
    style: m.style === 'attacker' || m.style === 'trader' || m.style === 'defender' ? m.style : undefined,
    name: typeof m.name === 'string' && m.name.trim() ? m.name.trim().slice(0, 40) : undefined,
  };
}
