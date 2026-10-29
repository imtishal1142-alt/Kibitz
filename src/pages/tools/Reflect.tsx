import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Empty, Field, PageHead, Spinner } from '../../components/ui';
import { ClassBadge } from '../../components/ClassBadge';
import { GamePicker } from '../../components/GamePicker';
import { Icon } from '../../components/Icon';
import { moveLabel } from '../../lib/analysis/explain';
import { listReflections, putReflection } from '../../lib/storage/repos';
import { bumpCalendar } from '../../lib/storage/repos';
import { formatDate, formatDateTime, gameDateText, gameTitle } from '../../lib/ui/format';
import { useAnalyses, useGames } from '../../hooks/data';
import { useQuery } from '../../hooks/useQuery';
import { toast } from '../../services/toast';

export default function Reflect() {
  const { id } = useParams();
  const nav = useNavigate();
  const games = useGames();
  const analyses = useAnalyses();
  const reflections = useQuery(() => listReflections(), ['reflections']);
  const eligible = useMemo(() => (games.data ?? []).filter((g) => g.userColor && g.source !== 'demo'), [games.data]);
  const game = eligible.find((g) => g.id === id);
  const analysis = analyses.data?.find((a) => a.gameId === id);
  const existing = reflections.data?.find((r) => r.gameId === id);

  const [thinking, setThinking] = useState('');
  const [missed, setMissed] = useState('');
  const [study, setStudy] = useState('');
  const [rating, setRating] = useState(0);
  const [loadedFor, setLoadedFor] = useState('');

  useEffect(() => {
    if (!id || reflections.loading || loadedFor === id) return;
    setThinking(existing?.thinking ?? '');
    setMissed(existing?.missed ?? '');
    setStudy(existing?.study ?? '');
    setRating(existing?.rating ?? 0);
    setLoadedFor(id);
  }, [id, existing, reflections.loading, loadedFor]);

  if (games.loading) return <Spinner />;

  const save = () => {
    if (!game) return;
    void putReflection({ id: `rf-${game.id}`, gameId: game.id, at: Date.now(), thinking, missed, study, rating: rating || undefined }).then(() => {
      toast.success('Reflection saved.');
      if (!existing) void bumpCalendar({ lessons: 1 });
    });
  };

  const moments = analysis?.keyMoments.slice(0, 4).map((ply) => analysis.moves[ply - 1]).filter((m): m is NonNullable<typeof m> => !!m) ?? [];

  return (
    <div className="stack">
      <PageHead title="Post-game reflection" sub="Three honest questions straight after a game turn a loss into a lesson." actions={<Link className="btn" to="/train">All tools</Link>} />
      {eligible.length === 0 ? (
        <Empty title="No games of yours yet" action={<Link className="btn btn-primary" to="/chesscom">Import games</Link>}>
          Play or import a game and come back to reflect on it.
        </Empty>
      ) : (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <section className="sheet pad stack" aria-label="Reflection">
            <GamePicker games={eligible} value={id ?? ''} onChange={(v) => nav(v ? `/train/reflect/${v}` : '/train/reflect')} id="rf-game" />
            {game ? (
              <>
                <p className="muted small" style={{ margin: 0 }}>
                  {gameTitle(game)} · {gameDateText(game)} · {game.userOutcome === 'win' ? 'you won' : game.userOutcome === 'loss' ? 'you lost' : 'drawn'}
                  {existing ? ` · last reflected ${formatDateTime(existing.at)}` : ''}
                </p>
                {moments.length ? (
                  <div>
                    <div className="label">Moments to think about</div>
                    <ul className="list-plain list-rows">
                      {moments.map((m) => (
                        <li key={m.ply}>
                          <Link to={`/analysis/${game.id}?ply=${m.ply}`} className="row-nowrap">
                            <ClassBadge cls={m.cls} short /> {moveLabel(m)} <span className="muted small">{m.color === game.userColor ? 'yours' : "opponent's"}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="hint" style={{ margin: 0 }}>This game is not analysed yet. <Link to={`/analysis/${game.id}`}>Open it</Link> to find its critical moments.</p>
                )}
                <Field label="What was I thinking at the critical moments?" htmlFor="rf-1">
                  <textarea id="rf-1" className="textarea" rows={3} value={thinking} onChange={(e) => setThinking(e.target.value)} />
                </Field>
                <Field label="What did I miss, or what surprised me?" htmlFor="rf-2">
                  <textarea id="rf-2" className="textarea" rows={3} value={missed} onChange={(e) => setMissed(e.target.value)} />
                </Field>
                <Field label="What will I study or do differently next time?" htmlFor="rf-3">
                  <textarea id="rf-3" className="textarea" rows={3} value={study} onChange={(e) => setStudy(e.target.value)} />
                </Field>
                <div>
                  <div className="label" id="rf-rate">How well did I play, in my own judgement?</div>
                  <div className="row" role="radiogroup" aria-labelledby="rf-rate">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={rating === n} className={`btn btn-sm ${rating === n ? 'btn-primary' : ''}`} onClick={() => setRating(n)}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <button className="btn btn-primary" type="button" onClick={save} disabled={!thinking.trim() && !missed.trim() && !study.trim()}>
                    <Icon name="check" /> Save reflection
                  </button>
                </div>
              </>
            ) : (
              <p className="muted" style={{ margin: 0 }}>Choose a game to reflect on.</p>
            )}
          </section>
          <section className="sheet pad stack-sm" aria-label="Earlier reflections">
            <h2 style={{ fontSize: '1.05rem' }}>Earlier reflections</h2>
            {reflections.data?.length ? (
              <ul className="list-plain list-rows">
                {[...reflections.data].sort((a, b) => b.at - a.at).slice(0, 10).map((r) => {
                  const g = games.data?.find((x) => x.id === r.gameId);
                  return (
                    <li key={r.id}>
                      <Link to={`/train/reflect/${r.gameId}`}>{g ? gameTitle(g) : 'A deleted game'}</Link> <span className="muted small">{formatDate(r.at)}</span>
                      {r.study ? <div className="small">Next time: {r.study}</div> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="muted" style={{ margin: 0 }}>None yet.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
