// Shared domain types. Everything stored in IndexedDB is described here.

export type Color = 'w' | 'b';
export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'daily' | 'classical' | 'unknown';
export type GameSource = 'chesscom' | 'pgn' | 'played' | 'engine-match' | 'demo';
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';
export type UserOutcome = 'win' | 'loss' | 'draw';

/** Engine score. ALWAYS from White's point of view once it leaves the engine layer. */
export type Score = { kind: 'cp'; cp: number } | { kind: 'mate'; mate: number };

export interface SearchLine {
  multipv: number;
  score: Score; // White's perspective
  depth: number;
  seldepth?: number;
  nodes?: number;
  nps?: number;
  time?: number;
  wdl?: [number, number, number]; // from the side to move, per mille
  pv: string[]; // UCI moves
}

export interface PositionEval {
  fen: string;
  depth: number;
  multipv: number;
  engine: string;
  lines: SearchLine[]; // sorted by multipv, White's perspective
  terminal?: 'checkmate' | 'stalemate' | 'draw';
}

export interface GameRecord {
  id: string;
  source: GameSource;
  pgn: string;
  white: string;
  black: string;
  whiteElo?: number;
  blackElo?: number;
  result: GameResult;
  termination?: string;
  date: string; // YYYY-MM-DD
  /** Shown instead of the date when the source only knows a year or month, or no date at all. */
  dateLabel?: string;
  endTime: number; // epoch ms (import time when the game carries no date; used only for ordering)
  timeControl?: string;
  timeClass: TimeClass;
  rated?: boolean;
  rules?: string;
  url?: string;
  eco?: string;
  opening?: string;
  plies: number;
  // Who "I" was in this game (set for Chess.com imports and games played in-app).
  userColor?: Color;
  userName?: string;
  opponent?: string;
  userRating?: number;
  opponentRating?: number;
  userOutcome?: UserOutcome;
  chesscomResults?: { white: string; black: string };
  chesscomAccuracies?: { white?: number; black?: number };
  startFen?: string;
  tags: string[];
  notes?: string;
  addedAt: number;
  analyzed: 0 | 1; // numeric so it can be indexed
  fingerprint: string; // unique: prevents duplicates
}

/**
 * The grade of a move as shown to the person. `brilliant`, `great`, `book` and `miss` are refinements of the
 * loss-based grades (see lib/analysis/grades.ts); the loss-based grade itself is kept in `MoveAnalysis.lossCls`.
 */
export type MoveClass = 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'miss' | 'mistake' | 'blunder' | 'forced';
export type MoveFlag = 'missed-win' | 'missed-mate' | 'allowed-mate' | 'turning-point' | 'critical';

export interface MoveAnalysis {
  ply: number; // 1-based index of the move in the game
  color: Color;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  evalBefore: Score; // best line before the move, White's perspective
  evalAfter: Score; // best line after the played move, White's perspective
  bestUci: string | null;
  bestSan: string | null;
  bestPvSan: string[]; // validated SAN of the engine line
  secondUci?: string;
  secondSan?: string;
  secondScore?: Score;
  playedRank: number | null; // 1 = engine's first choice, null = outside the multipv lines
  winBefore: number; // mover's win % before (best play)
  winAfter: number; // mover's win % after the played move
  winLoss: number; // >= 0, win-percentage points lost
  cpLoss: number; // >= 0, centipawns lost (capped, mover's view)
  /** The grade shown to the person (may be brilliant, great, book or miss). */
  cls: MoveClass;
  /**
   * The grade by win-chance loss alone (never brilliant, great, book or miss). Statistics and training selection use
   * this one so their meaning does not depend on the refinements. Absent in analyses made before format version 2.
   */
  lossCls?: MoveClass;
  flags: MoveFlag[];
  clockMs?: number;
  spentMs?: number;
}

