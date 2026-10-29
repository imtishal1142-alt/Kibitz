import { formatClock } from '../lib/chess/rules';
import type { Color } from '../lib/types';

export function PlayerStrip({
  name,
  rating,
  color,
  clockMs,
  running,
  captured,
  balance,
  note,
}: {
  name: string;
  rating?: number | string;
  color: Color;
  clockMs?: number | null;
  running?: boolean;
  captured?: string[];
  /** Material lead for this side in pawns (shown as +3). */
  balance?: number;
  note?: string;
}) {
  const low = clockMs !== null && clockMs !== undefined && clockMs < 10_000;
  return (
    <div className="strip">
      <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 4, border: '1.5px solid var(--ink-3)', background: color === 'w' ? '#fff' : '#1c2438', flex: 'none' }} />
      <div className="grow">
        <div className="strip-name ellipsis">
          {name}
          {rating ? <span className="muted" style={{ fontWeight: 400 }}> ({rating})</span> : null}
          {note ? <span className="chip" style={{ marginLeft: 8 }}>{note}</span> : null}
        </div>
        <div className="captured" aria-label={captured?.length ? `Captured: ${captured.length} pieces` : undefined}>
          {captured?.join('')}
          {balance && balance > 0 ? <span className="small" style={{ letterSpacing: 0, marginLeft: 6 }}>+{balance}</span> : null}
        </div>
      </div>
      {clockMs !== null && clockMs !== undefined ? (
        <span className={`clock ${running ? (low ? 'clock-low' : 'clock-run') : ''}`} role="timer" aria-label={`${color === 'w' ? 'White' : 'Black'} clock ${formatClock(clockMs)}`}>
          {formatClock(clockMs)}
        </span>
      ) : null}
    </div>
  );
}
