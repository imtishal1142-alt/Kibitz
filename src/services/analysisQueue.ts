// Background analysis: one queue, one engine per game analysed at once (the 'batch' slots), progress and cancel.
// Finished games are saved one by one, so cancelling or closing the tab never loses completed work.
import { AnalysisCancelled, analyzeGame, idbEvalCache } from '../lib/analysis/gameAnalysis';
import { PRESETS, getPrefs } from '../lib/storage/prefs';
import type { PresetId } from '../lib/storage/prefs';
import { bumpCalendar, getAnalysis, getGame, listPuzzles, putPuzzles, saveAnalysis, pruneEvalCache } from '../lib/storage/repos';
import { generatePuzzles } from '../lib/training/puzzles';
import { BATCH_SLOTS, workerCount } from '../lib/engine/transport';
import { getEngine } from './engines';
import type { SlotId } from './engines';
import { createStore } from './store';
import { toast } from './toast';

export interface QueueState {
  running: boolean;
  phase: 'idle' | 'analysing' | 'puzzles' | 'done' | 'cancelled' | 'error';
  total: number;
  done: number;
  /** Games being analysed right now. */
  active: number;
  current?: { gameId: string; label: string; positions: number; positionsTotal: number };
  depth: number;
  puzzlesAdded: number;
  errors: { gameId: string; message: string }[];
  finishedAt?: number;
}

const fresh = (): QueueState => ({ running: false, phase: 'idle', total: 0, done: 0, depth: PRESETS[getPrefs().analysisPreset].depth, puzzlesAdded: 0, errors: [], active: 0 });
export const queueState = createStore<QueueState>(fresh());

let pending: string[] = [];
/** Games a worker has taken but not finished, so a second request for the same game is ignored. */
const inFlight = new Set<string>();
let controller: AbortController | null = null;
let options: { preset: PresetId; puzzles: boolean; force: boolean } = { preset: 'standard', puzzles: true, force: false };

export interface EnqueueOptions {
  preset?: PresetId;
  /** Also create puzzles from the user's mistakes once a game is analysed (default true). */
  puzzles?: boolean;
  /** Re-analyse games that already have an analysis. */
  force?: boolean;
}

export function enqueueAnalysis(ids: string[], opts: EnqueueOptions = {}): void {
  const unique = ids.filter((id, i) => ids.indexOf(id) === i && !pending.includes(id) && !inFlight.has(id));
  if (!unique.length) return;
  pending.push(...unique);
  queueState.set((s) => ({ ...s, total: s.total + unique.length }));
  if (!queueState.get().running) {
    options = { preset: opts.preset ?? getPrefs().analysisPreset, puzzles: opts.puzzles ?? true, force: opts.force ?? false };
    void run();
  }
}

export function cancelQueue(): void {
  pending = [];
  controller?.abort();
}

export function resetQueueState(): void {
  if (!queueState.get().running) queueState.set(fresh());
}

async function run(): Promise<void> {
  controller = new AbortController();
  const signal = controller.signal;
  const preset = PRESETS[options.preset];
  queueState.set({ ...fresh(), running: true, phase: 'analysing', total: pending.length, depth: preset.depth });
  let analysedAny = false;
  try {
    // One engine per game analysed at once. A slot that fails to start is skipped as long as one works.
    const wanted = Math.min(workerCount(getPrefs().analysisWorkers), Math.max(1, pending.length));
    const slots: SlotId[] = BATCH_SLOTS.slice(0, wanted);
    const started = await Promise.allSettled(slots.map((slot) => getEngine(slot)));
    const engines = started.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    if (!engines.length) throw (started[0] as PromiseRejectedResult).reason;

    const work = async (engine: (typeof engines)[number]): Promise<void> => {
      while (pending.length && !signal.aborted) {
        const id = pending.shift()!;
        inFlight.add(id);
        try {
          const game = await getGame(id);
          if (!game) {
            queueState.set((s) => ({ ...s, done: s.done + 1 }));
            continue;
          }
          const label = `${game.white} vs ${game.black}`;
          queueState.set((s) => ({ ...s, active: s.active + 1, current: { gameId: id, label, positions: 0, positionsTotal: game.plies + 1 } }));
          try {
            const existing = await getAnalysis(id);
            if (existing && !options.force && existing.depth >= preset.depth) {
              queueState.set((s) => ({ ...s, done: s.done + 1 }));
              continue;
            }
            const analysis = await analyzeGame(game, engine, {
              depth: preset.depth,
              multipv: preset.multipv,
              cache: idbEvalCache,
              signal,
              onProgress: (p) => queueState.set((s) => ({ ...s, current: { gameId: id, label, positions: p.done, positionsTotal: p.total } })),
            });
            if (!analysis) return; // cancelled
            await saveAnalysis(analysis);
            await bumpCalendar({ gamesAnalyzed: 1 });
            analysedAny = true;
            if (options.puzzles && game.userColor && game.source !== 'demo') {
              queueState.set((s) => ({ ...s, phase: 'puzzles' }));
              const existingIds = new Set((await listPuzzles()).map((p) => p.id));
              const res = await generatePuzzles(engine, [{ game, analysis }], { depth: 16, cache: idbEvalCache, signal, existingIds, perGame: 5 });
              const added = await putPuzzles(res.puzzles);
              queueState.set((s) => ({ ...s, phase: 'analysing', puzzlesAdded: s.puzzlesAdded + added }));
            }
          } catch (e) {
            if (e instanceof AnalysisCancelled || signal.aborted) return;
            queueState.set((s) => ({ ...s, errors: [...s.errors, { gameId: id, message: e instanceof Error ? e.message : String(e) }] }));
            if (e instanceof Error && /engine/i.test(e.name)) return; // this engine is gone: stop it rather than fail every game
          } finally {
            queueState.set((s) => ({ ...s, active: Math.max(0, s.active - 1) }));
          }
          queueState.set((s) => ({ ...s, done: s.done + 1 }));
        } finally {
          inFlight.delete(id);
        }
      }
    };
    await Promise.all(engines.map(work));

    const cancelled = signal.aborted;
    queueState.set((s) => ({ ...s, running: false, phase: cancelled ? 'cancelled' : s.errors.length && !analysedAny ? 'error' : 'done', current: undefined, active: 0, finishedAt: Date.now() }));
    if (analysedAny) void pruneEvalCache();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    queueState.set((s) => ({ ...s, running: false, phase: 'error', errors: [...s.errors, { gameId: '', message }], current: undefined, active: 0, finishedAt: Date.now() }));
    toast.error(`Analysis could not start: ${message}`);
  } finally {
    pending = [];
    inFlight.clear();
    controller = null;
  }
}
