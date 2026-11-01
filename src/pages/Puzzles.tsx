import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Empty, PageHead, Segmented, Spinner, StatBlock } from '../components/ui';
import { Board, ARROW_COLORS } from '../components/Board';
import type { BoardArrow, MarkKind } from '../components/Board';
import { Icon } from '../components/Icon';
import { Pv } from '../components/Pv';
import { resolveMove, uciLineToSan, uciToSan } from '../lib/chess/rules';
import { THEME_LABEL, checkPuzzleMove, puzzleHints } from '../lib/training/puzzles';
import { buildDailySet, isDue, nextSrs, puzzleStats, updateRatings } from '../lib/training/srs';
import { addAttempt, bumpCalendar, getSrs, kvGet, kvSet, putSrs, updatePuzzle } from '../lib/storage/repos';
import { gameDateText } from '../lib/ui/format';
import { useAttempts, useGames, usePuzzles, useSrs } from '../hooks/data';
import { usePrefs } from '../hooks/usePrefs';
import { getEngine } from '../services/engines';
import { playSound } from '../services/sound';
import { toast } from '../services/toast';
import type { PuzzleRecord, PuzzleSrs } from '../lib/types';

type Mode = 'daily' | 'all' | 'theme';
type Phase = 'solving' | 'checking' | 'wrong' | 'solved' | 'revealed';

const RATING_KEY = 'puzzleRating';
const fresh = (id: string): PuzzleSrs => ({ puzzleId: id, box: 0, due: 0, attempts: 0, successes: 0, streak: 0 });

function applyUci(fen: string, uci: string): string | null {
  const r = resolveMove(fen, uci);
  return r ? r.fenAfter : null;
}

