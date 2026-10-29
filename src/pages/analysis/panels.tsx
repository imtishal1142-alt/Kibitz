import { opponentNotes, theoryDeparture } from '../../lib/analysis/opponentNotes';
import { TimeUse } from '../../components/TimeUse';
import { Banner, Spinner } from '../../components/ui';
import { ClassBadge } from '../../components/ClassBadge';
import { Icon } from '../../components/Icon';
import { Pv } from '../../components/Pv';
import { CLASS_GLYPH, CLASS_LABEL, CLASS_ORDER } from '../../lib/chess/classify';
import { formatScore } from '../../lib/chess/eval';
import { uciLineToSan } from '../../lib/chess/rules';
import { gameRecommendations } from '../../lib/analysis/gameAnalysis';
import { CATEGORY_LABEL, moveLabel } from '../../lib/analysis/explain';
import type { Explanation } from '../../lib/analysis/explain';
import type { ThreatReport } from '../../lib/analysis/assess';
import { classFlagsText, formatDateTime } from '../../lib/ui/format';
import type { LiveAnalysis } from '../../hooks/useLiveAnalysis';
import type { Color, GameAnalysis, GameRecord, MoveAnalysis } from '../../lib/types';

export interface ThreatState {
  fen: string;
  busy: boolean;
  report: ThreatReport | null;
  error?: string;
}

export function ThreatBox({ state, fen, onFind, onShow }: { state: ThreatState | null; fen: string; onFind: () => void; onShow: (uci: string) => void }) {
  const mine = state && state.fen === fen ? state : null;
  return (
    <div className="facts">
      <div className="facts-title">Threat check</div>
      {mine?.busy ? (
        <Spinner label="Asking the engine what the opponent would do if it were their move…" />
      ) : mine?.error ? (
        <p className="small" style={{ margin: 0 }}>
          {mine.error}
        </p>
      ) : mine?.report ? (
        <div className="stack-sm">
          <p style={{ margin: 0 }}>{mine.report.note}</p>
          {mine.report.threat ? (
            <button className="btn btn-sm" type="button" onClick={() => onShow(mine.report!.threat!.uci)}>
              <Icon name="eye" /> Show the threat on the board
            </button>
          ) : null}
        </div>
      ) : (
        <p className="small muted" style={{ margin: '0 0 8px' }}>
          Passes the turn in the engine only (never on the board) to see what the other side would play, then checks that it matters.
        </p>
      )}
      {!mine?.busy ? (
        <button className="btn btn-sm" type="button" onClick={onFind} style={{ marginTop: 8 }}>
          <Icon name="shield" /> {mine?.report ? 'Check again' : 'What is the opponent threatening?'}
        </button>
      ) : null}
    </div>
  );
}

