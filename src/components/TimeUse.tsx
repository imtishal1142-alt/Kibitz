import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { timeReport } from '../lib/analysis/timeAnalysis';
import type { TimeTally } from '../lib/analysis/timeAnalysis';
import { formatClock } from '../lib/chess/rules';
import type { Color, GameAnalysis } from '../lib/types';

const GRADE_VAR: Record<string, string> = { brilliant: 'brilliant', great: 'great', best: 'best', excellent: 'excellent', good: 'good', book: 'book', inaccuracy: 'inaccuracy', miss: 'miss', mistake: 'mistake', blunder: 'blunder', forced: 'forced' };

/** Time per move for one side of a game, as bars coloured by the move's grade, with the written findings beside it. */
export function TimeUse({ analysis, color, onJump }: { analysis: GameAnalysis; color: Color; onJump?: (ply: number) => void }) {
  const r = useMemo(() => timeReport(analysis, color), [analysis, color]);
  if (!r.hasClocks) {
    return (
      <p className="muted small" style={{ margin: 0 }}>
        This game has no clock times, so time use cannot be read. Games imported from Chess.com carry them; games you play here with a clock do too.
      </p>
    );
  }
  const spent = r.moves.map((m) => m.spentMs ?? 0);
  const max = Math.max(1000, ...spent);
  const w = Math.max(240, r.moves.length * 9);
  const h = 70;
  const label = `Time spent on each of your ${r.moves.length} moves. Longest ${Math.round(max / 1000)} seconds, median ${r.medianMs === null ? 'unknown' : Math.round(r.medianMs / 1000)} seconds. Lowest clock ${formatClock(r.minClockMs ?? undefined)}.`;
  return (
    <div className="stack-sm">
      <div style={{ overflowX: 'auto' }}>
        <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w * 2, display: 'block' }} preserveAspectRatio="none">
          {r.moves.map((m, i) => {
            const bh = Math.max(1, ((m.spentMs ?? 0) / max) * (h - 4));
            return <rect key={m.ply} x={i * 9 + 1} y={h - bh} width={7} height={bh} rx={1} fill={`var(--g-${GRADE_VAR[m.cls] ?? 'good'})`} opacity={m.clockMs !== null && m.clockMs < 30_000 ? 1 : 0.75} />;
          })}
        </svg>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Bar height is time spent; colour is the move&apos;s grade.
      </p>
      <ul className="stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
        {r.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {r.rushedErrors.length && onJump ? (
        <div className="row small">
          <span className="muted">Mistakes made fast or low on time:</span>
          {r.rushedErrors.slice(0, 6).map((m) => (
            <button key={m.ply} type="button" className="btn btn-sm" onClick={() => onJump(m.ply)}>
              {Math.ceil(m.ply / 2)}
              {m.ply % 2 ? '.' : '...'}
              {m.san}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Across games: do your mistakes cluster in time trouble? */
export function TimeInsights({ tally }: { tally: TimeTally }) {
  if (tally.games === 0)
    return (
      <section className="stack-sm" aria-labelledby="time-h">
        <h2 id="time-h">Time use</h2>
        <p className="muted" style={{ margin: 0 }}>
          None of your analysed games has clock times yet. Chess.com imports carry them; games played here with a clock do too.
        </p>
      </section>
    );
  return (
    <section className="stack-sm" aria-labelledby="time-h">
      <h2 id="time-h">Time use</h2>
      <div className="sheet pad stack-sm">
        <p className="muted small" style={{ margin: 0 }}>
          From {tally.games} analysed game{tally.games === 1 ? '' : 's'} with clock times ({tally.moves} moves). Patterns only; a fast mistake may simply be a move you did not see.
        </p>
        <ul className="stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
          {tally.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <div>
          <Link className="btn btn-sm" to="/train/mistakes">
            Replay your mistakes
          </Link>
        </div>
      </div>
    </section>
  );
}
