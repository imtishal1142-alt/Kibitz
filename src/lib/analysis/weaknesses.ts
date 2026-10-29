// Cross-game weakness detection. Only the USER's moves are considered, and a pattern is only called
// "established" when it recurs across several games; weaker evidence is labelled tentative.
import { isSevere, lossClassOf } from '../chess/classify';
import type { GameAnalysis, GameRecord, MoveAnalysis } from '../types';
import { CATEGORY_LABEL, CATEGORY_LESSON, explainMove, moveLabel } from './explain';
import type { Category } from './explain';

export interface WeaknessExample {
  gameId: string;
  ply: number;
  label: string;
  san: string;
  bestSan: string | null;
  winLoss: number;
  date: string;
  opponent?: string;
}

export type Evidence = 'established' | 'tentative';
export type Trend = 'improving' | 'worsening' | 'steady' | 'unknown';

export interface Weakness {
  category: Category;
  label: string;
  count: number;
  games: number;
  per100Moves: number;
  avgWinLoss: number;
  share: number; // share of all points lost to mistakes/blunders
  severity: 'minor' | 'moderate' | 'major';
  evidence: Evidence;
  trend: Trend;
  trendDetail: string;
  examples: WeaknessExample[];
  exercise: string;
  strategy: string;
  puzzleTheme?: string;
}

export interface WeaknessReport {
  gamesConsidered: number;
  movesConsidered: number;
  mistakes: number;
  weaknesses: Weakness[];
  phases: { phase: 'opening' | 'middlegame' | 'endgame'; moves: number; avgWinLoss: number }[];
  note: string;
}

const EXERCISES: Partial<Record<Category, { exercise: string; theme?: string }>> = {
  'hanging-piece': { exercise: 'Blunder Prevention trainer, then "Is anything hanging?" puzzles from your own games.', theme: 'defense' },
  'missed-threat': { exercise: 'Blunder Prevention trainer: name the opponent\'s threat before choosing a move.', theme: 'defense' },
  fork: { exercise: 'Fork puzzles from your games; practise spotting knight and queen forks one move ahead.', theme: 'fork' },
  'pin-skewer': { exercise: 'Pin and skewer puzzles; before each move check lines toward your king and queen.', theme: 'pin' },
  'discovered-attack': { exercise: 'Discovered-attack puzzles; list what each piece blocks before moving it.', theme: 'discovered-attack' },
  'mate-threat': { exercise: 'Mate-in-one and mate-in-two puzzles; practise finding every check the opponent has.', theme: 'mate' },
  'back-rank': { exercise: 'Back-rank puzzles; make luft (h3/h6) a habit when you castle.', theme: 'mate' },
  'poor-exchange': { exercise: 'Exchange-counting drills: attackers vs defenders before every capture.', theme: 'win-material' },
  'missed-tactic': { exercise: 'Tactics from your own missed wins (Mistake Replay).', theme: 'win-material' },
  'missed-win': { exercise: 'Mistake Replay on positions where you were winning.', theme: 'win-material' },
  'king-safety': { exercise: 'Review your opening choices: castle by move 10 and avoid pawn moves in front of your king.' },
  'pawn-structure': { exercise: 'Candidate Move trainer: compare pawn moves by what they leave weak.' },
  development: { exercise: 'Opening trainer: repeat your repertoire lines until development is automatic.' },
  'endgame-technique': { exercise: 'Endgame Laboratory: king-and-pawn and rook endgames with engine verification.', theme: 'endgame' },
  positional: { exercise: 'Candidate Move trainer on positions without a tactic.' },
  calculation: { exercise: 'Guess-the-Move on long forced lines; write out variations before moving.', theme: 'win-material' },
  'time-pressure': { exercise: 'Play 10+0 or 15+10 games and review your clock use in the analysis graph.' },
};

/** The puzzle theme that practises a mistake category, when there is one. */
export const puzzleThemeOf = (c: Category): string | undefined => EXERCISES[c]?.theme;

function severityOf(share: number): Weakness['severity'] {
  return share >= 0.25 ? 'major' : share >= 0.1 ? 'moderate' : 'minor';
}

export interface Entry {
  game: GameRecord;
  analysis: GameAnalysis;
}

/** The user's moves in a game that count as mistakes for pattern detection. */
export function userMistakes(a: GameAnalysis, color: 'w' | 'b'): MoveAnalysis[] {
  return a.moves.filter((m) => m.color === color && (isSevere(lossClassOf(m)) || m.flags.includes('missed-mate')));
}

