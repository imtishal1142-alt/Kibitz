import { useCallback, useEffect, useRef, useState } from 'react';
import { EngineError } from '../lib/engine/engine';
import { terminalState } from '../lib/chess/rules';
import type { SearchLine } from '../lib/types';
import { getEngine, restartEngine, stopSearch } from '../services/engines';

export interface LiveAnalysis {
  lines: SearchLine[];
  depth: number;
  status: 'idle' | 'loading' | 'thinking' | 'done' | 'terminal' | 'error';
  error?: string;
  nps?: number;
  restart: () => void;
}

/**
 * Continuous engine analysis of one position. A new FEN cancels the previous search (the engine
 * itself guarantees stale results are discarded). Results are White-perspective, best first.
 */
export function useLiveAnalysis(fen: string | null, opts: { enabled: boolean; depth: number; multipv: number }): LiveAnalysis {
  const [state, setState] = useState<Omit<LiveAnalysis, 'restart'>>({ lines: [], depth: 0, status: 'idle' });
  const token = useRef(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const my = ++token.current;
    if (!fen || !opts.enabled) {
      setState({ lines: [], depth: 0, status: 'idle' });
      return;
    }
    if (terminalState(fen).over) {
      setState({ lines: [], depth: 0, status: 'terminal' });
      return;
    }
    setState((s) => ({ ...s, status: 'loading', error: undefined }));
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const engine = await getEngine('live');
          if (my !== token.current) return;
          setState((s) => ({ ...s, status: 'thinking' }));
          const res = await engine.search({
            fen,
            depth: opts.depth,
            multipv: opts.multipv,
            onInfo: (snap) => {
              if (my === token.current) setState({ lines: snap.lines, depth: snap.depth, status: 'thinking', nps: snap.nps });
            },
          });
          if (my !== token.current || res.cancelled) return;
          setState({ lines: res.lines, depth: res.depth, status: 'done', nps: res.nps });
        } catch (e) {
          if (my !== token.current) return;
          if (e instanceof EngineError && e.code === 'disposed') return;
          setState((s) => ({ ...s, status: 'error', error: e instanceof Error ? e.message : String(e) }));
        }
      })();
    }, 120);
    return () => {
      clearTimeout(timer);
    };
  }, [fen, opts.enabled, opts.depth, opts.multipv, nonce]);

  useEffect(
    () => () => {
      token.current++;
      stopSearch('live');
    },
    [],
  );

  const restart = useCallback(() => {
    void restartEngine('live')
      .catch(() => undefined)
      .finally(() => setNonce((n) => n + 1));
  }, []);

  return { ...state, restart };
}
