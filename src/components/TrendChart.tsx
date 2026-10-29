import { useId } from 'react';

export interface TrendPoint {
  label: string;
  value: number | null;
}

/**
 * A small line chart with a text table behind it for assistive technology. `better` says which direction is good, so
 * the last change can be described in words ("down 1.2") and not only by colour.
 */
export function TrendChart({ title, points, unit = '', digits = 1, better, height = 120 }: { title: string; points: TrendPoint[]; unit?: string; digits?: number; better: 'higher' | 'lower'; height?: number }) {
  const id = useId();
  const W = 320;
  const pad = { l: 34, r: 10, t: 10, b: 20 };
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  const lo0 = Math.min(...vals);
  const hi0 = Math.max(...vals);
  const span = hi0 - lo0 || Math.max(1, Math.abs(hi0) * 0.1);
  const lo = lo0 - span * 0.15;
  const hi = hi0 + span * 0.15;
  const x = (i: number) => pad.l + (points.length <= 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const drawn = points.map((p, i) => (p.value === null ? null : ([x(i), y(p.value)] as const)));
  const segs: string[] = [];
  let cur: string[] = [];
  for (const d of drawn) {
    if (d) cur.push(`${d[0].toFixed(1)},${d[1].toFixed(1)}`);
    else if (cur.length) {
      segs.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length) segs.push(cur.join(' '));
  const first = vals[0]!;
  const last = vals.at(-1)!;
  const delta = last - first;
  const good = better === 'higher' ? delta > 0 : delta < 0;
  const change = vals.length < 2 ? 'one data point' : delta === 0 ? 'unchanged' : `${delta > 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(digits)}${unit} since ${points.find((p) => p.value !== null)!.label}`;
  const fmt = (v: number) => `${v.toFixed(digits)}${unit}`;
  return (
    <figure className="trend" aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="trend-cap">
        <strong>{title}</strong>
        <span className={`trend-now ${vals.length > 1 && delta !== 0 ? (good ? 'trend-good' : 'trend-bad') : ''}`}>
          {fmt(last)} <span className="small muted">({change})</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`${title}: ${points.map((p) => `${p.label} ${p.value === null ? 'no data' : fmt(p.value)}`).join(', ')}`} className="trend-svg">
        <line x1={pad.l} x2={W - pad.r} y1={y(hi0)} y2={y(hi0)} className="trend-grid" />
        <line x1={pad.l} x2={W - pad.r} y1={y(lo0)} y2={y(lo0)} className="trend-grid" />
        <text x={pad.l - 4} y={y(hi0) + 4} textAnchor="end" className="trend-axis">{hi0.toFixed(digits)}</text>
        <text x={pad.l - 4} y={y(lo0) + 4} textAnchor="end" className="trend-axis">{lo0.toFixed(digits)}</text>
        {segs.map((s) => (
          <polyline key={s} points={s} fill="none" className="trend-line" />
        ))}
        {drawn.map((d, i) => (d ? <circle key={points[i]!.label} cx={d[0]} cy={d[1]} r={3.2} className="trend-dot" /> : null))}
        <text x={x(0)} y={height - 5} textAnchor="start" className="trend-axis">{points[0]!.label}</text>
        {points.length > 1 ? <text x={x(points.length - 1)} y={height - 5} textAnchor="end" className="trend-axis">{points.at(-1)!.label}</text> : null}
      </svg>
    </figure>
  );
}
