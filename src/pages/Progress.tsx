import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Empty, PageHead, Spinner, StatBlock } from '../components/ui';
import { MoveGrades } from '../components/MoveGrades';
import { StreakCard } from '../components/StreakCard';
import { TrendChart } from '../components/TrendChart';
import { CATEGORY_LABEL } from '../lib/analysis/explain';
import type { Category } from '../lib/analysis/explain';
import { PRACTICE_RULES, bucketByMonth, collectHistory, practiceFindings } from '../lib/analysis/progress';
import { gradeTally } from '../lib/analysis/tally';
import { userMistakes } from '../lib/analysis/weaknesses';
import { isSevere, lossClassOf } from '../lib/chess/classify';
import { analysedEntries } from '../lib/games/entries';
import { isPersonal } from '../lib/games/records';
import { listAttempts, listCalendar, listPuzzles, localDateKey } from '../lib/storage/repos';
import { loadRetests, queueRetests, retestKey } from '../lib/training/retest';
import { streakInfo } from '../lib/training/streak';
import { useAnalyses, useGames } from '../hooks/data';
import { usePrefs } from '../hooks/usePrefs';
import { useQuery } from '../hooks/useQuery';

const monthLabel = (key: string): string => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, 1).toLocaleString(undefined, { month: 'short', year: '2-digit' });
};

