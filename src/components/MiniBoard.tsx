import { defaultPieces } from 'react-chessboard';
import type { PieceRenderObject } from 'react-chessboard';
import { BOARD_THEMES } from '../lib/storage/prefs';
import { usePrefs } from '../hooks/usePrefs';
import type { Color } from '../lib/types';

const pieces = defaultPieces as PieceRenderObject;

/** A small, still picture of a position (no interaction), used on cards. It is decorative: the card carries the text. */
export function MiniBoard({ fen, orientation = 'w' }: { fen: string; orientation?: Color }) {
  const [prefs] = usePrefs();
  const theme = BOARD_THEMES[prefs.boardTheme] ?? BOARD_THEMES.green!;
  const rows = fen.split(' ')[0]!.split('/');
  const grid: (string | null)[][] = rows.map((r) => {
    const out: (string | null)[] = [];
    for (const ch of r) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) out.push(null);
      else out.push(`${ch === ch.toUpperCase() ? 'w' : 'b'}${ch.toUpperCase()}`);
    }
    return out;
  });
  const ranks = orientation === 'w' ? grid : [...grid].reverse().map((r) => [...r].reverse());
  return (
    <div className="mini-board" aria-hidden="true">
      {ranks.flatMap((row, y) =>
        row.map((p, x) => (
          <span key={`${y}${x}`} className="mini-sq" style={{ background: (x + y) % 2 === 0 ? theme.light : theme.dark }}>
            {p ? pieces[p]?.() : null}
          </span>
        )),
      )}
    </div>
  );
}
