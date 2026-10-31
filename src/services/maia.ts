// Client for the Maia worker: asks for move probabilities and picks a move.
import { sampleMove, nearestMaia } from '../lib/engine/maia';
import type { MovePrior } from '../lib/engine/lc0net';
import type { GameSession } from '../lib/play/session';

let worker: Worker | null = null;
let counter = 0;
const waiting = new Map<number, { ok: (p: MovePrior[]) => void; fail: (e: Error) => void }>();

function ensure(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/maia.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent<{ id: number; priors?: MovePrior[]; error?: string }>) => {
    const w = waiting.get(ev.data.id);
    if (!w) return;
    waiting.delete(ev.data.id);
    if (ev.data.error) w.fail(new Error(ev.data.error));
    else w.ok(ev.data.priors ?? []);
  };
  worker.onerror = (ev) => {
    for (const w of waiting.values()) w.fail(new Error(ev.message || 'The Maia worker failed to start.'));
    waiting.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

export const maiaUrl = (rating: number): string => new URL(`maia/maia-${nearestMaia(rating)}.pb.gz`, document.baseURI).href;

export function maiaPriors(rating: number, fens: string[]): Promise<MovePrior[]> {
  const id = ++counter;
  return new Promise((ok, fail) => {
    waiting.set(id, { ok, fail });
    ensure().postMessage({ id, url: maiaUrl(rating), fens: fens.slice(0, 8) });
  });
}

/** The move a Maia network of this rating plays in the session's current position (null if there is none). */
export async function maiaMove(session: GameSession, rating: number): Promise<string | null> {
  return sampleMove(await maiaPriors(rating, session.recentFens(8)));
}

export function stopMaia(): void {
  worker?.terminate();
  worker = null;
  for (const w of waiting.values()) w.fail(new Error('cancelled'));
  waiting.clear();
}
