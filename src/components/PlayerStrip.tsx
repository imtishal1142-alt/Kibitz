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
  avatarHue,
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
  /** Colour of the avatar tile (bots); players get a neutral tile. */
  avatarHue?: number;
}) {
  const low = clockMs !== null && clockMs !== undefined && clockMs < 10_000;
  return (
    <div className="strip">
      <span className={`strip-avatar strip-avatar-${color}`} aria-hidden="true" style={avatarHue === undefined ? undefined : { background: `hsl(${avatarHue} 42% 38%)`, color: '#fff' }}>
        {name.trim().slice(0, 1).toUpperCase() || '?'}
      </span>
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
