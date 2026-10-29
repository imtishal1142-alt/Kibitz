// Engine hub. The app talks to at most four Stockfish instances, each in its own Web Worker:
//   live   - analysis board, hints, move grading
//   batch, batch2..4 - game analysis queue and puzzle generation (one engine per game analysed at once)
//   a, b   - the two sides of a game against the engine or an engine match (independent settings)
// Engines start lazily, are restarted transparently after a crash, and are rebuilt when the user
// changes the engine flavour or hash size. If WebAssembly is unavailable (or the WASM build fails
// to start) the hub falls back to the slower asm.js build and says so.
import { Engine, EngineError } from '../lib/engine/engine';
import { BATCH_SLOTS, isBatchSlot, loadManifest, pickFlavor, threadsFor, workerCount, workerTransportFactory } from '../lib/engine/transport';
import type { EngineFlavor, EngineManifest } from '../lib/engine/transport';
import { getPrefs, subscribePrefs } from '../lib/storage/prefs';
import { createStore } from './store';

export type SlotId = 'live' | 'batch' | 'batch2' | 'batch3' | 'batch4' | 'a' | 'b';
export const SLOT_IDS: SlotId[] = ['live', ...BATCH_SLOTS, 'a', 'b'];

export interface SlotState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  name?: string;
  flavor?: EngineFlavor;
  error?: string;
  /** Set when the hub switched to a different build than the one selected in Settings. */
  note?: string;
}

const idle: SlotState = { status: 'idle' };
export const engineStates = createStore<Record<SlotId, SlotState>>({ live: idle, batch: idle, batch2: idle, batch3: idle, batch4: idle, a: idle, b: idle });

const engines: Partial<Record<SlotId, Engine>> = {};
const starting: Partial<Record<SlotId, Promise<Engine>>> = {};
const FULL_STRENGTH = { UCI_LimitStrength: false, 'Skill Level': 20 } as const;

function setState(slot: SlotId, s: SlotState): void {
  engineStates.set((all) => ({ ...all, [slot]: s }));
}

async function startOn(flavor: EngineFlavor, slot: SlotId): Promise<Engine> {
  const prefs = getPrefs();
  return Engine.start(workerTransportFactory(flavor), { initTimeoutMs: 30_000, stallMs: 30_000, options: { Hash: prefs.hashMb, ...(flavor.threads ? { Threads: threadsFor(slot, undefined, workerCount(prefs.analysisWorkers)) } : {}), ...FULL_STRENGTH } });
}

function explain(e: unknown): string {
  if (e instanceof EngineError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

/** Get (starting if necessary) the engine for a slot. */
export function getEngine(slot: SlotId): Promise<Engine> {
  const have = engines[slot];
  if (have && !have.isDead) return Promise.resolve(have);
  const pending = starting[slot];
  if (pending) return pending;
  setState(slot, { status: 'loading' });
  const p = (async () => {
    let manifest: EngineManifest;
    try {
      manifest = await loadManifest();
    } catch (e) {
      throw new EngineError('init-failed', explain(e));
    }
    const prefs = getPrefs();
    const wanted = pickFlavor(manifest, isBatchSlot(slot) && prefs.reviewFlavor !== 'same' ? prefs.reviewFlavor : prefs.flavor);
    let note: string | undefined;
    let flavor = wanted;
    let engine: Engine;
    try {
      engine = await startOn(wanted, slot);
    } catch (first) {
      const fallback = manifest.flavors.find((f) => f.id === 'lite-wasm' && f.id !== wanted.id) ?? manifest.flavors.find((f) => !f.wasm && f.id !== wanted.id);
      if (!fallback) throw first;
      engine = await startOn(fallback, slot).catch(() => {
        throw first;
      });
      flavor = fallback;
      note = `${wanted.label} did not start (${explain(first)}), so ${fallback.label} is being used instead.`;
    }
    engine.tag = flavor.id;
    engines[slot] = engine;
    setState(slot, { status: 'ready', name: engine.info.name, flavor, note });
    return engine;
  })()
    .catch((e) => {
      setState(slot, { status: 'error', error: explain(e) });
      throw e;
    })
    .finally(() => {
      delete starting[slot];
    });
  starting[slot] = p;
  return p;
}

/** Stop and dispose one engine (it restarts the next time something asks for it). */
export function releaseEngine(slot: SlotId): void {
  engines[slot]?.dispose();
  delete engines[slot];
  delete starting[slot];
  setState(slot, idle);
}

export function releaseAll(): void {
  for (const s of SLOT_IDS) releaseEngine(s);
}

/** Restart a slot after an error (used by the "Restart engine" button). */
export async function restartEngine(slot: SlotId): Promise<Engine> {
  releaseEngine(slot);
  return getEngine(slot);
}

/** Stop a slot's search without discarding the engine. */
export function stopSearch(slot: SlotId): void {
  engines[slot]?.stop();
}

export function peekEngine(slot: SlotId): Engine | undefined {
  return engines[slot];
}

// Rebuild engines when the flavour or the hash size changes.
let lastKey = '';
if (typeof window !== 'undefined') {
  const key = () => `${getPrefs().flavor}|${getPrefs().reviewFlavor}|${getPrefs().hashMb}|${getPrefs().analysisWorkers}`;
  lastKey = key();
  subscribePrefs(() => {
    const k = key();
    if (k !== lastKey) {
      lastKey = k;
      releaseAll();
    }
  });
}
