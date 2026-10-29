// Lightweight preferences in localStorage (with an in-memory fallback when storage is blocked).
export type ThemeChoice = 'system' | 'light' | 'dark';
export type PresetId = 'quick' | 'standard' | 'deep';

export interface Prefs {
  theme: ThemeChoice;
  boardTheme: string;
  pieceSet: 'classic' | 'glyph';
  coordinates: boolean;
  highlightMoves: boolean;
  legalMoveDots: boolean;
  animations: boolean;
  sounds: boolean;
  soundVolume: number; // 0..1
  autoQueen: boolean;
  flavor: string; // engine flavour id, or 'auto'
  /** True once the person picked a build themselves (until then 'lite-wasm' means "automatic"). */
  flavorChosen: boolean;
  /** Build used for game review and puzzle generation: 'same' follows `flavor`. */
  reviewFlavor: string;
  /** Games analysed at the same time by the background queue: 0 = automatic from the number of cores, otherwise 1 to 4. */
  analysisWorkers: number;
  /** The navigation rail shows only icons (wide screens). */
  railCollapsed: boolean;
  /** Analyse games that have no analysis yet, in the background, when the app opens or games are added. */
  autoAnalyse: boolean;
  /** Only the newest N of your games are queued automatically (0 = all of them). */
  autoAnalyseLimit: number;
  hashMb: number;
  analysisPreset: PresetId;
  liveDepth: number; // depth limit for the live analysis panel
  multipv: number; // candidate lines in the live panel
  chesscomUser: string;
  onboarded: boolean;
  dailyGoal: number; // puzzles per day
  includeDemoInStats: boolean;
  reducedMotion: 'system' | 'on' | 'off';
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  boardTheme: 'green',
  pieceSet: 'classic',
  coordinates: true,
  highlightMoves: true,
  legalMoveDots: true,
  animations: true,
  sounds: false,
  soundVolume: 0.5,
  autoQueen: false,
  flavor: 'auto',
  flavorChosen: false,
  reviewFlavor: 'same',
  analysisWorkers: 0,
  railCollapsed: false,
  autoAnalyse: true,
  autoAnalyseLimit: 200,
  hashMb: 32,
  analysisPreset: 'standard',
  liveDepth: 20,
  multipv: 3,
  chesscomUser: '',
  onboarded: false,
  dailyGoal: 10,
  includeDemoInStats: false,
  reducedMotion: 'system',
};

export const PRESETS: Record<PresetId, { label: string; depth: number; multipv: number; hint: string }> = {
  quick: { label: 'Quick', depth: 10, multipv: 2, hint: 'Depth 10. Fast, rough: fine for a first look.' },
  standard: { label: 'Standard', depth: 14, multipv: 2, hint: 'Depth 14. Good balance of speed and reliability.' },
  deep: { label: 'Deep', depth: 18, multipv: 3, hint: 'Depth 18, three lines. Slower, more trustworthy verdicts.' },
};

const KEY = 'kibitz.prefs.v1';
let memory: Partial<Prefs> = {};
let cache: Prefs | null = null;
const listeners = new Set<() => void>();

function read(): Prefs {
  let stored: Partial<Prefs> = memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) stored = { ...JSON.parse(raw) } as Partial<Prefs>;
  } catch {
    /* storage unavailable: fall back to memory */
  }
  const merged = { ...DEFAULT_PREFS, ...stored };
  // Before 0.3 the default was written out as 'lite-wasm'; treat that as "automatic" unless it was a deliberate choice.
  if (merged.flavor === 'lite-wasm' && !merged.flavorChosen) merged.flavor = 'auto';
  return merged;
}

export function getPrefs(): Prefs {
  cache ??= read();
  return cache;
}

export function setPrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...getPrefs(), ...patch };
  cache = next;
  memory = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore: preferences still work for this session */
  }
  listeners.forEach((l) => l());
  return next;
}

export function resetPrefs(): Prefs {
  cache = { ...DEFAULT_PREFS };
  memory = {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
  return cache;
}

export function subscribePrefs(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

export const BOARD_THEMES: Record<string, { label: string; light: string; dark: string }> = {
  green: { label: 'Green', light: '#eeeed2', dark: '#769656' },
  brown: { label: 'Brown', light: '#f0d9b5', dark: '#b58863' },
  dusk: { label: 'Dusk', light: '#d6dce8', dark: '#6f86a8' },
  walnut: { label: 'Walnut', light: '#ead9b8', dark: '#a9784b' },
  moss: { label: 'Moss', light: '#e4e8cf', dark: '#6f8f5e' },
  slate: { label: 'Slate', light: '#c9ced6', dark: '#59626f' },
  rose: { label: 'Rose', light: '#f1dcdc', dark: '#b97a86' },
  ink: { label: 'Ink', light: '#aeb6c2', dark: '#2f3b52' },
};
