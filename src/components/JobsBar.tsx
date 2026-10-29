import { Link } from 'react-router-dom';
import { cancelQueue, queueState } from '../services/analysisQueue';
import { cancelChessComSync, chesscomJob } from '../services/chesscomJob';
import { useStore } from '../services/store';
import { Progress } from './ui';

/** Shown on every screen while a background job runs, so progress and Cancel are always reachable. */
export function JobsBar() {
  const q = useStore(queueState);
  const c = useStore(chesscomJob);
  if (!q.running && !c.running) return null;
  const qFrac = q.total ? (q.done + (q.current ? q.current.positions / Math.max(1, q.current.positionsTotal) : 0)) / q.total : 0;
  return (
    <div className="stack-sm" style={{ marginBottom: 16 }} role="status" aria-live="polite">
      {q.running ? (
        <div className="sheet pad-sm">
          <div className="spread">
            <span className="small">
              <strong>{q.phase === 'puzzles' ? 'Building puzzles' : 'Analysing games'}</strong> {Math.min(q.done + 1, q.total)} of {q.total}
              {q.current ? <span className="muted"> · {q.current.label}</span> : null}{q.active > 1 ? <span className="muted"> · {q.active} games at once</span> : null} <span className="faint">(depth {q.depth})</span>
            </span>
            <button className="btn btn-sm" onClick={cancelQueue} type="button">
              Cancel
            </button>
          </div>
          <Progress value={qFrac} label="Analysis progress" />
        </div>
      ) : null}
      {c.running ? (
        <div className="sheet pad-sm">
          <div className="spread">
            <span className="small">
              <strong>Importing from Chess.com</strong> for {c.username}
              {c.progress ? (
                <span className="muted">
                  {' '}
                  · {c.progress.phase === 'games' ? `month ${Math.min(c.progress.archiveIndex + 1, c.progress.archiveTotal)} of ${c.progress.archiveTotal}${c.progress.month ? ` (${c.progress.month})` : ''}` : c.progress.phase} · {c.progress.added} new
                </span>
              ) : null}{' '}
              <Link to="/chesscom">Details</Link>
            </span>
            <button className="btn btn-sm" onClick={cancelChessComSync} type="button">
              Cancel
            </button>
          </div>
          <Progress value={c.progress && c.progress.archiveTotal ? c.progress.archiveIndex / c.progress.archiveTotal : 0} label="Import progress" />
        </div>
      ) : null}
    </div>
  );
}
