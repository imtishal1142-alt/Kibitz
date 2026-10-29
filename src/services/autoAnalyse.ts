// Automatic background analysis: games of yours that have no analysis yet are queued, newest first, a few seconds after
// the app opens and again after games are added. It is a setting (on by default) and it stays out of the way when the
// browser asks for data saving or the battery is low.
import { PRESETS, getPrefs } from '../lib/storage/prefs';
import { listAnalyses, listGames } from '../lib/storage/repos';
import { subscribeChanges } from '../lib/storage/events';
import { enqueueAnalysis } from './analysisQueue';

interface BatteryLike {
  level: number;
  charging: boolean;
}
type NavigatorExtras = Navigator & { connection?: { saveData?: boolean }; getBattery?: () => Promise<BatteryLike> };

async function shouldHold(): Promise<boolean> {
  const nav = navigator as NavigatorExtras;
  if (nav.connection?.saveData) return true;
  try {
    const b = await nav.getBattery?.();
    if (b && !b.charging && b.level < 0.2) return true;
  } catch {
    /* no battery information: carry on */
  }
  return false;
}

/** Ids of the games to queue: your own newest games (up to the limit in Settings) that lack an analysis at the current depth. */
export async function gamesToAutoAnalyse(limit: number): Promise<string[]> {
  const prefs = getPrefs();
  const [games, analyses] = await Promise.all([listGames(), listAnalyses()]);
  const depth = PRESETS[prefs.analysisPreset].depth;
  const done = new Set(analyses.filter((a) => a.depth >= depth).map((a) => a.gameId));
  const mine = games.filter((g) => g.userColor && g.source !== 'demo' && g.rules !== 'chess960');
  const newest = limit > 0 ? mine.slice(0, limit) : mine;
  return newest.filter((g) => !done.has(g.id)).map((g) => g.id);
}

export async function runAutoAnalyse(): Promise<number> {
  const prefs = getPrefs();
  if (!prefs.autoAnalyse || !prefs.onboarded) return 0;
  if (await shouldHold()) return 0;
  const ids = await gamesToAutoAnalyse(prefs.autoAnalyseLimit);
  if (ids.length) enqueueAnalysis(ids, { puzzles: true });
  return ids.length;
}

/** Start watching: one pass shortly after start-up, then a pass a few seconds after the games change. Returns a stop function. */
export function startAutoAnalyse(): () => void {
  let timer: number | undefined;
  const later = (ms: number) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void runAutoAnalyse().catch(() => undefined), ms);
  };
  later(5000);
  const off = subscribeChanges((changed) => {
    if (changed.has('games')) later(4000);
  });
  return () => {
    window.clearTimeout(timer);
    off();
  };
}
