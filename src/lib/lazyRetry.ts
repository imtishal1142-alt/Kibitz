// A page that cannot load is almost always one of two things: a file of the page was replaced by a newer
// deploy while a tab was still open (so the old file name no longer exists), or the network dropped for a moment.
// `lazyRetry` tries again once; if that fails it clears the stored copies of the app and reloads once, which fetches
// the current version. A guard stops this from looping: after one automatic reload it shows the normal error screen.
import { lazy } from 'react';
import type { ComponentType } from 'react';

const GUARD_KEY = 'kibitz.reloaded';
const GUARD_MS = 60_000;

export const isChunkError = (e: unknown): boolean => {
  const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /dynamically imported module|importing a module script failed|loading chunk|loading css chunk|failed to fetch/i.test(m);
};

/** Delete the service worker and its stored files so the next load comes from the network. */
export async function clearAppCaches(): Promise<void> {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await caches?.keys?.()) ?? [];
    await Promise.all(keys.filter((k) => k.startsWith('kibitz-')).map((k) => caches.delete(k)));
  } catch {
    /* nothing to clear, or storage is blocked */
  }
}

/** Reload once to pick up a new version. Returns false when it already did so a moment ago (to avoid a loop). */
export async function reloadForNewVersion(): Promise<boolean> {
  try {
    const last = Number(sessionStorage.getItem(GUARD_KEY) ?? 0);
    if (Date.now() - last < GUARD_MS) return false;
    sessionStorage.setItem(GUARD_KEY, String(Date.now()));
  } catch {
    /* storage blocked: reload without the guard once */
  }
  await clearAppCaches();
  location.reload();
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (first) {
      if (!isChunkError(first)) throw first;
      await new Promise((r) => setTimeout(r, 600));
      try {
        return await factory();
      } catch (second) {
        if (isChunkError(second) && (await reloadForNewVersion())) return new Promise<never>(() => undefined); // page is reloading
        throw second;
      }
    }
  });
}
