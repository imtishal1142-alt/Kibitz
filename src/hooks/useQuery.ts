import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoreName } from '../lib/storage/db';
import { subscribeChanges } from '../lib/storage/events';

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error?: string;
  reload: () => void;
}

/**
 * Read from IndexedDB and refresh whenever one of `topics` changes (in this tab or another).
 * `fn` must be stable per `deps`.
 */
export function useQuery<T>(fn: () => Promise<T>, topics: StoreName[], deps: unknown[] = [], opts: { batchMs?: number } = {}): QueryState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const run = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const load = useCallback(() => {
    const id = ++run.current;
    fnRef.current().then(
      (d) => {
        if (id !== run.current) return;
        setData(d);
        setError(undefined);
        setLoading(false);
      },
      (e) => {
        if (id !== run.current) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
    const counter = run;
    return () => {
      counter.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, ...deps]);

  const key = topics.join(',');
  // Reading every analysis is expensive, and the background queue changes them every few seconds: queries that ask
  // for it (`batchMs`) are batched into one read per interval, so a long analysis run does not keep the page busy.
  const heavy = (opts.batchMs ?? 0) > 0;
  const batchMs = opts.batchMs ?? 0;
  useEffect(() => {
    let timer: number | undefined;
    const off = subscribeChanges((changed) => {
      if (!topics.some((t) => changed.has(t))) return;
      if (!heavy) return load();
      if (timer === undefined) timer = window.setTimeout(() => { timer = undefined; load(); }, batchMs);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [load, key, heavy],
  );
  return { data, loading, error, reload: load };
}
