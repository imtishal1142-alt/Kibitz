import { useMemo, useRef, useState } from 'react';
import type { MoveClass } from '../lib/types';

export interface GraphMark {
  ply: number;
  cls: MoveClass;
}

const W = 1000;
const H = 92;

/**
 * The "tide": White's chance of winning at every position of the game. The pale water is White's
 * share, the dark sky is Black's. Orange and red dots are mistakes and blunders; click anywhere
 * (or a dot) to jump to that position. Each dot carries the colour of its grade.
 */
export function EvalGraph({ values, current, onSelect, marks = [], describe }: { values: number[]; current: number; onSelect: (ply: number) => void; marks?: GraphMark[]; describe?: (ply: number) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const n = values.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => H - (Math.max(0, Math.min(100, v)) / 100) * H;
  const path = useMemo(() => {
    if (!n) return '';
    const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    return `M0,${H} L${pts.join(' L')} L${W},${H} Z`;
  }, [values]); // eslint-disable-line react-hooks/exhaustive-deps
  const line = useMemo(() => (n ? `M${values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' L')}` : ''), [values]); // eslint-disable-line react-hooks/exhaustive-deps

  const plyAt = (clientX: number): number => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.round(((clientX - r.left) / r.width) * (n - 1))));
  };
  const pos = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 100);

  return (
    <div
      ref={ref}
      className="tide"
      role="group"
      aria-label="Evaluation graph: White's winning chances through the game"
      onClick={(e) => n && onSelect(plyAt(e.clientX))}
      onPointerMove={(e) => n && setHover(plyAt(e.clientX))}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={path} fill="var(--tide-light)" />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="rgba(120,130,160,0.7)" strokeWidth={1} strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />
        {n ? <line x1={x(current)} x2={x(current)} y1={0} y2={H} stroke="var(--accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      {marks
        .filter((m) => m.ply >= 1 && m.ply < n)
        .map((m) => (
          <button
            key={m.ply}
            type="button"
            className={`tide-dot tide-dot-${m.cls}`}
            style={{ left: `${pos(m.ply)}%`, top: `${(y(values[m.ply] ?? 50) / H) * 100}%` }}
            aria-label={describe ? describe(m.ply) : `${m.cls} at move ${Math.ceil(m.ply / 2)}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(m.ply);
            }}
          />
        ))}
      {hover !== null && describe ? (
        <span className="tide-tip" style={{ left: `${Math.min(88, Math.max(12, pos(hover)))}%` }}>
          {describe(hover)}
        </span>
      ) : null}
    </div>
  );
}
