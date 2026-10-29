import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Empty, PageHead, Segmented, Spinner, StatBlock } from '../components/ui';
import { Icon } from '../components/Icon';
import { MoveGrades } from '../components/MoveGrades';
import { TimeInsights } from '../components/TimeUse';
import { timeTally } from '../lib/analysis/timeAnalysis';
import { RangeViz } from '../components/RangeViz';
import { gradeTally } from '../lib/analysis/tally';
import { detectWeaknesses } from '../lib/analysis/weaknesses';
import type { Weakness } from '../lib/analysis/weaknesses';
import { analysedEntries } from '../lib/games/entries';
import { isPersonal } from '../lib/games/records';
import { buildStrengthReport } from '../lib/strength/estimate';
import { addStrength, listProfiles, listStrength } from '../lib/storage/repos';
import { TIME_CLASS_LABEL, formatDate, formatDateTime } from '../lib/ui/format';
import { useAnalyses, useGames } from '../hooks/data';
import { usePrefs } from '../hooks/usePrefs';
import { useQuery } from '../hooks/useQuery';
import { toast } from '../services/toast';
import type { TimeClass } from '../lib/types';

const SEVERITY: Record<Weakness['severity'], string> = { minor: 'Minor', moderate: 'Moderate', major: 'Major' };
const TREND: Record<Weakness['trend'], string> = { improving: 'Improving', worsening: 'Getting worse', steady: 'Steady', unknown: 'Trend unknown' };