export interface SideSummary {
  moves: number;
  acpl: number;
  accuracy: number;
  counts: Record<MoveClass, number>;
  byPhase: Record<'opening' | 'middlegame' | 'endgame', { moves: number; avgWinLoss: number }>;
}

export interface GameAnalysis {
  gameId: string;
  engine: string;
  depth: number;
  multipv: number;
  createdAt: number;
  positions: PositionEval[]; // length = plies + 1
  moves: MoveAnalysis[];
  summary: { w: SideSummary; b: SideSummary };
  opening?: { eco: string; name: string; plies: number };
  keyMoments: number[]; // plies, most important first
  version: number; // analysis format version
}

export interface PuzzleRecord {
  id: string;
  fen: string;
  sideToMove: Color;
  solution: string[]; // UCI: user move, opponent reply, user move, ...
  accepted: string[]; // acceptable alternatives for the first move (UCI), includes solution[0]
  theme: string;
  themes: string[];
  gameId: string;
  ply: number;
  playedUci: string;
  playedSan: string;
  solutionSan: string[];
  winBefore: number;
  gap: number; // win% gap between best and second-best move (uniqueness)
  mateIn?: number;
  /** True when one move clearly stands out; false when many moves work and the point is to avoid the blunder. */
  unique: boolean;
  difficulty: number; // puzzle rating, adapts with attempts
  depth: number;
  createdAt: number;
}

export interface PuzzleSrs {
  puzzleId: string;
  box: number; // 0..5
  due: number; // epoch ms
  attempts: number;
  successes: number;
  lastAt?: number;
  avgMs?: number;
  streak: number;
}

export interface PuzzleAttempt {
  id?: number;
  puzzleId: string;
  at: number;
  ok: boolean;
  ms: number;
  hints: number;
  revealed: boolean;
  move?: string;
}

export interface NotebookEntry {
  id: string;
  fen: string;
  title: string;
  note: string;
  tags: string[];
  variations: string[]; // SAN lines validated from `fen`
  createdAt: number;
  updatedAt: number;
}

export interface RepertoireLine {
  id: string;
  color: Color;
  name: string;
  sans: string[]; // validated line from the start position
  createdAt: number;
  notes?: string;
  stats?: { attempts: number; correct: number };
}

export interface ChessComProfile {
  username: string;
  fetchedAt: number;
  source: string;
  profile: {
    username: string;
    name?: string;
    title?: string;
    avatar?: string;
    url?: string;
    country?: string;
    location?: string;
    joined?: number;
    lastOnline?: number;
    followers?: number;
    status?: string;
    isStreamer?: boolean;
    league?: string;
  };
  stats: Record<string, ChessComRating>;
  lastSync?: number;
}

export interface ChessComRating {
  last?: { rating: number; date: number; rd?: number };
  best?: { rating: number; date: number; game?: string };
  record?: { win: number; loss: number; draw: number };
}

export interface ArchiveMeta {
  url: string;
  fetchedAt: number;
  games: number;
  /** True when the month had ended when we fetched it: it can never change again. */
  final: boolean;
}

export interface StrengthEstimate {
  id?: number;
  at: number;
  timeClass: TimeClass | 'all';
  games: number;
  rating: number;
  low: number;
  high: number;
  level: number; // interval coverage, e.g. 0.8
  official?: number;
  method: string;
  quality?: { accuracy?: number; acpl?: number; analyzedGames: number };
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD (local)
  puzzles: number;
  puzzlesCorrect: number;
  reviews: number;
  gamesAnalyzed: number;
  lessons: number;
  minutes: number;
  played: number;
  /** Mistakes re-tested (Mistake Replay and the guided review's retry). Absent in older days. */
  retests?: number;
  /** Games taken through the guided review to the end. Absent in older days. */
  gamesReviewed?: number;
}

export interface Reflection {
  id: string;
  gameId: string;
  at: number;
  thinking: string;
  missed: string;
  study: string;
  rating?: number;
}