export function detectWeaknesses(entries: Entry[]): WeaknessReport {
  const mine = entries.filter((e) => e.game.userColor).sort((a, b) => a.game.endTime - b.game.endTime);
  const moveCount = mine.reduce((n, e) => n + e.analysis.summary[e.game.userColor!].moves, 0);
  const phaseAcc = { opening: { moves: 0, sum: 0 }, middlegame: { moves: 0, sum: 0 }, endgame: { moves: 0, sum: 0 } };
  for (const e of mine) {
    const s = e.analysis.summary[e.game.userColor!];
    for (const p of ['opening', 'middlegame', 'endgame'] as const) {
      phaseAcc[p].moves += s.byPhase[p].moves;
      phaseAcc[p].sum += s.byPhase[p].avgWinLoss * s.byPhase[p].moves;
    }
  }
  const phases = (['opening', 'middlegame', 'endgame'] as const).map((p) => ({ phase: p, moves: phaseAcc[p].moves, avgWinLoss: phaseAcc[p].moves ? phaseAcc[p].sum / phaseAcc[p].moves : 0 }));

  type Hit = { category: Category; gameIndex: number; move: MoveAnalysis; entry: Entry };
  const hits: Hit[] = [];
  mine.forEach((entry, gameIndex) => {
    for (const m of userMistakes(entry.analysis, entry.game.userColor!)) {
      const ex = explainMove(m, entry.analysis);
      if (ex.category === 'sound') continue;
      const cats = new Set<Category>([ex.category]);
      if (ex.themes.includes('time-pressure')) cats.add('time-pressure');
      for (const c of cats) hits.push({ category: c, gameIndex, move: m, entry });
    }
  });
  const totalLoss = hits.filter((h, i, a) => a.findIndex((x) => x.move === h.move) === i).reduce((s, h) => s + h.move.winLoss, 0) || 1;
  const mistakeMoves = new Set(hits.map((h) => h.move)).size;

  const split = Math.max(1, Math.floor(mine.length * (2 / 3)));
  const byCat = new Map<Category, Hit[]>();
  for (const h of hits) byCat.set(h.category, [...(byCat.get(h.category) ?? []), h]);

  const weaknesses: Weakness[] = [];
  for (const [category, list] of byCat) {
    const games = new Set(list.map((h) => h.gameIndex)).size;
    if (list.length < 2 || games < 2) continue; // a single occurrence is an anecdote, not a pattern
    const evidence: Evidence = list.length >= 4 && games >= 3 ? 'established' : 'tentative';
    const loss = list.reduce((s, h) => s + h.move.winLoss, 0);
    const earlier = list.filter((h) => h.gameIndex < split);
    const recent = list.filter((h) => h.gameIndex >= split);
    const earlierMoves = mine.slice(0, split).reduce((n, e) => n + e.analysis.summary[e.game.userColor!].moves, 0);
    const recentMoves = mine.slice(split).reduce((n, e) => n + e.analysis.summary[e.game.userColor!].moves, 0);
    let trend: Trend = 'unknown';
    let trendDetail = `Not enough games to judge a trend (${mine.length}; at least 9 needed).`;
    if (mine.length >= 9 && earlierMoves > 0 && recentMoves > 0) {
      const re = earlier.length / earlierMoves;
      const rr = recent.length / recentMoves;
      trendDetail = `${((re * 100).toFixed(1))} per 100 moves earlier vs ${(rr * 100).toFixed(1)} in your latest ${mine.length - split} games.`;
      if (earlier.length >= 3 && rr < re * 0.6) trend = 'improving';
      else if (recent.length >= 3 && rr > re * 1.5) trend = 'worsening';
      else trend = 'steady';
    }
    const share = loss / totalLoss;
    const ex = EXERCISES[category];
    weaknesses.push({
      category,
      label: CATEGORY_LABEL[category],
      count: list.length,
      games,
      per100Moves: moveCount ? (list.length / moveCount) * 100 : 0,
      avgWinLoss: loss / list.length,
      share,
      severity: severityOf(share),
      evidence,
      trend,
      trendDetail,
      examples: [...list]
        .sort((a, b) => b.move.winLoss - a.move.winLoss)
        .slice(0, 5)
        .map((h) => ({ gameId: h.entry.game.id, ply: h.move.ply, label: moveLabel(h.move), san: h.move.san, bestSan: h.move.bestSan, winLoss: h.move.winLoss, date: h.entry.game.date, opponent: h.entry.game.opponent })),
      exercise: ex?.exercise ?? 'Review the example games below.',
      strategy: CATEGORY_LESSON[category],
      puzzleTheme: ex?.theme,
    });
  }
  weaknesses.sort((a, b) => b.share - a.share);
  const note =
    mine.length < 5
      ? `Only ${mine.length} analysed game${mine.length === 1 ? '' : 's'}: treat everything here as a first impression. Patterns need at least 4 occurrences across 3 games to be called established.`
      : 'Patterns come from engine-verified mistakes (mistakes and blunders at your analysis depth). Categories are assigned by checking the board, not guessed.';
  return { gamesConsidered: mine.length, movesConsidered: moveCount, mistakes: mistakeMoves, weaknesses, phases, note };
}