export function CoachPanel({
  explanation,
  move,
  hasAnalysis,
  onPlayBest,
  onPlayRefutation,
  onPlayBestLine,
  threatState,
  fen,
  onFindThreat,
  onShowThreat,
  opening,
}: {
  explanation: Explanation | null;
  move?: MoveAnalysis;
  hasAnalysis: boolean;
  onPlayBest: () => void;
  onPlayRefutation: (upTo: number) => void;
  onPlayBestLine: (upTo: number) => void;
  threatState: ThreatState | null;
  fen: string;
  onFindThreat: () => void;
  onShowThreat: (uci: string) => void;
  opening?: string | null;
}) {
  const bad = move && (move.cls === 'mistake' || move.cls === 'blunder' || move.cls === 'inaccuracy');
  return (
    <div className="coach pad stack-sm">
      {opening ? (
        <p className="small muted" style={{ margin: 0 }}>
          <Icon name="book" size={14} /> {opening}
        </p>
      ) : null}
      {explanation && move ? (
        <>
          <div className="row">
            <ClassBadge cls={explanation.cls} />
            {classFlagsText(move).map((t) => (
              <span key={t} className="chip chip-warn">
                {t}
              </span>
            ))}
          </div>
          <h3>{explanation.headline}</h3>

          <div className="facts" aria-label="Verified by the engine">
            <div className="facts-title">
              <Icon name="check" size={14} /> Verified by the engine
            </div>
            <ul className="list-plain stack-sm" style={{ margin: 0 }}>
              {explanation.paragraphs.map((p) => (
                <li key={p}>{p}</li>
              ))}
              <li className="small muted">
                Evaluation for the mover: {explanation.evidence.evalBefore} before, {explanation.evidence.evalAfter} after ({explanation.evidence.winLoss.toFixed(1)} win-percentage points lost).
              </li>
            </ul>
            {explanation.evidence.refutation.length > 0 ? (
              <div style={{ marginTop: 8 }}>
                <div className="small muted">Engine&apos;s answer to the move played (click to try it):</div>
                <Pv fen={move.fenAfter} sans={explanation.evidence.refutation} onPick={onPlayRefutation} max={8} />
              </div>
            ) : null}
            {bad && explanation.evidence.bestLine.length > 0 ? (
              <div style={{ marginTop: 8 }}>
                <div className="small muted">What the engine preferred ({explanation.evidence.bestSan}):</div>
                <Pv fen={move.fenBefore} sans={explanation.evidence.bestLine} onPick={onPlayBestLine} max={8} />
              </div>
            ) : null}
            {!explanation.verified ? <p className="small" style={{ margin: '8px 0 0' }}>Part of the engine line could not be replayed legally, so it was left out.</p> : null}
          </div>

          {explanation.category !== 'sound' ? (
            <div className="coach-lesson">
              <div className="small muted">
                Interpretation, not engine output
                {explanation.themes.length ? ` · ${explanation.themes.map((t) => CATEGORY_LABEL[t]).join(', ')}` : ''}
              </div>
              <p style={{ margin: '4px 0 0' }}>{explanation.lesson}</p>
            </div>
          ) : null}

          {bad ? (
            <div className="row">
              <button className="btn btn-sm btn-primary" type="button" onClick={onPlayBest}>
                Try {explanation.evidence.bestSan ?? 'the better move'} instead
              </button>
            </div>
          ) : null}
        </>
      ) : hasAnalysis ? (
        <p className="muted" style={{ margin: 0 }}>
          Select a move to see what the engine found. Moves marked with a glyph (<span aria-hidden="true">{CLASS_GLYPH.blunder}</span> blunder, <span aria-hidden="true">{CLASS_GLYPH.mistake}</span> mistake) are worth starting with, and the dots on the graph jump to them. Play any move on the board to explore your own variation.
        </p>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Move through the game or play moves on the board. The engine evaluates whatever position you are on (see the Lines tab).
        </p>
      )}
      <ThreatBox state={threatState} fen={fen} onFind={onFindThreat} onShow={onShowThreat} />
    </div>
  );
}

export function LinesPanel({ live, fen, enabled, onToggle, onPlay, depthTarget }: { live: LiveAnalysis; fen: string; enabled: boolean; onToggle: () => void; onPlay: (ucis: string[]) => void; depthTarget: number }) {
  return (
    <div className="pad stack-sm">
      <div className="row">
        <button className="btn btn-sm" type="button" aria-pressed={enabled} onClick={onToggle}>
          <Icon name={enabled ? 'pause' : 'play'} /> {enabled ? 'Pause engine' : 'Resume engine'}
        </button>
        <span className="small muted" aria-live="polite">
          {!enabled ? 'Paused' : live.status === 'loading' ? 'Starting engine…' : live.status === 'thinking' ? `Thinking, depth ${live.depth} of ${depthTarget}` : live.status === 'done' ? `Finished at depth ${live.depth}` : live.status === 'terminal' ? 'Game over here' : ''}
          {live.nps ? ` · ${(live.nps / 1000).toFixed(0)} kn/s` : ''}
        </span>
      </div>
      {live.status === 'error' ? (
        <Banner kind="bad" role="alert">
          <div>
            The engine reported a problem: {live.error}{' '}
            <button className="btn btn-sm" type="button" onClick={live.restart}>
              Restart engine
            </button>
          </div>
        </Banner>
      ) : null}
      {live.status === 'terminal' ? <p className="muted">This position is finished: there are no legal moves to analyse.</p> : null}
      <div>
        {live.lines.map((l) => {
          const chk = uciLineToSan(fen, l.pv, 12);
          const white = l.score.kind === 'mate' ? l.score.mate > 0 : l.score.cp >= 0;
          return (
            <div className="engine-line" key={l.multipv}>
              <span className={`score-pill ${white ? '' : 'score-pill-black'}`} title="Evaluation from White's point of view">
                {formatScore(l.score, { signed: true })}
              </span>
              <Pv fen={fen} sans={chk.sans} onPick={(i) => onPlay(chk.ucis.slice(0, i + 1))} max={12} />
            </div>
          );
        })}
        {enabled && live.lines.length === 0 && live.status !== 'error' && live.status !== 'terminal' ? <Spinner label="Waiting for the first result…" /> : null}
      </div>
      <p className="hint" style={{ margin: 0 }}>
        Scores are always from White&apos;s point of view: positive favours White. Click a move in a line to play it on the board as a variation. A Lite single-thread engine is used, so deeper lines take a moment.
      </p>
    </div>
  );
}

