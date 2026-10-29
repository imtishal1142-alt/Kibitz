import { Chess } from 'chess.js';

/**
 * A line of moves ("variation") with move numbers. Each move is a button; `onPick(i)` receives the
 * index of the clicked move so the page can play the line up to that point.
 */
export function Pv({ fen, sans, onPick, max = 14 }: { fen: string; sans: string[]; onPick?: (index: number) => void; max?: number }) {
  let n = 1;
  let white = true;
  try {
    const c = new Chess(fen);
    white = c.turn() === 'w';
    n = Number(fen.split(' ')[5] ?? 1) || 1;
  } catch {
    /* default numbering */
  }
  const out: { text: string; i: number }[] = [];
  sans.slice(0, max).forEach((san, i) => {
    const isWhite = (i % 2 === 0) === white;
    const no = n + Math.floor((i + (white ? 0 : 1)) / 2);
    out.push({ i, text: isWhite ? `${no}.${san}` : i === 0 ? `${no}...${san}` : san });
  });
  return (
    <span className="pv">
      {out.map((o) =>
        onPick ? (
          <button key={o.i} type="button" onClick={() => onPick(o.i)}>
            {o.text}
          </button>
        ) : (
          <span key={o.i}>{o.text}</span>
        ),
      )}
      {sans.length > max ? <span className="faint">…</span> : null}
    </span>
  );
}
