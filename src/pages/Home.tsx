import { BackupReminder } from '../components/AutoBackup';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banner, Empty, PageHead, StatBlock } from '../components/ui';
import { Icon } from '../components/Icon';
import { analysedEntries } from '../lib/games/entries';
import { isPersonal } from '../lib/games/records';
import { detectWeaknesses } from '../lib/analysis/weaknesses';
import { ensureDemoGame } from '../lib/data/ensureDemo';
import { trainingPlan } from '../lib/training/plan';
import { findDeviations } from '../lib/training/repertoire';
import { isDue } from '../lib/training/srs';
import { localDateKey, listCalendar } from '../lib/storage/repos';
import { useAnalyses, useGames, usePuzzles, useRepertoire, useSrs } from '../hooks/data';
import { useQuery } from '../hooks/useQuery';
import { useSessionView } from '../hooks/session';
import { StreakCard } from '../components/StreakCard';
import { usePrefs } from '../hooks/usePrefs';
import { formatDate, gameSubtitle, gameTitle } from '../lib/ui/format';
import { engineStates } from '../services/engines';
import { useStore } from '../services/store';
import { toast } from '../services/toast';

export default function Home() {
  const nav = useNavigate();
  const [prefs] = usePrefs();
  const games = useGames();
  const analyses = useAnalyses();
  const puzzles = usePuzzles();
  const srs = useSrs();
  const lines = useRepertoire();
  const calendar = useQuery(listCalendar, ['calendar']);
  const engines = useStore(engineStates);
  const sv = useSessionView();

  const view = useMemo(() => {
    if (!games.data || !analyses.data || !puzzles.data || !srs.data || !lines.data) return null;
    const personal = games.data.filter((g) => isPersonal(g, prefs.includeDemoInStats));
    const entries = analysedEntries(games.data, analyses.data, prefs.includeDemoInStats);
    const weak = detectWeaknesses(entries);
    const now = Date.now();
    const due = srs.data.filter((s) => isDue(s, now)).length;
    const fresh = srs.data.filter((s) => s.attempts === 0).length;
    const today = calendar.data?.find((d) => d.date === localDateKey());
    const rep = lines.data;
    const colorLines = (c: 'w' | 'b') => rep.filter((l) => l.color === c);
    const deviations = (['w', 'b'] as const).reduce((n, c) => n + findDeviations(personal, colorLines(c), c).length, 0);
    const plan = trainingPlan({
      weaknesses: weak.weaknesses,
      duePuzzles: due,
      newPuzzles: fresh,
      puzzlesToday: today?.puzzles ?? 0,
      dailyGoal: prefs.dailyGoal,
      unanalysedGames: personal.filter((g) => !g.analyzed).length,
      gamesTotal: personal.length,
      repertoireLines: lines.data.length,
      deviations,
    });
    const last = [...games.data].sort((a, b) => b.endTime - a.endTime).find((g) => g.analyzed);
    return { personal, entries, plan, due, last, today, puzzleCount: puzzles.data.length };
  }, [games.data, analyses.data, puzzles.data, srs.data, lines.data, calendar.data, prefs.includeDemoInStats, prefs.dailyGoal]);

  const loading = !view;
  const demo = games.data?.find((g) => g.source === 'demo');
  const engineReady = Object.values(engines).some((e) => e.status === 'ready');

  return (
    <div className="stack">
      <PageHead title="Your desk" sub="What to work on today, built from your own games." />
      <BackupReminder />
      {loading ? null : view.personal.length === 0 ? (
        <section className="sheet pad stack" aria-labelledby="start">
          <h2 id="start">Start with something real</h2>
          <p className="muted">Kibitz gets useful once it has your games. Pick whichever is easiest.</p>
          <div className="grid-3">
            <Link to="/chesscom" className="nav-card">
              <strong>Import from Chess.com</strong>
              <span>Public games for any username. No password needed.</span>
            </Link>
            <Link to="/library" className="nav-card">
              <strong>Paste a PGN</strong>
              <span>From a file, another site or a board you recorded.</span>
            </Link>
            <Link to="/play" className="nav-card">
              <strong>Play the engine</strong>
              <span>Choose its strength, then review the game afterwards.</span>
            </Link>
          </div>
          <div className="row">
            <button
              className="btn"
              type="button"
              onClick={() =>
                void ensureDemoGame()
                  .then((id) => nav(`/analysis/${id}`))
                  .catch(() => toast.error('Could not add the demo game.'))
              }
            >
              <Icon name="eye" /> {demo ? 'Open the demo game' : 'Explore with the demo game'}
            </button>
            <span className="hint">Demo data is labelled and never counted in your statistics.</span>
          </div>
        </section>
      ) : (
        <>
        {sv.loading ? null : (
          <section className="sheet pad stack" aria-labelledby="session-h">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <h2 id="session-h" style={{ margin: 0 }}>Today&apos;s session</h2>
                <span className="muted small">
                  {sv.session.complete ? 'All done for today.' : sv.session.steps.length ? `${sv.session.doneCount} of ${sv.session.steps.length} steps done, about ${sv.session.steps.filter((s) => !s.complete).reduce((n, s) => n + s.minutes, 0)} minutes left.` : 'Nothing planned yet.'}
                </span>
              </div>
              <Link className="btn btn-primary" to="/session">
                <Icon name="play" /> {sv.session.complete ? 'See the session' : sv.session.doneCount ? 'Continue' : "Start today's session"}
              </Link>
            </div>
            <StreakCard streak={sv.streak} />
          </section>
        )}
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <section className="sheet" aria-labelledby="plan">
            <div className="sheet-head">
              <h2 id="plan">Today</h2>
              <Link to="/train/calendar" className="small">
                Training calendar
              </Link>
            </div>
            <ul className="list-plain list-rows" style={{ padding: '0 16px' }}>
              {view.plan.map((p) => (
                <li key={p.id}>
                  <Link to={p.to} style={{ textDecoration: 'none', color: 'inherit' }} className="row-nowrap">
                    <span className="grow">
                      <strong>{p.title}</strong>
                      <span className="muted small" style={{ display: 'block' }}>
                        {p.detail}
                      </span>
                    </span>
                    <span className="chip">{p.minutes} min</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="sheet pad stack" aria-labelledby="numbers">
            <h2 id="numbers">At a glance</h2>
            <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
              <StatBlock label="Games" value={view.personal.length} sub={`${view.entries.length} analysed`} />
              <StatBlock label="Puzzles due" value={view.due} sub={`${view.puzzleCount} in your set`} />
              <StatBlock label="Solved today" value={`${view.today?.puzzlesCorrect ?? 0}/${prefs.dailyGoal}`} />
            </div>
            {view.last ? (
              <div>
                <div className="label">Last analysed game</div>
                <Link to={`/analysis/${view.last.id}`}>{gameTitle(view.last)}</Link>
                <div className="small muted">{gameSubtitle(view.last)}</div>
              </div>
            ) : null}
          </section>
        </div>
        </>
      )}

      {!loading && view.personal.length > 0 && view.entries.length === 0 ? (
        <Banner kind="info">
          None of your games are analysed yet. Open the <Link to="/library">Games</Link> page and choose <strong>Analyse</strong>. A game takes about {prefs.analysisPreset === 'deep' ? 'a minute or two' : 'under a minute'} on a modern laptop.
        </Banner>
      ) : null}

      <section aria-labelledby="tools">
        <h2 id="tools" style={{ marginBottom: 10 }}>
          Jump in
        </h2>
        <div className="grid-3">
          <Link className="nav-card" to="/play">
            <strong>Play</strong>
            <span>Against Stockfish at a strength you choose, with clocks and takebacks.</span>
          </Link>
          <Link className="nav-card" to="/puzzles">
            <strong>Puzzles from your games</strong>
            <span>Positions where you went wrong, checked by the engine.</span>
          </Link>
          <Link className="nav-card" to="/insights">
            <strong>Insights</strong>
            <span>Recurring weaknesses and a careful estimate of your strength.</span>
          </Link>
          <Link className="nav-card" to="/openings">
            <strong>Openings</strong>
            <span>Drill the lines you actually play.</span>
          </Link>
        </div>
      </section>

      {games.data && games.data.length === 0 ? null : engineReady ? null : (
        <p className="hint">The engine starts the first time you analyse or play. Its download is about 2 MB and is cached by your browser afterwards.</p>
      )}
      {games.error ? <Empty title="Could not read saved games">{games.error}</Empty> : null}
      {games.data && games.data.length > 0 ? <p className="hint">Most recent import: {formatDate(Math.max(...games.data.map((g) => g.addedAt)))}.</p> : null}
    </div>
  );
}