export function ReportPanel({ analysis, game, userColor, onJump, onReanalyse, busy }: { analysis: GameAnalysis; game?: GameRecord; userColor?: Color; onJump: (ply: number) => void; onReanalyse: () => void; busy: boolean }) {
  const order: Color[] = userColor ? [userColor, userColor === 'w' ? 'b' : 'w'] : ['w', 'b'];
  const name = (c: Color) => (c === 'w' ? (game?.white ?? 'White') : (game?.black ?? 'Black')) + (userColor === c ? ' (you)' : '');
  const recs = gameRecommendations(analysis, userColor);
  const departure = theoryDeparture(analysis, userColor);
  const oppNotes = opponentNotes(analysis, game, userColor);
  return (
    <div className="pad stack">
      {analysis.opening ? (
        <p style={{ margin: 0 }}>
          <strong>{analysis.opening.name}</strong> <span className="muted">({analysis.opening.eco}, left theory at move {Math.ceil(analysis.opening.plies / 2)})</span>
        </p>
      ) : null}
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">Move quality summary for both sides</caption>
          <thead>
            <tr>
              <th scope="col">Side</th>
              <th scope="col" className="right">
                Accuracy
              </th>
              <th scope="col" className="right">
                Avg. loss (cp)
              </th>
            </tr>
          </thead>
          <tbody>
            {order.map((c) => (
              <tr key={c}>
                <th scope="row">{name(c)}</th>
                <td className="right num">{analysis.summary[c].accuracy.toFixed(1)}%</td>
                <td className="right num">{analysis.summary[c].acpl.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">Number of moves in each class</caption>
          <thead>
            <tr>
              <th scope="col">Class</th>
              {order.map((c) => (
                <th key={c} scope="col" className="right">
                  {c === 'w' ? 'White' : 'Black'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...CLASS_ORDER, 'forced' as const].map((cls) => (
              <tr key={cls}>
                <th scope="row">
                  <ClassBadge cls={cls} />
                </th>
                {order.map((c) => (
                  <td key={c} className="right num">
                    {analysis.summary[c].counts[cls]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {departure ? (
        <p style={{ margin: 0 }}>
          <strong>Theory.</strong> {departure.text} <span className="muted small">(The opening list names lines; it does not say how often strong players choose them.)</span>
        </p>
      ) : null}
      {oppNotes.length ? (
        <div>
          <h2 style={{ fontSize: '1rem', marginBottom: 6 }}>About your opponent in this game</h2>
          <ul className="stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
            {oppNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {userColor ? (
        <div>
          <h2 style={{ fontSize: '1rem', marginBottom: 6 }}>How you used your time</h2>
          <TimeUse analysis={analysis} color={userColor} onJump={onJump} />
        </div>
      ) : null}
      {recs.length ? (
        <div>
          <h2 style={{ fontSize: '1rem', marginBottom: 6 }}>What to take from this game</h2>
          <ul className="stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
            {recs.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {analysis.keyMoments.length ? (
        <div>
          <h2 style={{ fontSize: '1rem', marginBottom: 6 }}>Critical moments</h2>
          <ul className="list-plain list-rows">
            {analysis.keyMoments.map((ply) => {
              const m = analysis.moves[ply - 1];
              if (!m) return null;
              return (
                <li key={ply}>
                  <button type="button" className="btn btn-quiet" style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => onJump(ply)}>
                    <ClassBadge cls={m.cls} short />
                    <strong>{moveLabel(m)}</strong>
                    <span className="muted small">
                      {CLASS_LABEL[m.cls]}
                      {m.winLoss >= 5 ? `, -${m.winLoss.toFixed(0)} pts` : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <div className="small muted stack-sm">
        <div>
          Analysed by {analysis.engine} at depth {analysis.depth}, {analysis.multipv} line{analysis.multipv === 1 ? '' : 's'}, on {formatDateTime(analysis.createdAt)}.
        </div>
        <div>
          <button className="btn btn-sm" type="button" disabled={busy} onClick={onReanalyse}>
            <Icon name="refresh" /> Re-analyse deeper
          </button>
        </div>
        <div>Accuracy and classes use win-percentage loss, not Chess.com&apos;s own formula, so the numbers will differ from theirs. See Help for the method.</div>
      </div>
    </div>
  );
}
