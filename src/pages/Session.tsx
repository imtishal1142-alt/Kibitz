import { Link, useNavigate } from 'react-router-dom';
import { Empty, PageHead, Spinner } from '../components/ui';
import { Icon } from '../components/Icon';
import { StreakCard } from '../components/StreakCard';
import { useSessionView } from '../hooks/session';

export default function Session() {
  const nav = useNavigate();
  const v = useSessionView();
  if (v.loading) return <Spinner label="Planning your session…" />;
  const { session, streak } = v;
  if (session.steps.length === 0)
    return (
      <div className="stack page-narrow">
        <PageHead title="Today's session" sub="A short plan built from your own games." />
        <Empty title="Nothing to practise yet" action={<Link className="btn btn-primary" to="/play">Play a game</Link>}>
          Your session fills itself from analysed games, puzzles and mistakes. Play or import a game and analyse it, and it will appear here.
        </Empty>
      </div>
    );
  const left = session.steps.filter((s) => !s.complete).reduce((n, s) => n + s.minutes, 0);
  return (
    <div className="stack page-narrow">
      <PageHead title="Today's session" sub={session.complete ? 'All done for today.' : `About ${left} minutes left, built from your own games.`} />
      <section className="sheet pad stack" aria-label="Streak">
        <StreakCard streak={streak} />
      </section>
      <section className="sheet pad" aria-labelledby="steps-h">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 id="steps-h" style={{ margin: 0 }}>
            {session.doneCount} of {session.steps.length} steps done
          </h2>
          {session.next ? (
            <button className="btn btn-primary" type="button" onClick={() => nav(session.next!.to)}>
              <Icon name="play" /> {session.doneCount === 0 ? "Start today's session" : 'Continue'}
            </button>
          ) : null}
        </div>
        {session.complete ? (
          <p role="status" style={{ margin: '12px 0 0' }}>
            <strong>Session complete.</strong> That is the work that moves the needle: your own mistakes, reviewed and retried. Come back tomorrow to keep the streak alive, or play a game and review it.
          </p>
        ) : null}
        <ol className="list-plain" style={{ marginTop: 8 }}>
          {session.steps.map((s) => (
            <li key={s.id} className={`sess-step ${s.complete ? 'sess-done' : s.id === session.next?.id ? 'sess-next' : ''}`}>
              <span className="sess-check" aria-hidden="true">
                {s.complete ? '✓' : ''}
              </span>
              <div>
                <strong>{s.title}</strong>
                <span className="muted small" style={{ display: 'block' }}>
                  {s.detail}
                </span>
                <span className="sr-only">
                  {s.complete ? 'Done.' : `${s.done} of ${s.target} done.`}
                </span>
              </div>
              <Link className={`btn btn-sm sess-go ${s.id === session.next?.id ? 'btn-primary' : ''}`} to={s.to}>
                {s.complete ? 'Again' : s.done > 0 ? 'Continue' : 'Start'} <span className="small" style={{ color: "inherit" }}>{s.minutes} min</span>
              </Link>
              <div className="sess-bar" aria-hidden="true">
                <span style={{ width: `${(s.done / s.target) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
        <p className="hint" style={{ margin: '8px 0 0' }}>
          Progress comes from what you actually did today (puzzles solved, mistakes retried, games reviewed), so doing the work anywhere in the app counts.
        </p>
      </section>
    </div>
  );
}
