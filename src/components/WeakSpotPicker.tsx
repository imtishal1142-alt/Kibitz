import { useMemo } from 'react';
import { weakSpots } from '../lib/training/weakspots';
import { gameDateText } from '../lib/ui/format';
import { usePersonalEntries } from '../hooks/data';
import { Field } from './ui';
import type { Color } from '../lib/types';

/** Start a practice game from a position where you went wrong in one of your own games. */
export function WeakSpotPicker({ onPick }: { onPick: (fen: string, color: Color) => void }) {
  const { entries } = usePersonalEntries();
  const spots = useMemo(() => (entries ? weakSpots(entries, 12) : []), [entries]);
  if (spots.length === 0) return null;
  return (
    <details>
      <summary className="small" style={{ cursor: 'pointer' }}>
        Start from one of your mistakes ({spots.length})
      </summary>
      <div style={{ marginTop: 10 }}>
        <Field label="Position" htmlFor="play-weak" hint="Positions that were still balanced before your mistake, biggest loss first. You get the side you had, and can try to play it better.">
          <select
            id="play-weak"
            className="select"
            defaultValue=""
            onChange={(e) => {
              const s = spots.find((x) => x.key === e.target.value);
              if (s) onPick(s.fen, s.color);
            }}
          >
            <option value="" disabled>
              Choose a position…
            </option>
            {spots.map((s) => {
              const g = entries?.find((e) => e.game.id === s.gameId)?.game;
              return (
                <option key={s.key} value={s.key}>
                  {`${s.label} (−${s.winLoss.toFixed(0)} pts)${s.opponent ? `, vs ${s.opponent}` : ''}${g ? `, ${gameDateText(g)}` : ''}`}
                </option>
              );
            })}
          </select>
        </Field>
      </div>
    </details>
  );
}
