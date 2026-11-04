// Pre-computes the explanations that the Desk, Session, Insights and Progress pages need, in small slices, so those pages open instantly instead of each computing thousands of explanations on the main thread.
import { useEffect, useState } from 'react';
import { explainMove } from '../lib/analysis/explain';
import { userMistakes } from '../lib/analysis/weaknesses';
import type { GameAnalysis, GameRecord } from '../lib/types';

interface Job {
  analysis: GameAnalysis;
  color: 'w' | 'b';
}

let generation = 0;
const done = new Set<string>();
let waiters: (() => void)[] = [];

function finish(): void {
  const w = waiters;
  waiters = [];
  w.forEach((f) => f());
}

// Slices of about 10 ms with a gap between them: a page waiting for the result gets it quickly, and input and animation still run between slices.
const idle = (cb: () => void): void => {
  setTimeout(cb, 0);
};

/** Warm the cache for these games. Calling it again with a newer list cancels the previous run; finished games are skipped. */
/** Resolves when every one of these games has been explained (immediately if they already were). A newer call takes over the work. */
export function warmExplanations(entries: { game: GameRecord; analysis: GameAnalysis }[]): Promise<void> {
  const p = new Promise<void>((resolve) => waiters.push(resolve));
  const mine = ++generation;
  const jobs: Job[] = [];
  for (const e of entries) {
    if (!e.game.userColor) continue;
    const key = `${e.analysis.gameId}|${e.analysis.positions.length}`;
    if (done.has(key)) continue;
    jobs.push({ analysis: e.analysis, color: e.game.userColor });
  }
  let i = 0;
  const step = () => {
    if (mine !== generation) return;
    const t0 = performance.now();
    while (i < jobs.length && performance.now() - t0 < 10) {
      const j = jobs[i++]!;
      try {
        for (const m of userMistakes(j.analysis, j.color)) explainMove(m, j.analysis);
        done.add(`${j.analysis.gameId}|${j.analysis.positions.length}`);
      } catch {
        /* a game that cannot be explained is simply skipped */
      }
    }
    if (i < jobs.length) idle(step);
    else finish();
  };
  if (jobs.length) idle(step);
  else finish();
  return p;
}

/** True once the explanation cache covers these games; the page can then build its weakness report without a long pause. */
export function useWarmReady(entries: { game: GameRecord; analysis: GameAnalysis }[] | undefined): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!entries) return;
    let live = true;
    void warmExplanations(entries).then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [entries]);
  return ready;
}
