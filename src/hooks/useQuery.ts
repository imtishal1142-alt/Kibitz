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
export function useQuery<T>(fn: () => Promise<T>, topics: StoreName[], deps: unknown[] = []): QueryState<T> {
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
  useEffect(
    () =>
      subscribeChanges((changed) => {
        if (topics.some((t) => changed.has(t))) load();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [load, key],
  );
  return { data, loading, error, reload: load };
}
