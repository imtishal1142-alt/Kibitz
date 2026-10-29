import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Empty, PageHead, Spinner } from '../../components/ui';
import { Board, ARROW_COLORS } from '../../components/Board';
import { ClassBadge } from '../../components/ClassBadge';
import { Icon } from '../../components/Icon';
import { Pv } from '../../components/Pv';
import { assessMove } from '../../lib/analysis/assess';
import type { MoveAssessment } from '../../lib/analysis/assess';
import { idbEvalCache } from '../../lib/analysis/gameAnalysis';
import { userMistakes } from '../../lib/analysis/weaknesses';
import { isSevere, lossClassOf } from '../../lib/chess/classify';
import { resolveMove } from '../../lib/chess/rules';
import { bumpCalendar } from '../../lib/storage/repos';
import { practiceLink } from '../../lib/training/weakspots';
import { RETEST_OK_LOSS, loadRetests, queueRetests, recordRetest, retestKey } from '../../lib/training/retest';
import { gameDateText, moveNumberLabel } from '../../lib/ui/format';
import { usePersonalEntries } from '../../hooks/data';
import { getEngine } from '../../services/engines';
import { playSound } from '../../services/sound';
import type { GameRecord, MoveAnalysis } from '../../lib/types';

interface Item {
  game: GameRecord;
  move: MoveAnalysis;
}
type Phase = 'try' | 'busy' | 'result' | 'error';