export default function Progress() {
  const [prefs] = usePrefs();
  const games = useGames();
  const analyses = useAnalyses();
  const calendar = useQuery(listCalendar, ['calendar']);
  const attempts = useQuery(() => listAttempts(Date.now() - PRACTICE_RULES.windowDays * 24 * 3600 * 1000), ['attempts']);
  const puzzles = useQuery(listPuzzles, ['puzzles']);
  const retests = useQuery(loadRetests, ['kv']);

  const entries = useMemo(() => (games.data && analyses.data ? analysedEntries(games.data, analyses.data, prefs.includeDemoInStats) : []), [games.data, analyses.data, prefs.includeDemoInStats]);
  const personal = useMemo(() => (games.data ?? []).filter((g) => isPersonal(g, prefs.includeDemoInStats)), [games.data, prefs.includeDemoInStats]);
  const history = useMemo(() => collectHistory(entries), [entries]);
  const buckets = useMemo(() => bucketByMonth(history.stats, history.mistakes), [history]);
  const tally = useMemo(() => gradeTally(entries), [entries]);
  const findings = useMemo(() => {
    const theme = new Map((puzzles.data ?? []).map((p) => [p.id, p.theme]));
    const byTheme: Record<string, number> = {};
    for (const a of attempts.data ?? []) {
      const t = theme.get(a.puzzleId);
      if (t) byTheme[t] = (byTheme[t] ?? 0) + 1;
    }
    return practiceFindings(history.stats, history.mistakes, byTheme, Date.now());
  }, [history, attempts.data, puzzles.data]);
  const retestSummary = useMemo(() => {
    const items = entries.flatMap(({ game, analysis }) => (game.userColor ? userMistakes(analysis, game.userColor).filter((m) => isSevere(lossClassOf(m))).map((m) => ({ key: retestKey(game.id, m.ply), winLoss: m.winLoss })) : []));
    const q = queueRetests(items, retests.data ?? {}, Date.now());
    return { total: items.length, learned: q.learned, due: q.due.length, later: q.later.length, fresh: q.fresh.length };
  }, [entries, retests.data]);

  if (games.loading || analyses.loading || calendar.loading) return <Spinner label="Reading your history…" />;
  if (personal.length === 0)
    return (
      <div className="stack page-narrow">
        <PageHead title="Progress" sub="How you are changing over time." />
        <Empty title="Nothing to chart yet" action={<Link className="btn btn-primary" to="/chesscom">Import from Chess.com</Link>}>
          Progress is measured from your own analysed games. Import some, analyse them, and play more over the next weeks.
        </Empty>
      </div>
    );

  const streak = streakInfo(calendar.data ?? [], localDateKey());
  const label = (b: { month: string }) => monthLabel(b.month);
  const cats = new Map<Category, number>();
  for (const b of buckets) for (const [c, v] of Object.entries(b.categories) as [Category, number][]) cats.set(c, (cats.get(c) ?? 0) + v);
  const topCats = [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
  const lastMonths = buckets.slice(-6);

  return (
    <div className="stack">
      <PageHead title="Progress" sub={`From ${entries.length} analysed of ${personal.length} games.`} actions={<Link className="btn btn-primary" to="/session">Today&apos;s session</Link>} />
      <section className="sheet pad stack-sm" aria-label="Streak">
        <StreakCard streak={streak} />
      </section>

      {tally.moves > 0 ? <MoveGrades tally={tally} /> : null}

      <section className="stack" aria-labelledby="trend-h">
        <h2 id="trend-h">Month by month</h2>
        {buckets.length < 2 ? (
          <Banner kind="info">
            {buckets.length === 0 ? 'No analysed games of yours yet.' : 'Only one month of analysed games so far.'} Trends appear once there are games from at least two months. Until then, the numbers below are a starting point.
          </Banner>
        ) : null}
        {buckets.length > 0 ? (
          <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <TrendChart title="Accuracy" unit="%" better="higher" points={buckets.map((b) => ({ label: label(b), value: b.accuracy }))} />
            <TrendChart title="Blunders per 100 moves" better="lower" points={buckets.map((b) => ({ label: label(b), value: b.blunderRate }))} />
            <TrendChart title="Mistakes per 100 moves" better="lower" points={buckets.map((b) => ({ label: label(b), value: b.mistakeRate }))} />
          </div>
        ) : null}
        {buckets.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Games, moves and accuracy by month</caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col" className="right">Games</th>
                  <th scope="col" className="right">Your moves</th>
                  <th scope="col" className="right">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {[...buckets].reverse().map((b) => (
                  <tr key={b.month}>
                    <th scope="row">{label(b)}</th>
                    <td className="right num">{b.games}</td>
                    <td className="right num">{b.moves}</td>
                    <td className="right num">{b.accuracy.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="hint" style={{ margin: 0 }}>
          Accuracy is from win-chance loss on each of your moves (see Help), weighted by moves. Months with few games move around a lot; do not read much into a single month.
        </p>
      </section>

      <section className="stack" aria-labelledby="weak-trend-h">
        <h2 id="weak-trend-h">Your recurring mistakes over time</h2>
        {topCats.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No categorised mistakes yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption>Mistakes of each kind per 100 of your moves, for the last {lastMonths.length} month{lastMonths.length === 1 ? '' : 's'} (lower is better)</caption>
              <thead>
                <tr>
                  <th scope="col">Kind</th>
                  {lastMonths.map((b) => (
                    <th key={b.month} scope="col" className="right">{label(b)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topCats.map((c) => (
                  <tr key={c}>
                    <th scope="row">{CATEGORY_LABEL[c]}</th>
                    {lastMonths.map((b) => (
                      <td key={b.month} className="right num">{(b.categories[c] ?? 0).toFixed(1)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="stack" aria-labelledby="practice-h">
        <h2 id="practice-h">Is your practice working?</h2>
        {findings.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nothing to report yet. This check needs at least {PRACTICE_RULES.minGamesEach} games in each of the last {PRACTICE_RULES.windowDays} days and the {PRACTICE_RULES.earlierDays} days before, {PRACTICE_RULES.minPractice}+ puzzle attempts on a theme, and a mistake that happened at least {PRACTICE_RULES.minEarlierCount} times earlier. It is quiet rather than guessing when the evidence is thin.
          </p>
        ) : (
          <ul className="list-plain stack-sm">
            {findings.map((f) => (
              <li key={f.category}>
                <Banner kind={f.verdict === 'improving' ? 'ok' : 'warn'}>
                  <div>
                    <strong>{f.label}: {f.verdict === 'improving' ? 'improving' : 'not improving yet'}.</strong> {f.message}
                  </div>
                </Banner>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack" aria-labelledby="retest-h">
        <h2 id="retest-h">Your old mistakes</h2>
        <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
          <StatBlock label="Mistakes and blunders" value={retestSummary.total} sub="in analysed games" />
          <StatBlock label="Not retried yet" value={retestSummary.fresh} />
          <StatBlock label="Due again" value={retestSummary.due} />
          <StatBlock label="Learned" value={retestSummary.learned} sub="solved at the longest interval" />
        </div>
        <div className="row">
          <Link className="btn" to="/train/mistakes">Retest mistakes</Link>
        </div>
      </section>
    </div>
  );
}
