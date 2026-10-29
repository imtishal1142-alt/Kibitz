import { Field } from './ui';
import { gameDateText, gameTitle } from '../lib/ui/format';
import type { GameRecord } from '../lib/types';

/** A labelled drop-down of saved games, newest first. */
export function GamePicker({ games, value, onChange, id, label = 'Game', hint }: { games: GameRecord[]; value: string; onChange: (id: string) => void; id: string; label?: string; hint?: string }) {
  const sorted = [...games].sort((a, b) => b.endTime - a.endTime);
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a game…</option>
        {sorted.map((g) => (
          <option key={g.id} value={g.id}>
            {g.source === 'demo' ? '[Demo] ' : ''}
            {gameTitle(g)} · {gameDateText(g)}
          </option>
        ))}
      </select>
    </Field>
  );
}