export default function MistakeReplay() {
  const { entries, loading } = usePersonalEntries();
  // The queue is fixed when the page opens (due retests, then mistakes never retried, biggest loss first), so
  // answering one does not reshuffle the rest.
  const [queue, setQueue] = useState<{ items: Item[]; later: number; learned: number; retried: Set<string> } | null>(null);
  useEffect(() => {
    if (!entries || queue) return;
    let live = true;
    void loadRetests().then((map) => {
      if (!live) return;
      const all: (Item & { key: string; winLoss: number })[] = [];
      for (const { game, analysis } of entries) {
        if (!game.userColor) continue;
        for (const move of userMistakes(analysis, game.userColor)) if (isSevere(lossClassOf(move))) all.push({ game, move, key: retestKey(game.id, move.ply), winLoss: move.winLoss });
      }
      const q = queueRetests(all, map, Date.now());
      setQueue({ items: [...q.due, ...q.fresh], later: q.later.length, learned: q.learned, retried: new Set(Object.values(map).filter((s) => s.attempts > 0).map((s) => s.puzzleId)) });
    });
    return () => {
      live = false;
    };
  }, [entries, queue]);
  const items = queue?.items ?? [];

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('try');
  const [shown, setShown] = useState<string | null>(null);
  const [res, setRes] = useState<MoveAssessment | null>(null);
  const [error, setError] = useState('');
  const [next, setNext] = useState<{ ok: boolean; days: number } | null>(null);
  const token = useRef(0);
  const item = items[index];

  if (loading || !queue) return <Spinner label="Loading your games…" />;

  const onTry = (m: { uci: string }): boolean => {
    if (!item || phase !== 'try') return false;
    const fen = item.move.fenBefore;
    if (m.uci === item.move.uci) {
      playSound('wrong');
      setShown(null);
      setError('That is the move you played in the game. Look for a different one.');
      return false;
    }
    setError('');
    const my = ++token.current;
    setPhase('busy');
    setShown(resolveMove(fen, m.uci)?.fenAfter ?? null);
    void (async () => {
      try {
        const engine = await getEngine('live');
        const a = await assessMove(engine, fen, m.uci, { depth: 14, cache: idbEvalCache });
        if (!a || my !== token.current) return;
        setRes(a);
        setPhase('result');
        const ok = a.winLoss <= RETEST_OK_LOSS;
        playSound(ok ? 'correct' : 'wrong');
        void recordRetest(item.game.id, item.move.ply, ok, 0).then((s) => setNext({ ok, days: Math.max(0, Math.round((s.due - Date.now()) / 86_400_000)) }));
        void bumpCalendar({ reviews: 1, retests: 1 });
      } catch (e) {
        if (my === token.current) {
          setError(e instanceof Error ? e.message : 'The engine failed.');
          setPhase('error');
        }
      }
    })();
    return true;
  };

  const advance = () => {
    setIndex((i) => i + 1);
    setPhase('try');
    setShown(null);
    setRes(null);
    setNext(null);
    setError('');
  };

  const better = res && item ? item.move.winLoss - res.winLoss : 0;

  return (
    <div className="stack">
      <PageHead title="Mistake replay" sub="Go back to the positions where you went wrong and try something else." actions={<Link className="btn" to="/train">All tools</Link>} />
      {items.length === 0 ? (
        <Empty title="No mistakes to replay" action={<Link className="btn btn-primary" to="/library">Analyse some games</Link>}>
          This needs analysed games of yours that contain a mistake or blunder. Demo games are not used.
        </Empty>
      ) : !item ? (
        <section className="sheet pad stack-sm page-narrow">
          <h2>All {items.length} replayed</h2>
          <p className="muted" style={{ margin: 0 }}>
            You have been through every mistake that was due. {queue.later ? `${queue.later} more come back on their schedule (1, 3, 7, 14 and 30 days after you solve them). ` : ''}Analyse more games for more.
          </p>
          <div><button className="btn btn-primary" type="button" onClick={() => setIndex(0)}>Go through them again</button></div>
        </section>
      ) : (
        <div className="analysis">
          <div className="board-wrap">
            <Board
              fen={shown ?? item.move.fenBefore}
              orientation={item.move.color}
              movable={phase === 'try' ? item.move.color : null}
              onMove={(m) => onTry(m)}
              arrows={phase === 'result' && item.move.bestUci ? [{ from: item.move.bestUci.slice(0, 2), to: item.move.bestUci.slice(2, 4), color: ARROW_COLORS.best }] : []}
              ariaLabel={`Mistake replay. ${item.move.color === 'w' ? 'White' : 'Black'} to move.`}
            />
          </div>
          <div className="stack-sm">
            <section className="sheet pad stack-sm" aria-label="Replay">
              <div className="row">
                <span className="chip">
                  {index + 1} of {items.length}
                </span>
                <ClassBadge cls={lossClassOf(item.move)} />
                {queue.retried.has(retestKey(item.game.id, item.move.ply)) ? <span className="chip chip-accent">Retest</span> : <span className="chip">New</span>}
              </div>
              <p style={{ margin: 0 }}>
                {gameDateText(item.game)}, vs {item.game.opponent ?? 'opponent'}, move {moveNumberLabel(item.move.ply, '').replace(/\.+$/, '')}: you played <strong>{item.move.san}</strong> and lost {item.move.winLoss.toFixed(0)} points of winning chances. What else was there?
              </p>
              {phase === 'try' ? <p className="muted small" style={{ margin: 0 }}>Make a different move on the board.</p> : null}
              {error ? <p role="alert" className="small" style={{ margin: 0, color: 'var(--c-blunder)' }}>{error}</p> : null}
              {phase === 'busy' ? <Spinner label="The engine is checking your move…" /> : null}
              {phase === 'error' ? <Banner kind="bad" role="alert"><button className="btn btn-sm" type="button" onClick={() => (setPhase('try'), setShown(null))}>Try again</button></Banner> : null}
              {phase === 'result' && res ? (
                <div className="stack-sm" role="status">
                  <div className="row">
                    <ClassBadge cls={res.cls} />
                    <strong>
                      {res.san}: {better >= 8 ? 'much better than in the game' : better >= 2 ? 'better than in the game' : better > -2 ? 'about as good as the game move' : 'worse than the game move'}
                    </strong>
                  </div>
                  <div className="facts">
                    <div className="facts-title">Verified by the engine (depth {res.depth})</div>
                    <p style={{ margin: 0 }}>
                      Your new move loses {res.winLoss.toFixed(1)} points from the best; the game move lost {item.move.winLoss.toFixed(1)}.
                    </p>
                    {next ? (
                      <p style={{ margin: '6px 0 0' }}>
                        <strong>{next.ok ? 'Solved.' : 'Not yet.'}</strong> {next.ok ? `This mistake comes back in ${next.days} day${next.days === 1 ? '' : 's'} to check it has stuck.` : 'It comes back in a few minutes, and again until it sticks.'} A move that loses at most {RETEST_OK_LOSS} points counts.
                      </p>
                    ) : null}
                    {res.bestSan ? (
                      <p style={{ margin: '6px 0 0' }}>
                        The engine&apos;s choice: <strong>{res.bestSan}</strong> <Pv fen={item.move.fenBefore} sans={res.bestPvSan} max={8} />
                      </p>
                    ) : null}
                    {res.winLoss >= 10 && res.replyPvSan[0] ? (
                      <p style={{ margin: '6px 0 0' }}>
                        After {res.san} the engine would answer <strong>{res.replyPvSan[0]}</strong>.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="row">
                {phase === 'try' ? (
                  <button className="btn btn-sm" type="button" onClick={advance}>
                    Skip
                  </button>
                ) : null}
                {phase === 'result' ? (
                  <button className="btn btn-primary" type="button" onClick={advance} autoFocus>
                    Next mistake <Icon name="right" />
                  </button>
                ) : null}
                <Link className="btn btn-sm" to={`/analysis/${item.game.id}?ply=${item.move.ply - 1}`}>
                  Open in the game
                </Link>
                <Link className="btn btn-sm" to={practiceLink(item.move.fenBefore, item.move.color)}>
                  Play it out
                </Link>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
