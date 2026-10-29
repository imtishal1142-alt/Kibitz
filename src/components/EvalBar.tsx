import { describeScore, evalBarShare, formatScore } from '../lib/chess/eval';
import type { Color, Score } from '../lib/types';

/** Vertical evaluation bar. White is at the bottom unless the board is flipped. */
export function EvalBar({ score, orientation = 'w', depth }: { score: Score | null; orientation?: Color; depth?: number }) {
  const share = score ? evalBarShare(score) : 0.5;
  const pct = Math.round(share * 1000) / 10;
  const text = score ? formatScore(score, { signed: true }) : '';
  const whiteAhead = score ? (score.kind === 'mate' ? score.mate > 0 : score.cp >= 0) : true;
  const label = score ? `Evaluation ${text}. ${describeScore(score, depth ?? 0)}` : 'No evaluation yet';
  const flipped = orientation === 'b';
  return (
    <div className="evalbar" role="img" aria-label={label} title={label} style={flipped ? { transform: 'rotate(180deg)' } : undefined}>
      <div className="evalbar-fill" style={{ height: `${pct}%` }} />
      {score ? (
        <span className={`evalbar-text ${whiteAhead ? 'evalbar-text-bottom' : 'evalbar-text-top'}`} style={flipped ? { transform: 'rotate(180deg)' } : undefined}>
          {text.replace('+', '')}
        </span>
      ) : null}
    </div>
  );
}
