// IndexedDB schema (via `idb`). Versioned: add a new `if (oldVersion < N)` block to migrate.
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import type {
  ArchiveMeta,
  CalendarDay,
  ChessComProfile,
  GameAnalysis,
  GameRecord,
  NotebookEntry,
  PuzzleAttempt,
  PuzzleRecord,
  PuzzleSrs,
  Reflection,
  RepertoireLine,
  SearchLine,
  StrengthEstimate,
} from '../types';

export interface CachedEval {
  key: string; // `${fenKey}|${engine}`
  depth: number;
  multipv: number;
  lines: SearchLine[];
  at: number;
}

export interface KibitzDB extends DBSchema {
  games: {
    key: string;
    value: GameRecord;
    indexes: { 'by-endTime': number; 'by-source': string; 'by-timeClass': string; 'by-fingerprint': string; 'by-analyzed': number; 'by-opponent': string };
  };
  analyses: { key: string; value: GameAnalysis };
  /** The same analyses without their per-position engine lines (the bulk of the data). Lists read this one; it is rebuilt from `analyses` whenever the two disagree, so it is never a source of truth. */
  analysisLite: { key: string; value: GameAnalysis };
  evalCache: { key: string; value: CachedEval; indexes: { 'by-at': number } };
  puzzles: { key: string; value: PuzzleRecord; indexes: { 'by-theme': string; 'by-game': string } };
  puzzleSrs: { key: string; value: PuzzleSrs; indexes: { 'by-due': number } };
  attempts: { key: number; value: PuzzleAttempt; indexes: { 'by-puzzle': string; 'by-at': number } };
  notebook: { key: string; value: NotebookEntry };
  repertoire: { key: string; value: RepertoireLine };
  strength: { key: number; value: StrengthEstimate; indexes: { 'by-at': number } };
  calendar: { key: string; value: CalendarDay };
  reflections: { key: string; value: Reflection; indexes: { 'by-game': string } };
  profiles: { key: string; value: ChessComProfile };
  archives: { key: string; value: ArchiveMeta };
  kv: { key: string; value: unknown };
}

export const DB_NAME = 'kibitz';
export const DB_VERSION = 2;

export const STORE_NAMES = [
  'games',
  'analyses',
  'evalCache',
  'puzzles',
  'puzzleSrs',
  'attempts',
  'notebook',
  'repertoire',
  'strength',
  'calendar',
  'reflections',
  'profiles',
  'archives',
  'kv',
] as const;
export type StoreName = (typeof STORE_NAMES)[number];

let dbPromise: Promise<IDBPDatabase<KibitzDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<KibitzDB>> {
  dbPromise ??= openDB<KibitzDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const games = db.createObjectStore('games', { keyPath: 'id' });
        games.createIndex('by-endTime', 'endTime');
        games.createIndex('by-source', 'source');
        games.createIndex('by-timeClass', 'timeClass');
        games.createIndex('by-fingerprint', 'fingerprint', { unique: true });
        games.createIndex('by-analyzed', 'analyzed');
        games.createIndex('by-opponent', 'opponent');
        db.createObjectStore('analyses', { keyPath: 'gameId' });
        db.createObjectStore('evalCache', { keyPath: 'key' }).createIndex('by-at', 'at');
        const puzzles = db.createObjectStore('puzzles', { keyPath: 'id' });
        puzzles.createIndex('by-theme', 'theme');
        puzzles.createIndex('by-game', 'gameId');
        db.createObjectStore('puzzleSrs', { keyPath: 'puzzleId' }).createIndex('by-due', 'due');
        const attempts = db.createObjectStore('attempts', { keyPath: 'id', autoIncrement: true });
        attempts.createIndex('by-puzzle', 'puzzleId');
        attempts.createIndex('by-at', 'at');
        db.createObjectStore('notebook', { keyPath: 'id' });
        db.createObjectStore('repertoire', { keyPath: 'id' });
        db.createObjectStore('strength', { keyPath: 'id', autoIncrement: true }).createIndex('by-at', 'at');
        db.createObjectStore('calendar', { keyPath: 'date' });
        db.createObjectStore('reflections', { keyPath: 'id' }).createIndex('by-game', 'gameId');
        db.createObjectStore('profiles', { keyPath: 'username' });
        db.createObjectStore('archives', { keyPath: 'url' });
        db.createObjectStore('kv');
      }
      if (oldVersion < 2) {
        db.createObjectStore('analysisLite', { keyPath: 'gameId' });
      }
    },
    blocked() {
      console.warn('Kibitz database upgrade is blocked by another open tab. Close other tabs and reload.');
    },
    terminated() {
      dbPromise = null;
    },
  });
  return dbPromise;
}

/** Close and forget the connection (tests, "clear all data"). */
export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  db.close();
  dbPromise = null;
}
