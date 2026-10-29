// Opening repertoire: build lines from your own games, drill them, and see where you leave them.
import { Chess } from 'chess.js';
import { openingAt, openingsLoaded } from '../chess/openings';
import { parsePgn } from '../chess/rules';
import type { Color, GameRecord, RepertoireLine, UserOutcome } from '../types';

export interface LineCheck {
  ok: boolean;
  error?: string;
  fens: string[]; // position after each ply, starting with the initial position
  sans: string[]; // canonical SAN
}

/** Replay a SAN line from the start position and return canonical SAN. */
export function validateLine(sans: string[]): LineCheck {
  const chess = new Chess();
  const fens = [chess.fen()];
  const out: string[] = [];
  for (const s of sans) {
    try {
      const mv = chess.move(s);
      out.push(mv.san);
      fens.push(chess.fen());
    } catch {
      return { ok: false, error: `"${s}" is not a legal move after ${out.join(' ') || 'the start position'}.`, fens, sans: out };
    }
  }
  return { ok: true, fens, sans: out };
}

export interface TreeNode {
  san: string;
  ply: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  children: Map<string, TreeNode>;
}

const node = (san: string, ply: number): TreeNode => ({ san, ply, games: 0, wins: 0, draws: 0, losses: 0, children: new Map() });

export const scoreOf = (n: Pick<TreeNode, 'games' | 'wins' | 'draws'>): number => (n.games ? (n.wins + n.draws / 2) / n.games : 0);

function sansOf(g: GameRecord): string[] {
  try {
    return parsePgn(g.pgn).moves.map((m) => m.san);
  } catch {
    return [];
  }
}

/** Opening tree of the games you played with `color` (first `maxPlies` plies). */
export function buildTree(games: GameRecord[], color: Color, maxPlies = 16): TreeNode {
  const root = node('', 0);
  for (const g of games) {
    if (g.userColor !== color || !g.userOutcome || (g.rules && g.rules !== 'chess')) continue;
    let cur = root;
    for (const [i, san] of sansOf(g).slice(0, maxPlies).entries()) {
      let next = cur.children.get(san);
      if (!next) {
        next = node(san, i + 1);
        cur.children.set(san, next);
      }
      next.games++;
      const o: UserOutcome = g.userOutcome;
      if (o === 'win') next.wins++;
      else if (o === 'draw') next.draws++;
      else next.losses++;
      cur = next;
    }
  }
  return root;
}

export interface SuggestedLine {
  sans: string[];
  games: number; // games that reached the end of the line
  score: number; // 0..1
  wins: number;
  draws: number;
  losses: number;
  name: string;
}

const userPly = (color: Color, ply: number) => (color === 'w' ? ply % 2 === 1 : ply % 2 === 0);

/**
 * Lines you actually play. At each of your own moves the line follows the move you chose most
 * often; at each opponent move it branches into every reply you have met at least `minGames` times.
 */
export function suggestLines(games: GameRecord[], color: Color, opts: { minGames?: number; maxPlies?: number; limit?: number } = {}): SuggestedLine[] {
  const minGames = opts.minGames ?? 2;
  const maxPlies = opts.maxPlies ?? 12;
  const root = buildTree(games, color, maxPlies);
  const out: SuggestedLine[] = [];
  const walk = (n: TreeNode, path: string[]): void => {
    const nextPly = n.ply + 1;
    const kids = [...n.children.values()].filter((c) => c.games >= minGames).sort((a, b) => b.games - a.games);
    const finish = () => {
      if (path.length >= 3) {
        const last = n;
        let name = '';
        if (openingsLoaded()) {
          const check = validateLine(path);
          const fen = check.fens.at(-1);
          name = (fen && openingAt(fen)?.name) || '';
        }
        out.push({ sans: path, games: last.games, score: scoreOf(last), wins: last.wins, draws: last.draws, losses: last.losses, name });
      }
    };
    if (!kids.length || nextPly > maxPlies) return finish();
    if (userPly(color, nextPly)) walk(kids[0]!, [...path, kids[0]!.san]);
    else for (const k of kids) walk(k, [...path, k.san]);
  };
  walk(root, []);
  return out
    .filter((l, i, a) => a.findIndex((x) => x.sans.join(' ') === l.sans.join(' ')) === i)
    .sort((a, b) => b.games - a.games)
    .slice(0, opts.limit ?? 12);
}

/** Moves the repertoire expects next after `history`, for the side to move there. */
export function expectedMoves(lines: RepertoireLine[], color: Color, history: string[]): { user: string[]; opponent: string[] } {
  const user = new Set<string>();
  const opponent = new Set<string>();
  for (const l of lines) {
    if (l.color !== color || l.sans.length <= history.length) continue;
    if (!history.every((m, i) => l.sans[i] === m)) continue;
    (userPly(color, history.length + 1) ? user : opponent).add(l.sans[history.length]!);
  }
  return { user: [...user], opponent: [...opponent] };
}

export interface Deviation {
  gameId: string;
  ply: number;
  played: string;
  expected: string[];
  history: string[];
  outcome: UserOutcome;
}

/** The first move at which each of your games left your own repertoire (on your side only). */
export function findDeviations(games: GameRecord[], lines: RepertoireLine[], color: Color): Deviation[] {
  const out: Deviation[] = [];
  for (const g of games) {
    if (g.userColor !== color || !g.userOutcome) continue;
    const sans = sansOf(g);
    for (let i = 0; i < sans.length; i++) {
      const history = sans.slice(0, i);
      const exp = expectedMoves(lines, color, history);
      if (!userPly(color, i + 1)) {
        // The opponent left the book (or the book ends here): nothing to compare against from now on.
        if (!exp.opponent.includes(sans[i]!)) break;
        continue;
      }
      if (!exp.user.length) break; // out of repertoire territory
      if (!exp.user.includes(sans[i]!)) {
        out.push({ gameId: g.id, ply: i + 1, played: sans[i]!, expected: exp.user, history, outcome: g.userOutcome });
        break;
      }
    }
  }
  return out;
}

export interface DeviationGroup {
  history: string[];
  expected: string[];
  played: { san: string; games: number; score: number }[];
  games: number;
}

export function groupDeviations(devs: Deviation[]): DeviationGroup[] {
  const by = new Map<string, Deviation[]>();
  for (const d of devs) by.set(d.history.join(' '), [...(by.get(d.history.join(' ')) ?? []), d]);
  return [...by.values()]
    .map((list) => {
      const played = new Map<string, Deviation[]>();
      for (const d of list) played.set(d.played, [...(played.get(d.played) ?? []), d]);
      return {
        history: list[0]!.history,
        expected: list[0]!.expected,
        games: list.length,
        played: [...played.entries()]
          .map(([san, ds]) => ({ san, games: ds.length, score: ds.reduce((s, d) => s + (d.outcome === 'win' ? 1 : d.outcome === 'draw' ? 0.5 : 0), 0) / ds.length }))
          .sort((a, b) => b.games - a.games),
      };
    })
    .sort((a, b) => b.games - a.games);
}

export const lineId = (color: Color, sans: string[]): string => `${color}:${sans.join(' ')}`;

export function toRepertoireLine(color: Color, sans: string[], name: string, now = Date.now()): RepertoireLine {
  return { id: lineId(color, sans), color, name, sans, createdAt: now };
}

/** Format a SAN list with move numbers, e.g. "1.e4 e5 2.Nf3". */
export function formatLine(sans: string[]): string {
  return sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(' ');
}