export default function Puzzles() {
  const [prefs] = usePrefs();
  const puzzles = usePuzzles();
  const srs = useSrs();
  const attempts = useAttempts();
  const games = useGames();
  const [mode, setMode] = useState<Mode>('daily');
  const [theme, setTheme] = useState('');
  const [queue, setQueue] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rating, setRating] = useState(1200);
  const [session, setSession] = useState({ solved: 0, failed: 0 });

  useEffect(() => {
    void kvGet<number>(RATING_KEY).then((r) => typeof r === 'number' && setRating(r));
  }, []);

  const byId = useMemo(() => new Map((puzzles.data ?? []).map((p) => [p.id, p])), [puzzles.data]);
  const themes = useMemo(() => [...new Set((puzzles.data ?? []).map((p) => p.theme))].sort(), [puzzles.data]);
  const dueCount = (srs.data ?? []).filter((s) => isDue(s, Date.now())).length;

  const build = useCallback(() => {
    const all = puzzles.data ?? [];
    let ids: string[];
    if (mode === 'daily') ids = buildDailySet(all, srs.data ?? [], rating, Date.now(), Math.max(1, prefs.dailyGoal)).ordered.map((p) => p.id);
    else {
      const pool = mode === 'theme' && theme ? all.filter((p) => p.theme === theme) : mode === 'theme' ? [] : all;
      const sById = new Map((srs.data ?? []).map((s) => [s.puzzleId, s]));
      ids = [...pool].sort((a, b) => (sById.get(a.id)?.attempts ?? 0) - (sById.get(b.id)?.attempts ?? 0) || Math.abs(a.difficulty - rating) - Math.abs(b.difficulty - rating)).map((p) => p.id);
    }
    setQueue(ids);
    setIndex(0);
    setSession({ solved: 0, failed: 0 });
  }, [mode, theme, puzzles.data, srs.data, rating, prefs.dailyGoal]);

  // Build the queue once the data has loaded, and again when the mode or theme changes
  // (not on every data change: that would reshuffle the puzzle you are solving).
  const built = useRef(false);
  useEffect(() => {
    if (puzzles.data && srs.data && !built.current) {
      built.current = true;
      build();
    }
  }, [puzzles.data, srs.data, build]);
  useEffect(() => {
    if (built.current) build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, theme]);

  if (puzzles.loading || srs.loading) return <Spinner label="Loading your puzzles…" />;

  const stats = puzzleStats(attempts.data ?? [], puzzles.data ?? []);
  const current = queue && index < queue.length ? byId.get(queue[index]!) : undefined;

  if (!puzzles.data?.length)
    return (
      <div className="stack page-narrow">
        <PageHead title="Puzzles" sub="Positions from your own games, checked by the engine." />
        <Empty
          title="No puzzles yet"
          action={
            <Link className="btn btn-primary" to="/library">
              Analyse some games
            </Link>
          }
        >
          Puzzles are made from the moments in your analysed games where you went wrong or missed something. Analyse a few games and they appear here automatically.
        </Empty>
      </div>
    );

  return (
    <div className="stack">
      <PageHead title="Puzzles" sub="Positions from your own games. Each one was verified by the engine." />
      <div className="row">
        <Segmented<Mode>
          label="Which puzzles"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'daily', label: `Daily set (${dueCount} due)` },
            { value: 'all', label: 'All puzzles' },
            { value: 'theme', label: 'By theme' },
          ]}
        />
        {mode === 'theme' ? (
          <>
            <label className="sr-only" htmlFor="pz-theme">
              Theme
            </label>
            <select id="pz-theme" className="select" value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="">Choose a theme…</option>
              {themes.map((t) => (
                <option key={t} value={t}>
                  {THEME_LABEL[t] ?? t}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <span className="grow" />
        <span className="chip" title="Your puzzle rating moves with each result. It starts at 1200 and is not a chess rating.">
          Puzzle rating {rating}
        </span>
      </div>

      {current && queue ? (
        <PuzzleBoard
          key={`${current.id}-${index}`}
          puzzle={current}
          position={index + 1}
          total={queue.length}
          isReview={isDue((srs.data ?? []).find((s) => s.puzzleId === current.id) ?? fresh(current.id), Date.now())}
          rating={rating}
          gameLabel={(() => {
            const g = games.data?.find((x) => x.id === current.gameId);
            return g ? `${g.white} vs ${g.black}, ${gameDateText(g)}` : 'a game you analysed';
          })()}
          onDone={(ok, newRating) => {
            setRating(newRating);
            setSession((s) => ({ solved: s.solved + (ok ? 1 : 0), failed: s.failed + (ok ? 0 : 1) }));
          }}
          onNext={() => setIndex((i) => i + 1)}
        />
      ) : (
        <section className="sheet pad stack-sm" aria-label="Set finished">
          <h2 style={{ fontSize: '1.2rem' }}>{queue?.length ? 'Set complete' : mode === 'theme' && !theme ? 'Choose a theme' : 'Nothing to practise right now'}</h2>
          {queue?.length ? (
            <p style={{ margin: 0 }}>You solved {session.solved} and missed {session.failed} this round. Missed puzzles come back in 10 minutes; ones you get right come back after 1, 3, 7, 14 and then 30 days.</p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {mode === 'daily' ? 'No puzzles are due and there are no new ones. Switch to “All puzzles” to repeat any, or analyse more games.' : mode === 'theme' && !theme ? 'Pick a theme from the list above.' : 'No puzzles match.'}
            </p>
          )}
          <div className="row">
            <button className="btn btn-primary" type="button" onClick={build}>
              <Icon name="refresh" /> Start another round
            </button>
          </div>
        </section>
      )}

      <section className="sheet pad stack-sm" aria-label="Your puzzle history">
        <h2 style={{ fontSize: '1.05rem' }}>Your puzzle history</h2>
        {stats.attempts === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Solve a puzzle and your results appear here.
          </p>
        ) : (
          <>
            <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
              <StatBlock label="Attempts" value={stats.attempts} />
              <StatBlock label="Solved first time" value={`${(stats.successRate * 100).toFixed(0)}%`} />
              <StatBlock label="Average time" value={`${Math.round(stats.avgMs / 1000)} s`} />
              <StatBlock label="Day streak" value={stats.streakDays} />
            </div>
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Results by puzzle theme</caption>
                <thead>
                  <tr>
                    <th scope="col">Theme</th>
                    <th scope="col" className="right">
                      Attempts
                    </th>
                    <th scope="col" className="right">
                      Solved first time
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byTheme.map((t) => (
                    <tr key={t.theme}>
                      <th scope="row">{THEME_LABEL[t.theme] ?? t.theme}</th>
                      <td className="right num">{t.attempts}</td>
                      <td className="right num">{(t.rate * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function PuzzleBoard({ puzzle, position, total, isReview, rating, gameLabel, onDone, onNext }: { puzzle: PuzzleRecord; position: number; total: number; isReview: boolean; rating: number; gameLabel: string; onDone: (ok: boolean, newRating: number) => void; onNext: () => void }) {
  const [fen, setFen] = useState(puzzle.fen);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>('solving');
  const [wrong, setWrong] = useState(0);
  const [hints, setHints] = useState(0);
  const [msg, setMsg] = useState('');
  const [last, setLast] = useState<{ from: string; to: string } | null>(null);
  const [mark, setMark] = useState<Record<string, MarkKind>>({});
  const started = useRef(Date.now());
  const recorded = useRef(false);
  const timers = useRef<number[]>([]);
  const hintTexts = useMemo(() => puzzleHints(puzzle), [puzzle]);
  const color = puzzle.sideToMove;

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => clearTimeout(id));
  }, []);

  const record = async (ok: boolean, revealed: boolean, move?: string) => {
    if (recorded.current) return;
    recorded.current = true;
    const t = Date.now();
    const ms = t - started.current;
    const cur = (await getSrs(puzzle.id)) ?? fresh(puzzle.id);
    await putSrs(nextSrs(cur, ok, ms, t));
    const r = updateRatings(rating, puzzle.difficulty, ok);
    await updatePuzzle({ ...puzzle, difficulty: r.puzzle });
    await kvSet(RATING_KEY, r.user);
    await addAttempt({ puzzleId: puzzle.id, at: t, ok, ms, hints, revealed, move });
    await bumpCalendar({ puzzles: 1, puzzlesCorrect: ok ? 1 : 0, reviews: isReview ? 1 : 0, minutes: Math.max(0, Math.round(ms / 60000)) });
    onDone(ok, r.user);
  };

  const finishSolved = (move: string, wrongNow = wrong) => {
    const ok = wrongNow === 0 && hints < 3;
    setPhase('solved');
    playSound('correct');
    setMsg(wrongNow === 0 ? (hints ? `Solved, using ${hints} hint${hints === 1 ? '' : 's'}.` : 'Solved.') : 'You got there, but after a wrong move, so this counts as a miss and comes back soon.');
    void record(ok, false, move).catch(() => toast.error('Could not save this result.'));
  };

  const rejectMove = (to: string, text: string) => {
    setWrong((w) => w + 1);
    setPhase('wrong');
    playSound('wrong');
    setMark({ [to]: 'bad' });
    setMsg(text);
  };

  const advance = (after: string, uci: string, first: boolean): boolean => {
    playSound('move');
    setFen(after);
    setMark({});
    const next = step + 1;
    setStep(next);
    if (next >= puzzle.solution.length) {
      finishSolved(uci);
      return true;
    }
    setMsg(first ? 'Right. Keep going.' : 'Right.');
    const reply = puzzle.solution[next]!;
    const id = window.setTimeout(() => {
      const f = applyUci(after, reply);
      if (!f) return;
      setFen(f);
      setLast({ from: reply.slice(0, 2), to: reply.slice(2, 4) });
      playSound('move');
      setStep(next + 1);
      if (next + 1 >= puzzle.solution.length) finishSolved(uci);
    }, 500);
    timers.current.push(id);
    return true;
  };

  const handleMove = (m: { from: string; to: string; promotion?: string; uci: string }): boolean => {
    if (phase !== 'solving') return false;
    const expected = puzzle.solution[step]!;
    const after = applyUci(fen, m.uci);
    if (!after) return false;
    setLast({ from: m.from, to: m.to });
    setMark({});
    if (m.uci === expected) return advance(after, m.uci, step === 0);
    if (step > 0) {
      // Later moves must follow the engine's line.
      setFen(after);
      setPhase('checking');
      timers.current.push(window.setTimeout(() => rejectMove(m.to, 'That is not the move that keeps the advantage in this line.'), 0));
      return true;
    }
    // First move differs from the stored solution: ask the engine whether it is just as good.
    setFen(after);
    setPhase('checking');
    setMsg('Checking your move with the engine…');
    void (async () => {
      try {
        const engine = await getEngine('live');
        const res = await checkPuzzleMove(engine, puzzle, m.uci);
        if (res.ok) {
          setPhase('solved');
          playSound('correct');
          setMark({ [m.to]: 'good' });
          const line = uciLineToSan(puzzle.fen, puzzle.solution, 8).sans;
          setMsg(`${uciToSan(puzzle.fen, m.uci) ?? 'Your move'} also works: the engine rates it within a few points of the best. The line I had in mind was ${line.slice(0, 4).join(' ')}.`);
          await record(wrong === 0 && hints < 3, false, m.uci);
        } else {
          rejectMove(m.to, res.bestWin !== undefined && res.win !== undefined ? `That gives up about ${Math.max(0, res.bestWin - res.win).toFixed(0)} points of winning chances compared with the best move.` : 'That is not the move the engine is looking for.');
        }
      } catch {
        rejectMove(m.to, 'The engine could not check that move, so it is counted as not matching.');
      }
    })();
    return true;
  };

  const retry = () => {
    // Back to the position the wrong move was played from.
    let f = puzzle.fen;
    for (let i = 0; i < step; i++) f = applyUci(f, puzzle.solution[i]!) ?? f;
    setFen(f);
    setPhase('solving');
    setMark({});
    setMsg('');
  };

  const reveal = () => {
    setPhase('revealed');
    const line = uciLineToSan(puzzle.fen, puzzle.solution, 10);
    setFen(puzzle.fen);
    setLast(null);
    setMsg(`The solution: ${line.sans.slice(0, 6).join(' ')}.`);
    void record(false, true).catch(() => toast.error('Could not save this result.'));
  };

  const first = puzzle.solution[0];
  const arrows: BoardArrow[] = phase === 'revealed' && first ? [{ from: first.slice(0, 2), to: first.slice(2, 4), color: ARROW_COLORS.best }] : [];
  const over = phase === 'solved' || phase === 'revealed';
  const solutionSans = puzzle.solutionSan.length ? puzzle.solutionSan : uciLineToSan(puzzle.fen, puzzle.solution, 8).sans;

  return (
    <div className="analysis">
      <div className="stack-sm">
        <div className="board-wrap">
          <Board resizable fen={fen} orientation={color} movable={phase === 'solving' ? color : null} onMove={(m) => handleMove(m)} lastMove={last} arrows={arrows} marks={mark} ariaLabel={`Puzzle board. ${color === 'w' ? 'White' : 'Black'} to move.`} />
        </div>
      </div>
      <div className="stack-sm">
        <section className="sheet pad stack-sm" aria-label="Puzzle">
          <div className="row">
            <span className="chip">
              Puzzle {position} of {total}
            </span>
            <span className="chip">{THEME_LABEL[puzzle.theme] ?? puzzle.theme}</span>
            {isReview ? <span className="chip chip-accent">Review</span> : <span className="chip">New</span>}
            <span className="chip" title="Difficulty rating of this puzzle, adjusted by results">
              Level {puzzle.difficulty}
            </span>
          </div>
          <h2 style={{ fontSize: '1.2rem' }}>{color === 'w' ? 'White' : 'Black'} to move</h2>
          <p className="muted small" style={{ margin: 0 }}>
            {puzzle.mateIn ? `Find the forced checkmate in ${puzzle.mateIn}.` : puzzle.unique ? 'Find the best move.' : 'Several moves may look fine, but one idea goes wrong. Find a move that keeps the position healthy.'}
          </p>
          <div role="status" aria-live="polite" style={{ minHeight: 24 }}>
            {phase === 'checking' && msg ? <Spinner label={msg} /> : msg ? <strong>{msg}</strong> : null}
          </div>
          {phase === 'solving' && hints > 0 ? (
            <ul className="list-plain stack-sm" style={{ margin: 0 }}>
              {hintTexts.slice(0, hints).map((h) => (
                <li key={h.level} className="facts" style={{ margin: 0 }}>
                  {h.text}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="row">
            {phase === 'solving' ? (
              <>
                <button className="btn btn-sm" type="button" disabled={hints >= 3} onClick={() => setHints((h) => Math.min(3, h + 1))}>
                  <Icon name="bulb" /> Hint ({hints}/3)
                </button>
                <button className="btn btn-sm" type="button" onClick={reveal}>
                  <Icon name="eye" /> Show solution
                </button>
              </>
            ) : null}
            {phase === 'wrong' ? (
              <>
                <button className="btn btn-sm btn-primary" type="button" onClick={retry}>
                  <Icon name="refresh" /> Try again
                </button>
                <button className="btn btn-sm" type="button" onClick={reveal}>
                  <Icon name="eye" /> Show solution
                </button>
              </>
            ) : null}
            {over ? (
              <button className="btn btn-primary" type="button" onClick={onNext} autoFocus>
                Next puzzle <Icon name="right" />
              </button>
            ) : null}
          </div>
          {over ? (
            <div className="facts">
              <div className="facts-title">From your game</div>
              <p style={{ margin: 0 }}>
                In {gameLabel}, you played <strong>{puzzle.playedSan}</strong> here. The engine&apos;s line is:
              </p>
              <Pv fen={puzzle.fen} sans={solutionSans} max={8} />
              <p style={{ margin: '6px 0 0' }}>
                <Link to={`/analysis/${puzzle.gameId}?ply=${Math.max(0, puzzle.ply - 1)}`}>Open the position in the game</Link>
              </p>
            </div>
          ) : null}
        </section>
        <Banner kind="info">Puzzles come from your own games and were checked at depth {puzzle.depth}. Where several first moves keep the advantage, any of them is accepted after a quick engine check; later moves must follow the engine&apos;s line.</Banner>
      </div>
    </div>
  );
}
