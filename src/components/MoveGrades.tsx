import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CLASS_LABEL, CLASS_MEANING } from '../lib/chess/classify';
import { TALLY_ORDER } from '../lib/analysis/tally';
import type { GradeTally } from '../lib/analysis/tally';
import { gameDateText } from '../lib/ui/format';
import { GradeIcon } from './GradeIcon';

/**
 * How many moves of each grade you have played. Brilliant moves open into a list of where they happened (game, move,
 * link to the position); the other grades are plain counts.
 */
export function MoveGrades({ tally }: { tally: GradeTally }) {
  const [open, setOpen] = useState(false);
  const rate = (n: number) => (tally.moves ? `${((n / tally.moves) * 100).toFixed(1)}%` : '');
  return (
    <section className="stack-sm" aria-labelledby="grades-h">
      <h2 id="grades-h">Your moves by grade</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {tally.moves} moves of yours in {tally.games} analysed game{tally.games === 1 ? '' : 's'}. Open the brilliant moves to see which they were. What each grade means is in Help.
      </p>
      <ul className="grade-tiles list-plain">
        {TALLY_ORDER.map((cls) => {
          const n = tally.counts[cls];
          const inner = (
            <>
              <GradeIcon cls={cls} size={26} />
              <span className="grade-tile-n">{n}</span>
              <span className="grade-tile-l">{CLASS_LABEL[cls]}</span>
              <span className="grade-tile-r">{rate(n)}</span>
            </>
          );
          return (
            <li key={cls}>
              {cls === 'brilliant' ? (
                <button type="button" className="grade-tile grade-tile-btn" aria-expanded={open} aria-controls="brilliant-list" onClick={() => setOpen((v) => !v)} title={CLASS_MEANING[cls]}>
                  {inner}
                </button>
              ) : (
                <div className="grade-tile" title={CLASS_MEANING[cls]}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div id="brilliant-list" hidden={!open}>
        {open ? (
          tally.brilliant.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No brilliant moves yet. They are rare: a sacrifice the engine approves, that leaves you a piece or more behind once the exchanges settle.
            </p>
          ) : (
            <ul className="list-plain list-rows sheet pad-list" aria-label="Your brilliant moves">
              {tally.brilliant.map((b) => (
                <li key={`${b.gameId}:${b.ply}`}>
                  <Link to={`/analysis/${b.gameId}?ply=${b.ply}`} className="row-nowrap" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <GradeIcon cls="brilliant" size={22} />
                    <span className="grow">
                      <strong>{b.label}</strong>
                      <span className="muted small" style={{ display: 'block' }}>
                        {b.opponent ? `vs ${b.opponent}` : 'Game'} · {gameDateText(b)}
                      </span>
                    </span>
                    <span className="chip">{b.winAfter.toFixed(0)}% after</span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </section>
  );
}