function WeaknessCard({ w }: { w: Weakness }) {
  return (
    <article className="sheet pad stack-sm" aria-label={w.label}>
      <div className="row">
        <h3 style={{ margin: 0 }}>{w.label}</h3>
        <span className={`chip ${w.severity === 'major' ? 'chip-bad' : w.severity === 'moderate' ? 'chip-warn' : ''}`}>{SEVERITY[w.severity]}</span>
        <span className={`chip ${w.evidence === 'established' ? 'chip-ok' : ''}`}>{w.evidence === 'established' ? 'Established pattern' : 'Tentative: few examples'}</span>
        <span className="chip">{TREND[w.trend]}</span>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        {w.count} mistakes in {w.games} games, {w.per100Moves.toFixed(1)} per 100 moves, {(w.share * 100).toFixed(0)}% of the winning chances you gave away. {w.trendDetail}
      </p>
      <p style={{ margin: 0 }}>{w.strategy}</p>
      <p style={{ margin: 0 }}>
        <strong>Practice:</strong> {w.exercise}
      </p>
      <details>
        <summary className="small" style={{ cursor: 'pointer' }}>
          Examples from your games ({w.examples.length})
        </summary>
        <ul className="list-plain list-rows" style={{ marginTop: 6 }}>
          {w.examples.map((e) => (
            <li key={`${e.gameId}-${e.ply}`}>
              <Link to={`/analysis/${e.gameId}?ply=${e.ply}`}>
                {e.label}
              </Link>{' '}
              <span className="muted small">
                {e.bestSan ? `${e.bestSan} was better · ` : ''}lost {e.winLoss.toFixed(0)} points · {e.opponent ? `vs ${e.opponent} · ` : ''}
                {formatDate(e.date)}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

export default function Insights() {
  const [prefs] = usePrefs();
  const games = useGames();
  const analyses = useAnalyses();
  const profiles = useQuery(listProfiles, ['profiles']);
  const history = useQuery(listStrength, ['strength']);
  const [tcChoice, setTcChoice] = useState<TimeClass | 'all' | null>(null);
  const [level, setLevel] = useState<'0.5' | '0.8' | '0.9' | '0.95'>('0.8');

  const personal = useMemo(() => (games.data ?? []).filter((g) => isPersonal(g, prefs.includeDemoInStats)), [games.data, prefs.includeDemoInStats]);
  const entries = useMemo(() => (games.data && analyses.data ? analysedEntries(games.data, analyses.data, prefs.includeDemoInStats) : []), [games.data, analyses.data, prefs.includeDemoInStats]);
  const weak = useMemo(() => detectWeaknesses(entries), [entries]);
  const tally = useMemo(() => gradeTally(entries), [entries]);
  const times = useMemo(() => timeTally(entries), [entries]);

  const rated = personal.filter((g) => g.userOutcome && g.opponentRating !== undefined);
  const counts = new Map<TimeClass, number>();
  for (const g of rated) counts.set(g.timeClass, (counts.get(g.timeClass) ?? 0) + 1);
  const classes = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const tc: TimeClass | 'all' = tcChoice ?? classes[0] ?? 'all';

  const profile = (profiles.data ?? []).find((p) => p.username === prefs.chesscomUser.trim().toLowerCase()) ?? profiles.data?.[0];
  const official = tc === 'all' ? undefined : profile?.stats[`chess_${tc}`]?.last?.rating;
  const analysisMap = useMemo(() => new Map((analyses.data ?? []).map((a) => [a.gameId, a])), [analyses.data]);
  const report = useMemo(() => (games.data ? buildStrengthReport(games.data, analysisMap, tc, official, { level: Number(level) as 0.5 | 0.8 | 0.9 | 0.95, includeDemo: prefs.includeDemoInStats }) : null), [games.data, analysisMap, tc, official, level, prefs.includeDemoInStats]);

  if (games.loading || analyses.loading) return <Spinner label="Reading your games…" />;
  if (personal.length === 0)
    return (
      <div className="stack page-narrow">
        <PageHead title="Insights" sub="Recurring weaknesses and a careful estimate of your strength." />
        <Empty title="Nothing to show yet" action={<div className="row"><Link className="btn btn-primary" to="/chesscom">Import from Chess.com</Link><Link className="btn" to="/library">Paste a PGN</Link></div>}>
          Insights come from your own games: import some and analyse them first. The demo game is left out on purpose.
        </Empty>
      </div>
    );

  const r = report?.results;
  return (
    <div className="stack">
      <PageHead title="Insights" sub={`From ${entries.length} analysed of ${personal.length} games.`} />

      {tally.moves > 0 ? <MoveGrades tally={tally} /> : null}
      {tally.moves > 0 ? <TimeInsights tally={times} /> : null}

      <section className="stack" aria-labelledby="weak-h">
        <h2 id="weak-h">What keeps costing you</h2>
        {entries.length === 0 ? (
          <Banner kind="info">
            None of your games are analysed yet, so there is nothing to find. Go to <Link to="/library">Games</Link> and choose <strong>Analyse</strong>.
          </Banner>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              {weak.note}
            </p>
            <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
              <StatBlock label="Games analysed" value={weak.gamesConsidered} />
              <StatBlock label="Your moves" value={weak.movesConsidered} />
              <StatBlock label="Mistakes + blunders" value={weak.mistakes} />
            </div>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Average win-percentage lost per move, by phase of the game</caption>
                <thead>
                  <tr>
                    <th scope="col">Phase</th>
                    <th scope="col" className="right">Your moves</th>
                    <th scope="col" className="right">Avg. points lost per move</th>
                  </tr>
                </thead>
                <tbody>
                  {weak.phases.map((p) => (
                    <tr key={p.phase}>
                      <th scope="row" style={{ textTransform: 'capitalize' }}>{p.phase}</th>
                      <td className="right num">{p.moves}</td>
                      <td className="right num">{p.moves ? p.avgWinLoss.toFixed(2) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {weak.weaknesses.length === 0 ? (
              <Banner kind="ok">No mistake type repeated often enough to call it a pattern. A pattern needs at least two mistakes in two different games.</Banner>
            ) : (
              weak.weaknesses.map((w) => <WeaknessCard key={w.category} w={w} />)
            )}
            <div className="row">
              <Link className="btn" to="/puzzles">
                <Icon name="target" /> Practise with puzzles from these games
              </Link>
              <Link className="btn" to="/train">
                More training tools
              </Link>
            </div>
          </>
        )}
      </section>

      <section className="stack" aria-labelledby="str-h">
        <h2 id="str-h">Your strength: a careful estimate</h2>
        <Banner kind="info">
          Four different things are shown separately and never merged: your <strong>official rating</strong> (Chess.com&apos;s number), a <strong>results-based estimate</strong> with a range (from who you beat and lost to), the plain <strong>performance rating</strong> of these games, and <strong>move-quality statistics</strong> (from the engine). Kibitz does not turn average centipawn loss into an Elo number, because no sound formula for that exists.
        </Banner>
        {classes.length === 0 ? (
          <Empty title="No rated games to estimate from">Estimates need games with opponent ratings, which Chess.com imports have. Games played against the engine have no human rating to compare with.</Empty>
        ) : (
          <>
            <div className="row">
              <Segmented<string>
                label="Time class"
                value={tc}
                onChange={(v) => setTcChoice(v as TimeClass | 'all')}
                options={[...classes.map((c) => ({ value: c, label: `${TIME_CLASS_LABEL[c]} (${counts.get(c)})` })), { value: 'all', label: 'All mixed' }]}
              />
              <Segmented<typeof level> label="Interval" value={level} onChange={setLevel} options={[{ value: '0.5', label: '50%' }, { value: '0.8', label: '80%' }, { value: '0.9', label: '90%' }, { value: '0.95', label: '95%' }]} />
            </div>

            {report ? (
              <div className="sheet pad stack">
                <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  <StatBlock label="Official rating" value={official ?? '—'} sub={official !== undefined ? `Chess.com ${TIME_CLASS_LABEL[tc as TimeClass]}` : tc === 'all' ? 'Pick one time class' : 'Not imported'} />
                  <StatBlock label="Results-based estimate" value={r ? r.rating : '—'} sub={r ? `${Math.round(r.level * 100)}% range ${r.low} to ${r.high}` : 'Needs 5+ rated games'} />
                  <StatBlock
                    label="Performance rating"
                    value={report.performance ? report.performance.rating : '—'}
                    sub={report.performance ? `${report.performance.games} games, ${(report.performance.score * 100).toFixed(0)}% score vs avg. opponent ${report.performance.avgOpponent}${report.performance.capped ? ' (capped at ±800)' : ''}` : 'Needs rated games'}
                  />
                  <StatBlock label="Games used" value={report.games} sub={`${report.record.win}W ${report.record.draw}D ${report.record.loss}L`} />
                </div>
                {report.performance && report.games < 20 ? <p className="small muted" style={{ margin: 0 }}>The performance rating uses only these {report.games} games with no prior or range, so it moves a lot from game to game. Prefer the estimate above, which carries a range.</p> : null}
                {r ? (
                  <>
                    <RangeViz low={r.low} high={r.high} rating={r.rating} official={official} label={`Estimated rating ${r.rating}, ${Math.round(r.level * 100)} percent range ${r.low} to ${r.high}${official !== undefined ? `, official rating ${official}` : ''}`} />
                    <p style={{ margin: 0 }}>
                      Confidence: <strong>{report.confidence}</strong> (uncertainty about ±{Math.round(r.sd)} before the interval is applied; {r.effectiveGames.toFixed(0)} effective games after recency weighting).
                      {report.gapToOfficial !== undefined ? ` The estimate is ${Math.abs(report.gapToOfficial)} points ${report.gapToOfficial >= 0 ? 'above' : 'below'} your official rating${Math.abs(report.gapToOfficial) <= (r.high - r.low) / 2 ? ', which is within the range, so the two agree.' : ', outside the range: recent form may differ from the official number.'}` : ''}
                    </p>
                    <div className="row">
                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() =>
                          void addStrength({ at: Date.now(), timeClass: tc, games: report.games, rating: r.rating, low: r.low, high: r.high, level: r.level, official, method: 'MAP Elo with Gaussian prior, recency-weighted (v1)', quality: report.quality ? { accuracy: report.quality.accuracy, acpl: report.quality.acpl, analyzedGames: report.quality.analyzedGames } : undefined }).then(() => toast.success('Saved to your estimate history.'))
                        }
                      >
                        Save to history
                      </button>
                    </div>
                  </>
                ) : null}
                {report.notes.map((n) => (
                  <p key={n} className="small muted" style={{ margin: 0 }}>
                    {n}
                  </p>
                ))}

                <h3 style={{ fontSize: '1.05rem', marginTop: 6 }}>Move quality (from the engine)</h3>
                {report.quality ? (
                  <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
                    <StatBlock label="Accuracy" value={`${report.quality.accuracy.toFixed(1)}%`} sub={`${report.quality.analyzedGames} games, ${report.quality.moves} moves`} />
                    <StatBlock label="Avg. loss" value={`${report.quality.acpl.toFixed(0)} cp`} />
                    <StatBlock label="Best-move rate" value={`${report.quality.bestMoveRate.toFixed(0)}%`} />
                    <StatBlock label="Blunders" value={report.quality.blunderRate.toFixed(1)} sub="per 100 moves" />
                    <StatBlock label="Mistakes" value={report.quality.mistakeRate.toFixed(1)} sub="per 100 moves" />
                  </div>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>Analyse some of these games to see move-quality statistics.</p>
                )}

                <h3 style={{ fontSize: '1.05rem', marginTop: 6 }}>Quality-implied rating (experimental)</h3>
                {report.implied.status === 'ok' ? (
                  <p style={{ margin: 0 }}>
                    About <strong>{report.implied.rating}</strong> (range {report.implied.low} to {report.implied.high}, from {report.implied.points} games). Calibrated only on your opponents&apos; accuracy against their ratings, so it carries every bias of a small, self-selected sample. Treat it as a cross-check on the results-based number, not a replacement.
                  </p>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    Not available: {report.implied.reason}
                  </p>
                )}

                <h3 style={{ fontSize: '1.05rem', marginTop: 6 }}>Does the model predict your results?</h3>
                {report.backtest ? (
                  <p style={{ margin: 0 }}>{report.backtest.description}</p>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>Needs at least 15 rated games in this category to test predictions on games it has not seen.</p>
                )}
              </div>
            ) : null}

            {history.data?.length ? (
              <section className="sheet pad stack-sm" aria-label="Estimate history">
                <h3 style={{ fontSize: '1.05rem' }}>Saved estimates</h3>
                <div className="table-wrap">
                  <table className="table">
                    <caption className="sr-only">Previously saved strength estimates</caption>
                    <thead>
                      <tr>
                        <th scope="col">Saved</th>
                        <th scope="col">Class</th>
                        <th scope="col" className="right">Estimate</th>
                        <th scope="col" className="right">Range</th>
                        <th scope="col" className="right">Official</th>
                        <th scope="col" className="right">Games</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.data.slice(0, 12).map((h) => (
                        <tr key={h.id ?? h.at}>
                          <td className="nowrap">{formatDateTime(h.at)}</td>
                          <td>{h.timeClass === 'all' ? 'Mixed' : TIME_CLASS_LABEL[h.timeClass]}</td>
                          <td className="right num">{h.rating}</td>
                          <td className="right num">{h.low} to {h.high} ({Math.round(h.level * 100)}%)</td>
                          <td className="right num">{h.official ?? '—'}</td>
                          <td className="right num">{h.games}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}
          </>
        )}
        <p className="hint">
          How the estimate works, what it cannot tell you and why: see <Link to="/help#strength">Help: strength estimation</Link>.
        </p>
      </section>
    </div>
  );
}
