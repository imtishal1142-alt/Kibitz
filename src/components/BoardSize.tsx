import { usePrefs } from '../hooks/usePrefs';

const MIN = 60;
const MAX = 140;

/** Shrink or enlarge the board. The size is remembered and applies to every board in the app. */
export function BoardSize() {
  const [prefs, setPrefs] = usePrefs();
  const v = prefs.boardScale;
  const set = (n: number) => setPrefs({ boardScale: Math.min(MAX, Math.max(MIN, Math.round(n))) });
  return (
    <div className="board-size" role="group" aria-label="Board size">
      <button type="button" className="btn btn-sm btn-quiet" onClick={() => set(v - 10)} disabled={v <= MIN} aria-label="Make the board smaller" title="Smaller board">
        &minus;
      </button>
      <input type="range" min={MIN} max={MAX} step={5} value={v} onChange={(e) => set(Number(e.target.value))} aria-label="Board size" aria-valuetext={`${v} percent`} />
      <button type="button" className="btn btn-sm btn-quiet" onClick={() => set(v + 10)} disabled={v >= MAX} aria-label="Make the board larger" title="Larger board">
        +
      </button>
      <button type="button" className="btn btn-sm btn-quiet" onClick={() => set(100)} disabled={v === 100} title="Back to the automatic size">
        Reset
      </button>
    </div>
  );
}
