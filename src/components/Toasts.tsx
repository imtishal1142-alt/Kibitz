import { dismiss, toasts } from '../services/toast';
import { useStore } from '../services/store';
import { Icon } from './Icon';

export function Toasts() {
  const list = useStore(toasts);
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {list.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <span className="grow">{t.text}</span>
          <button type="button" className="btn-quiet" style={{ border: 0, background: 'none', color: 'inherit', cursor: 'pointer' }} aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
