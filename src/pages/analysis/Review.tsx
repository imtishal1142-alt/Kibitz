import { ClassBadge } from '../../components/ClassBadge';
import { GradeIcon } from '../../components/GradeIcon';
import { Icon } from '../../components/Icon';
import { Spinner } from '../../components/ui';
import { Pv } from '../../components/Pv';
import { CLASS_LABEL, CLASS_MEANING, CLASS_ORDER, isLesson } from '../../lib/chess/classify';
import { RETEST_OK_LOSS } from '../../lib/training/retest';
import { moveLabel } from '../../lib/analysis/explain';
import type { Explanation } from '../../lib/analysis/explain';
import type { MoveAssessment } from '../../lib/analysis/assess';
import type { Color, GameAnalysis, GameRecord, MoveAnalysis } from '../../lib/types';

export function ReviewSummary({
  analysis,
  game,
  userColor,
  compact,
  steps,
  onStart,
  onOpenReport,
}: {
  analysis: GameAnalysis;
  game?: GameRecord;
  userColor?: Color;
  compact: boolean;
  steps: number;
  onStart: () => void;
  onOpenReport: () => void;
}) {
  const sides: Color[] = ['w', 'b'];
  const name = (c: Color) => (c === 'w' ? (game?.white ?? 'White') : (game?.black ?? 'Black'));
  const rating = (c: Color) => (c === 'w' ? game?.whiteElo : game?.blackElo);
  const rows = CLASS_ORDER;
  const forced = analysis.summary.w.counts.forced + analysis.summary.b.counts.forced;
  return (
    <section className="review" aria-label="Game review summary">
      <div className="review-head">
        <h2>
          <span className="review-head-icon" aria-hidden="true">
            <Icon name="insights" size={18} />
          </span>
          Game review
        </h2>
        {compact ? (
          <div className="row">
            <button className="btn btn-sm btn-primary" type="button" onClick={onStart} disabled={steps === 0}>
              <Icon name="play" /> Start review{steps ? ` (${steps})` : ''}
            </button>
            <button className="btn btn-sm" type="button" onClick={onOpenReport}>
              Full report
            </button>
          </div>
        ) : null}
      </div>
      {compact ? null : (
        <div className="coach-say">
          <span className="coach-avatar" aria-hidden="true">
            <Icon name="knight" size={26} />
          </span>
          <p className="coach-bubble">{steps ? (steps === 1 ? 'There is one critical moment in this game. Let’s look at it.' : `There are ${steps} critical moments in this game. Let’s walk through them.`) : 'A clean game: no mistakes, misses or standout moves to step through.'}</p>
        </div>
      )}
      <div className="review-players">
        {sides.map((c) => (
          <div key={c} className={`review-player ${userColor === c ? 'review-me' : ''}`}>
            <span className={`dot-color dot-${c}`} aria-hidden="true" />
            <div className="review-name">
              <strong>{name(c)}</strong>
              {rating(c) ? <span className="muted small"> ({rating(c)})</span> : null}
              {userColor === c ? <span className="chip chip-accent" style={{ marginLeft: 6 }}>You</span> : null}
            </div>
            <div className="review-acc" aria-label={`${c === 'w' ? 'White' : 'Black'} accuracy ${analysis.summary[c].accuracy.toFixed(1)} percent`}>
              <span className="review-acc-num">{analysis.summary[c].accuracy.toFixed(1)}</span>
              <span className="review-acc-label">Accuracy</span>
            </div>
          </div>
        ))}
      </div>
      {compact ? null : (
        <>
          <div className="table-wrap">
            <table className="table review-table">
              <caption className="sr-only">Number of moves of each grade, for White and for Black</caption>
              <thead>
                <tr>
                  <th scope="col">Grade</th>
                  <th scope="col" className="right">
                    White
                  </th>
                  <th scope="col" className="review-mid">
                    <span className="sr-only">Icon</span>
                  </th>
                  <th scope="col" className="right">
                    Black
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((cls) => (
                  <tr key={cls}>
                    <th scope="row" title={CLASS_MEANING[cls]}>
                      <span className={`cls-${cls}`}>{CLASS_LABEL[cls]}</span>
                    </th>
                    <td className={`right num ${analysis.summary.w.counts[cls] ? `cls-${cls}` : 'faint'}`}>{analysis.summary.w.counts[cls]}</td>
                    <td className="review-mid" aria-hidden="true">
                      <GradeIcon cls={cls} size={22} />
                    </td>
                    <td className={`right num ${analysis.summary.b.counts[cls] ? `cls-${cls}` : 'faint'}`}>{analysis.summary.b.counts[cls]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {analysis.opening ? (
              <>
                <Icon name="book" size={14} /> {analysis.opening.name} ({analysis.opening.eco}), in theory until move {Math.ceil(analysis.opening.plies / 2)}.{' '}
              </>
            ) : null}
            {forced ? `${forced} move${forced === 1 ? ' was' : 's were'} the only legal move and are not graded. ` : ''}
            Accuracy is computed from win-chance loss on every move (see Help); it is not Chess.com&apos;s number.
          </p>
        </>
      )}
      {compact ? null : (
        <div className="review-cta">
          <button className="btn btn-primary btn-lg" type="button" onClick={onStart} disabled={steps === 0} title={steps === 0 ? 'Nothing to step through: no mistakes, misses or standout moves.' : undefined}>
            <Icon name="play" /> Start review{steps ? ` (${steps})` : ''}
          </button>
        </div>
      )}
    </section>
  );
}

export interface RetryState {
  ply: number;
  phase: 'try' | 'busy' | 'result' | 'error';
  result?: MoveAssessment;
  error?: string;
}

/** The card shown while stepping through the review: what happened, and a chance to retry the move. */
export function ReviewCard({
  index,
  total,
  move,
  explanation,
  retry,
  onRetry,
  onShowBest,
  onPrev,
  onNext,
  onExit,
  mine,
}: {
  index: number;
  total: number;
  move: MoveAnalysis;
  explanation: Explanation | null;
  retry: RetryState | null;
  onRetry: () => void;
  onShowBest: () => void;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
  mine: boolean;
}) {
  const lesson = isLesson(move.cls);
  const res = retry?.result;
  const solved = !!res && res.winLoss <= RETEST_OK_LOSS;
  const better = res ? move.winLoss - res.winLoss : 0;
  return (
    <section className="review review-card" aria-label="Guided review" aria-live="polite">
      <div className="review-head">
        <h2>
          Review {index + 1} of {total}
        </h2>
        <button className="btn btn-sm btn-quiet" type="button" onClick={onExit}>
          Exit review
        </button>
      </div>
      <div className="row">
        <ClassBadge cls={move.cls} />
        <strong>{moveLabel(move)}</strong>
        <span className="muted small">{mine ? 'your move' : "opponent's move"}</span>
      </div>
      {explanation ? <p style={{ margin: 0 }}>{explanation.paragraphs[0] ?? explanation.headline}</p> : null}
      {explanation?.threat ? <p className="small" style={{ margin: 0 }}><strong>Threat. </strong>{explanation.threat}</p> : null}
      {explanation?.reply ? <p className="small" style={{ margin: 0 }}><strong>Best reply. </strong>{explanation.reply}</p> : null}
      {!retry && lesson && move.bestSan ? (
        <p className="muted small" style={{ margin: 0 }}>
          Can you find something better than {move.san}? Press Try again to play from this position. Any move that loses at most {RETEST_OK_LOSS} win-chance points counts.
        </p>
      ) : null}

      {retry?.phase === 'try' ? <p style={{ margin: 0 }}>It is your move again. Play a better one on the board.</p> : null}
      {retry?.phase === 'busy' ? <Spinner label="The engine is checking your move…" /> : null}
      {retry?.phase === 'error' ? (
        <p role="alert" style={{ margin: 0, color: 'var(--c-blunder)' }}>
          {retry.error ?? 'The engine failed.'}
        </p>
      ) : null}
      {retry?.phase === 'result' && res ? (
        <div className={`retry-result ${solved ? 'retry-ok' : 'retry-no'}`} role="status">
          <div className="row">
            <ClassBadge cls={res.cls} />
            <strong>{solved ? `${res.san}: that works.` : `${res.san} is not it.`}</strong>
          </div>
          <p style={{ margin: '6px 0 0' }}>
            {solved
              ? better >= 2
                ? `It is ${better.toFixed(0)} points better than ${move.san} was in the game.`
                : `It is about as good as the engine's choice.`
              : `It loses ${res.winLoss.toFixed(1)} win-chance points${res.replyPvSan[0] ? `, and the engine answers ${res.replyPvSan[0]}` : ''}.`}
          </p>
          {res.bestSan && !solved ? (
            <p className="small muted" style={{ margin: '6px 0 0' }}>
              Look for a move like the engine&apos;s first choice. Try again, or press Show the best move.
            </p>
          ) : null}
        </div>
      ) : null}

      {explanation && retry?.phase === 'result' && solved && move.bestSan ? (
        <div className="small">
          <span className="muted">The engine&apos;s line: </span>
          <Pv fen={move.fenBefore} sans={explanation.evidence.bestLine} max={8} />
        </div>
      ) : null}

      <div className="row">
        <button className="btn" type="button" onClick={onPrev} disabled={index === 0}>
          <Icon name="left" /> Previous
        </button>
        {lesson && move.bestSan && (!retry || retry.phase === 'result' || retry.phase === 'error') ? (
          <button className="btn btn-primary" type="button" onClick={onRetry}>
            <Icon name="refresh" /> Try again
          </button>
        ) : null}
        {move.bestSan && move.bestUci !== move.uci && !solved ? (
          <button className="btn" type="button" onClick={onShowBest}>
            <Icon name="eye" /> Show the best move{move.bestSan ? ` (${move.bestSan})` : ''}
          </button>
        ) : null}
        <button className="btn btn-primary" type="button" onClick={onNext}>
          {index + 1 >= total ? 'Finish' : 'Next'} <Icon name="right" />
        </button>
      </div>
    </section>
  );
}

