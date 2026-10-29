import { useCallback, useSyncExternalStore } from 'react';
import { getPrefs, setPrefs, subscribePrefs } from '../lib/storage/prefs';
import type { Prefs } from '../lib/storage/prefs';

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => void] {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getPrefs);
  const update = useCallback((patch: Partial<Prefs>) => void setPrefs(patch), []);
  return [prefs, update];
}
