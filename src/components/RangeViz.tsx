/** A rating range drawn on a line: the interval, the point estimate and (separately) the official rating. */
export function RangeViz({ low, high, rating, official, label }: { low: number; high: number; rating: number; official?: number; label: string }) {
  const vals = [low, high, rating, ...(official !== undefined ? [official] : [])];
  const lo = Math.floor((Math.min(...vals) - 60) / 50) * 50;
  const hi = Math.ceil((Math.max(...vals) + 60) / 50) * 50;
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="range-viz" role="img" aria-label={label} style={{ marginBottom: 30 }}>
      <div className="range-viz-track" />
      <div className="range-viz-span" style={{ left: pos(low), width: `${((high - low) / (hi - lo)) * 100}%` }} />
      <div className="range-viz-dot" style={{ left: pos(rating) }} />
      {official !== undefined ? <div className="range-viz-official" style={{ left: pos(official) }} title={`Official rating ${official}`} /> : null}
      <span className="range-viz-label" style={{ left: pos(low) }}>
        {low}
      </span>
      <span className="range-viz-label" style={{ left: pos(high) }}>
        {high}
      </span>
    </div>
  );
}
