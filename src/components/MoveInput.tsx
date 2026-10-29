import { useState } from 'react';
import { resolveMove } from '../lib/chess/rules';
import { Icon } from './Icon';

/** Keyboard move entry: type "Nf3", "e4" or "e2e4" and press Enter. This is the keyboard-only way to play. */
export function MoveInput({ fen, onMove, disabled, label = 'Type a move' }: { fen: string; onMove: (m: { san: string; uci: string }) => void; disabled?: boolean; label?: string }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    const r = resolveMove(fen, t);
    if (!r) {
      setError(`"${t}" is not a legal move here.`);
      return;
    }
    setError('');
    setText('');
    onMove({ san: r.san, uci: r.uci });
  };
  return (
    <form onSubmit={submit} className="stack-sm" aria-label="Move entry">
      <div className="ghost-input">
        <input className="input" value={text} onChange={(e) => (setText(e.target.value), setError(''))} placeholder={label} aria-label={label} aria-invalid={!!error} aria-describedby={error ? 'move-input-error' : undefined} autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={disabled} />
        <button className="btn" type="submit" disabled={disabled || !text.trim()}>
          <Icon name="check" /> Play
        </button>
      </div>
      {error ? (
        <span id="move-input-error" className="small" style={{ color: 'var(--bad)' }} role="alert">
          {error}
        </span>
      ) : null}
    </form>
  );
}
