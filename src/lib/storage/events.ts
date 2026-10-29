// Change notifications for the local database, so open screens refresh after a write, including
// writes made in another tab of the same browser (BroadcastChannel).
import type { StoreName } from './db';

type Listener = (topics: ReadonlySet<StoreName>) => void;
const listeners = new Set<Listener>();
let pending = new Set<StoreName>();
let scheduled = false;
let channel: BroadcastChannel | null = null;
const tabId = Math.random().toString(36).slice(2);

function ensureChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  try {
    channel = new BroadcastChannel('kibitz-data');
    channel.onmessage = (e: MessageEvent<{ from: string; topics: StoreName[] }>) => {
      if (e.data?.from !== tabId) deliver(new Set(e.data.topics));
    };
  } catch {
    channel = null;
  }
  return channel;
}

function deliver(topics: ReadonlySet<StoreName>): void {
  for (const l of [...listeners]) {
    try {
      l(topics);
    } catch {
      /* a broken listener must not stop the others */
    }
  }
}

/** Tell the app that these stores changed. Calls within one tick are batched. */
export function notify(...topics: StoreName[]): void {
  for (const t of topics) pending.add(t);
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    const batch = pending;
    pending = new Set();
    deliver(batch);
    ensureChannel()?.postMessage({ from: tabId, topics: [...batch] });
  });
}

export function subscribeChanges(cb: Listener): () => void {
  ensureChannel();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
