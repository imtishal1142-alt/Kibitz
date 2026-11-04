import { useRef } from 'react';
import { usePrefs } from '../hooks/usePrefs';

export const SCALE_MIN = 50;
export const SCALE_MAX = 100;

/** Drag the corner of the board to make it bigger or smaller (100 = the largest size that still fits the screen). */
export function BoardResizer() {
  const [prefs, setPrefs] = usePrefs();
  const drag = useRef<{ x: number; y: number; width: number; fit: number } | null>(null);
  const value = prefs.boardScale;

  const apply = (pct: number) => document.documentElement.style.setProperty('--bs', String(pct / 100));
  const clamp = (n: number) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(n)));

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const wrap = e.currentTarget.closest<HTMLElement>('.board-wrap');
    if (!wrap) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const width = wrap.getBoundingClientRect().width;
    drag.current = { x: e.clientX, y: e.clientY, width, fit: width / (value / 100) };
    document.documentElement.dataset.resizing = 'true';
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const delta = (e.clientX - d.x + (e.clientY - d.y)) / 2;
    apply(clamp(((d.width + delta) / d.fit) * 100));
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    delete document.documentElement.dataset.resizing;
    const delta = (e.clientX - d.x + (e.clientY - d.y)) / 2;
    setPrefs({ boardScale: clamp(((d.width + delta) / d.fit) * 100) });
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 5;
    let next: number;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === '+') next = value + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === '-') next = value - step;
    else if (e.key === 'Home') next = SCALE_MIN;
    else if (e.key === 'End') next = SCALE_MAX;
    else return;
    e.preventDefault();
    setPrefs({ boardScale: clamp(next) });
  };

  return (
    <div
      className="board-resizer"
      role="slider"
      tabIndex={0}
      aria-label="Board size. Drag, or use the arrow keys."
      aria-valuemin={SCALE_MIN}
      aria-valuemax={SCALE_MAX}
      aria-valuenow={value}
      aria-valuetext={`${value} percent`}
      title="Drag to resize the board (double-click to reset)"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={() => setPrefs({ boardScale: 90 })}
      onKeyDown={onKey}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
        <path d="M14 6 6 14M14 10l-4 4M14 2 2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}
