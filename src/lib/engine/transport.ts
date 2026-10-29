// Browser transport (Web Worker) and engine discovery. The engine files are static assets
// copied into /engines by `npm run prepare-assets`.
import type { TransportFactory, UciTransport } from './engine';

export class WorkerTransport implements UciTransport {
  private worker: Worker;
  private lineCb: ((line: string) => void) | null = null;
  private errCb: ((err: Error) => void) | null = null;

  constructor(url: string) {
    this.worker = new Worker(url);
    this.worker.onmessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (typeof data === 'string') this.lineCb?.(data);
      else if (data && typeof data === 'object' && typeof (data as { data?: unknown }).data === 'string') this.lineCb?.((data as { data: string }).data);
    };
    this.worker.onerror = (ev: ErrorEvent) => {
      ev.preventDefault();
      this.errCb?.(new Error(ev.message || `Engine worker failed to load (${url})`));
    };
    this.worker.onmessageerror = () => this.errCb?.(new Error('Engine worker sent an unreadable message.'));
  }
  send(command: string): void {
    this.worker.postMessage(command);
  }
  onLine(cb: (line: string) => void): void {
    this.lineCb = cb;
  }
  onError(cb: (err: Error) => void): void {
    this.errCb = cb;
  }
  terminate(): void {
    this.lineCb = null;
    this.worker.terminate();
  }
}

export interface EngineFlavor {
  id: string;
  label: string;
  js: string;
  wasm: boolean;
  /** Uses worker threads (needs SharedArrayBuffer, so a cross-origin-isolated page). */
  threads?: boolean;
  note: string;
  bytes: number;
}

export interface EngineManifest {
  stockfishVersion: string;
  buildVersion: string;
  license: string;
  flavors: EngineFlavor[];
}

export const FALLBACK_MANIFEST: EngineManifest = {
  stockfishVersion: '19',
  buildVersion: '19',
  license: 'GPL-3.0',
  flavors: [
    { id: 'lite-wasm', label: 'Stockfish 19 Lite (WebAssembly)', js: 'stockfish-19-lite-single.js', wasm: true, note: '', bytes: 0 },
    { id: 'asm', label: 'Stockfish 19 (asm.js fallback)', js: 'stockfish-19-asm.js', wasm: false, note: '', bytes: 0 },
  ],
};

export function engineBaseUrl(): string {
  const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/';
  return new URL('engines/', base).href;
}

export function hasWebAssembly(): boolean {
  return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
}

let manifestPromise: Promise<EngineManifest> | null = null;

export function loadManifest(): Promise<EngineManifest> {
  manifestPromise ??= fetch(new URL('manifest.json', engineBaseUrl()).href, { cache: 'no-cache' })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<EngineManifest>;
    })
    .catch(() => FALLBACK_MANIFEST);
  return manifestPromise;
}

/** Can this page run a multi-threaded engine? It needs SharedArrayBuffer, which browsers allow only on isolated pages. */
export function threadsOk(): boolean {
  return typeof SharedArrayBuffer !== 'undefined' && (typeof crossOriginIsolated === 'undefined' || crossOriginIsolated === true);
}

export function cores(): number {
  return typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
}

/**
 * Choose the engine build. "auto" takes the multi-threaded Lite build when the page is isolated and the computer has at
 * least 3 cores, and the single-threaded one otherwise. A build that cannot run here is never picked.
 */
export function pickFlavor(manifest: EngineManifest, preferred: string | undefined, wasmOk = hasWebAssembly(), mtOk = threadsOk(), coreCount = cores()): EngineFlavor {
  const usable = manifest.flavors.filter((f) => (wasmOk || !f.wasm) && (mtOk || !f.threads));
  const list = usable.length ? usable : manifest.flavors;
  if (preferred === 'auto' || preferred === undefined) {
    const mt = list.find((f) => f.threads);
    if (mt && coreCount >= 3) return mt;
    return list.find((f) => f.id === 'lite-wasm') ?? list[0]!;
  }
  return list.find((f) => f.id === preferred) ?? list.find((f) => f.id === 'lite-wasm') ?? list[0]!;
}

export type BatchSlot = 'batch' | 'batch2' | 'batch3' | 'batch4';
export const BATCH_SLOTS: BatchSlot[] = ['batch', 'batch2', 'batch3', 'batch4'];
export const isBatchSlot = (slot: string): slot is BatchSlot => slot.startsWith('batch');

/** How many games the background queue analyses at once. `pref` 0 means automatic: more cores, more games. */
export function workerCount(pref: number, coreCount = cores()): number {
  if (pref >= 1) return Math.min(4, Math.max(1, Math.floor(pref)));
  if (coreCount >= 12) return 4;
  if (coreCount >= 8) return 3;
  if (coreCount >= 4) return 2;
  return 1;
}

/** Threads to give an engine in a given slot, so that the engines running together do not fight over the cores. */
export function threadsFor(slot: 'live' | 'a' | 'b' | BatchSlot, coreCount = cores(), workers = 1): number {
  const free = Math.max(1, coreCount - 1);
  if (isBatchSlot(slot)) return Math.max(1, Math.min(4, Math.floor(free / Math.max(1, workers))));
  return Math.max(1, Math.min(2, Math.floor(free / 2)));
}

export function workerTransportFactory(flavor: EngineFlavor): TransportFactory {
  const url = new URL(flavor.js, engineBaseUrl()).href;
  return () => new WorkerTransport(url);
}
