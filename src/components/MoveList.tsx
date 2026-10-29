import { useEffect, useRef } from 'react';

/** A read-only scoresheet for a game in progress (nothing here is clickable, so nothing pretends to be). */
export function MoveList({ sans, startNumber = 1, startsWithBlack = false }: { sans: string[]; startNumber?: number; startsWithBlack?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sans.length]);
  const rows: { no: number; w?: string; b?: string }[] = [];
  sans.forEach((san, i) => {
    const idx = i + (startsWithBlack ? 1 : 0);
    const no = startNumber + Math.floor(idx / 2);
    if (idx % 2 === 0) rows.push({ no, w: san });
    else if (rows.length && rows[rows.length - 1]!.no === no) rows[rows.length - 1]!.b = san;
    else rows.push({ no, b: san });
  });
  return (
    <div className="scoresheet" ref={ref} role={rows.length ? 'list' : undefined} aria-label={rows.length ? 'Moves played' : undefined}>
      {rows.length === 0 ? <p className="muted pad-sm" style={{ margin: 0 }}>No moves yet.</p> : null}
      {rows.map((r) => (
        <div className="sheet-row" key={r.no} role="listitem">
          <span className="sheet-no">{r.no}</span>
          <span className="mv" style={{ cursor: 'default' }}>{r.w ?? '…'}</span>
          <span className="mv" style={{ cursor: 'default' }}>{r.b ?? ''}</span>
        </div>
      ))}
    </div>
  );
}
