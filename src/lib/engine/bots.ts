// The Bots section: named opponents, each one a real configuration of the bundled engine. A bot's strength
// comes from the same controls as the Play page (UCI_Elo, Skill Level, depth cap, or the human-like mode) and
// its "style" is a modest, documented bias in which candidate move it prefers. No bot carries a rating:
// the description says how it is limited, nothing more.
import { ELO_MAX, ELO_MIN } from './strength';
import type { BotStyle, OpponentConfig } from './strength';

export interface Bot {
  id: string;
  name: string;
  tagline: string;
  tier: 'Beginner' | 'Intermediate' | 'Advanced' | 'Master' | 'Maia';
  /** Hue (0-360) for the avatar. */
  hue: number;
  config: OpponentConfig;
}

const cfg = (c: Partial<OpponentConfig> & Pick<OpponentConfig, 'mode'>): OpponentConfig => ({ elo: ELO_MIN, skill: 10, movetimeMs: 500, useClock: false, ...c });

export const BOTS: Bot[] = [
  { id: 'pip', name: 'Pip', tagline: 'Just learned how the pieces move. Leaves things hanging.', tier: 'Beginner', hue: 95, config: cfg({ mode: 'beginner', skill: 0, depthCap: 1, movetimeMs: 150, name: 'Pip' }) },
  { id: 'nora', name: 'Nora', tagline: 'Plays sensible moves and now and then a slip.', tier: 'Beginner', hue: 20, config: cfg({ mode: 'human', skill: 4, movetimeMs: 350, name: 'Nora' }) },
  { id: 'otto', name: 'Otto', tagline: 'Swaps pieces at every chance and loves a simple endgame.', tier: 'Beginner', hue: 200, config: cfg({ mode: 'human', skill: 6, style: 'trader', movetimeMs: 350, name: 'Otto' }) },
  { id: 'rex', name: 'Rex', tagline: 'Attacks first, thinks second. Checks and captures galore.', tier: 'Intermediate', hue: 5, config: cfg({ mode: 'human', skill: 8, style: 'attacker', movetimeMs: 450, name: 'Rex' }) },
  { id: 'wren', name: 'Wren', tagline: 'Patient and careful. Rarely takes a risk.', tier: 'Intermediate', hue: 160, config: cfg({ mode: 'human', skill: 11, style: 'defender', movetimeMs: 500, name: 'Wren' }) },
  { id: 'dara', name: 'Dara', tagline: 'A steady club player on Stockfish’s own 1600 setting.', tier: 'Intermediate', hue: 280, config: cfg({ mode: 'elo', elo: 1600, skill: 10, movetimeMs: 600, useClock: true, name: 'Dara' }) },
  { id: 'vik', name: 'Vik', tagline: 'Tactical and sharp. Sacrifices when it can afford to.', tier: 'Advanced', hue: 340, config: cfg({ mode: 'human', skill: 14, style: 'attacker', movetimeMs: 700, name: 'Vik' }) },
  { id: 'sol', name: 'Sol', tagline: 'Solid, positional, and hard to break down.', tier: 'Advanced', hue: 45, config: cfg({ mode: 'human', skill: 16, style: 'defender', movetimeMs: 800, name: 'Sol' }) },
  { id: 'ines', name: 'Ines', tagline: 'Stockfish limited to its 2200 setting.', tier: 'Advanced', hue: 230, config: cfg({ mode: 'elo', elo: 2200, skill: 16, movetimeMs: 1000, useClock: true, name: 'Ines' }) },
  { id: 'magnus', name: 'Grandmaster', tagline: 'Stockfish at its 2800 setting. Expect to lose.', tier: 'Master', hue: 0, config: cfg({ mode: 'elo', elo: 2800, skill: 19, movetimeMs: 1500, useClock: true, name: 'Grandmaster' }) },
  { id: 'full', name: 'Full engine', tagline: 'No limits at all.', tier: 'Master', hue: 120, config: cfg({ mode: 'full', elo: ELO_MAX, skill: 20, movetimeMs: 1500, useClock: true, name: 'Full engine' }) },
];

const maiaBot = (rating: number, hue: number, tagline: string): Bot => ({
  id: `maia-${rating}`,
  name: `Maia ${rating}`,
  tagline,
  tier: 'Maia',
  hue,
  config: cfg({ mode: 'maia', maia: rating, movetimeMs: 300, name: `Maia ${rating}` }),
});
BOTS.push(
  maiaBot(1100, 150, 'Plays like Lichess players around 1100: sound ideas, regular oversights.'),
  maiaBot(1300, 190, 'Plays like players around 1300. Develops, castles, and sometimes leaves a piece loose.'),
  maiaBot(1500, 250, 'Plays like players around 1500: solid habits, the occasional tactical miss.'),
  maiaBot(1700, 310, 'Plays like players around 1700. Fewer slips, and it knows the common openings.'),
  maiaBot(1900, 20, 'Plays like players around 1900: strong instincts, rarely a blunder.'),
);

export const BOT_TIERS: Bot['tier'][] = ['Beginner', 'Intermediate', 'Advanced', 'Master', 'Maia'];
export const botById = (id: string | null | undefined): Bot | undefined => BOTS.find((b) => b.id === id);

/**
 * Weight multiplier for a candidate move. Attackers favour captures and checks, traders favour captures,
 * defenders mildly avoid both. Applied on top of the usual "how much worse than best" weighting, so a bot never
 * picks a move that loses much more than its carefulness allows.
 */
export function styleBias(style: BotStyle, resolve: (uci: string) => { san: string; captured?: string } | null): (uci: string) => number {
  return (uci) => {
    const m = resolve(uci);
    if (!m) return 1;
    const capture = !!m.captured || m.san.includes('x');
    const check = /[+#]$/.test(m.san);
    switch (style) {
      case 'attacker':
        return (capture ? 1.8 : 1) * (check ? 2 : 1);
      case 'trader':
        return capture ? 2.5 : 1;
      case 'defender':
        return (capture ? 0.7 : 1) * (check ? 0.6 : 1);
    }
  };
}
