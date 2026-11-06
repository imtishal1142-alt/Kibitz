import { Coach } from '../../components/Coach';
import { endgameLine } from '../../lib/coach/lines';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Celebrate } from '../../components/Celebrate';
import { Banner, PageHead, Spinner } from '../../components/ui';
import { Board } from '../../components/Board';
import { ClassBadge } from '../../components/ClassBadge';
import { Icon } from '../../components/Icon';
import { MoveList } from '../../components/MoveList';
import { assessMove } from '../../lib/analysis/assess';
import type { MoveAssessment } from '../../lib/analysis/assess';
import { idbEvalCache } from '../../lib/analysis/gameAnalysis';
import { fullmoveNumber, sideToMove, uciLineToSan } from '../../lib/chess/rules';
import { winPctFor } from '../../lib/chess/eval';
import type { OpponentConfig } from '../../lib/engine/strength';
import { describeRecord, loadEndgames, recordEndgame } from '../../lib/training/endgameProgress';
import type { EndgameRecord, EndgameRecords } from '../../lib/training/endgameProgress';
import { ENDGAMES } from '../../lib/training/endgames';
import type { EndgameLesson } from '../../lib/training/endgames';
import { GameSession } from '../../lib/play/session';
import type { Ended } from '../../lib/play/session';
import { bumpCalendar } from '../../lib/storage/repos';
import { engineMove, prepareEngine } from '../../services/playEngine';
import { getEngine, releaseEngine, stopSearch } from '../../services/engines';
import type { Engine } from '../../lib/engine/engine';
import { playSound, soundForSan } from '../../services/sound';
import type { Color } from '../../lib/types';
import type { BoardArrow } from '../../components/Board';

const OPPONENT: OpponentConfig = { mode: 'full', elo: 3190, skill: 20, movetimeMs: 350, useClock: false };
const MOVE_LIMIT = 60; // full moves allowed to achieve a "win" goal

/** A position counts as "winning" for the learner at 85% winning chances or better (a clear, safe advantage). */
const WINNING = 85;
const GROUPS: EndgameLesson['group'][] = ['Basic mates', 'King and pawn', 'Rook endgames', 'Bishop endgames', 'Knight endgames', 'Queen endgames', 'Studies and tricks'];

export default function Endgames() {
  const [run, setRun] = useState<{ lesson: EndgameLesson; n: number } | null>(null);
  const [records, setRecords] = useState<EndgameRecords>({});
  useEffect(() => {
    if (!run) void loadEndgames().then(setRecords);
  }, [run]);
  return (
    <div className="stack">
      <PageHead title="Endgame lab" sub="Classic endings against the engine, with feedback on every move." actions={<Link className="btn" to="/train">All tools</Link>} />
      {run ? (
        <Lab key={`${run.lesson.id}-${run.n}`} lesson={run.lesson} onExit={() => setRun(null)} onAgain={() => setRun({ lesson: run.lesson, n: run.n + 1 })} />
      ) : (
        <>
          <Banner kind="info">
            The engine defends as well as it can. Whether a position is won or drawn is checked against Stockfish at depth 22 when the app is tested, not against an endgame tablebase, so treat the verdicts as engine-verified rather than proven.
          </Banner>
          {GROUPS.map((g) => (
            <section key={g} className="stack-sm" aria-label={g}>
              <h2 className="train-h">{g}</h2>
              <div className="grid-3">
                {ENDGAMES.filter((e) => e.group === g).map((e) => (
                  <button key={e.id} type="button" className="nav-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setRun({ lesson: e, n: 0 })}>
                    <strong>{e.title}</strong>
                    <span>{e.summary}</span>
                    <span className="small muted">{describeRecord(records[e.id])}</span>
                    <span className="chip" style={{ alignSelf: 'flex-start' }}>
                      {e.goal === 'win' ? 'Goal: win' : 'Goal: hold the draw'} · {'●'.repeat(e.level)}
                      <span className="sr-only"> level {e.level} of 3</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

interface Feedback {
  ply: number;
  san: string;
  a: MoveAssessment;
  threwAway: boolean;
}

/** The engine's best line from the start, to step through before (or after) trying the ending yourself. */
function Demo({ lesson }: { lesson: EndgameLesson }) {
  const [line, setLine] = useState<{ fens: string[]; sans: string[]; ucis: string[] } | null>(null);
  const [n, setN] = useState(0);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const e = await getEngine('live');
        const r = await e.search({ fen: lesson.fen, depth: 20, multipv: 1 });
        const pv = r.lines[0]?.pv ?? [];
        const chk = uciLineToSan(lesson.fen, pv, 14);
        if (live && chk.valid) setLine({ fens: [lesson.fen, ...chk.fens], sans: chk.sans, ucis: chk.ucis });
      } catch {
        /* the demo is a bonus */
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => { live = false; };
  }, [lesson.fen]);
  if (busy) return <Spinner label="Finding the best line…" />;
  if (!line || !line.sans.length) return <p className="small muted" style={{ margin: 0 }}>The engine could not produce a line just now.</p>;
  const arrow: BoardArrow[] | undefined = n < line.ucis.length ? [{ from: line.ucis[n]!.slice(0, 2), to: line.ucis[n]!.slice(2, 4) }] : undefined;
  return (
    <div className="stack-sm" style={{ maxWidth: 360 }}>
      <Board fen={line.fens[n]!} orientation={lesson.user} movable={null} arrows={arrow} ariaLabel={`Best line, after ${n} of ${line.sans.length} moves`} />
      <div className="row" role="group" aria-label="Best line controls">
        <button type="button" className="btn btn-sm" onClick={() => setN(0)} disabled={n === 0}>Start</button>
        <button type="button" className="btn btn-sm" onClick={() => setN((v) => Math.max(0, v - 1))} disabled={n === 0}>Back</button>
        <button type="button" className="btn btn-sm" onClick={() => setN((v) => Math.min(line.sans.length, v + 1))} disabled={n === line.sans.length}>Next</button>
        <span className="small muted">{n === 0 ? 'Start' : `${line.sans.slice(0, n).join(' ')}`}</span>
      </div>
    </div>
  );
}

function Lab({ lesson, onExit, onAgain }: { lesson: EndgameLesson; onExit: () => void; onAgain: () => void }) {
  const user: Color = lesson.user;
  const foe: Color = user === 'w' ? 'b' : 'w';
  const [session] = useState(() => new GameSession({ startFen: lesson.fen, autoClaimDraws: true }));
  const [, setRev] = useState(0);
  const rev = useCallback(() => setRev((r) => r + 1), []);
  const [ended, setEnded] = useState<Ended | null>(null);
  const [outcome, setOutcome] = useState<'achieved' | 'missed' | null>(null);
  const [thinking, setThinking] = useState(false);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [showIdea, setShowIdea] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [error, setError] = useState('');
  const [record, setRecord] = useState<EndgameRecord | null>(null);
  const engine = useRef<Engine | null>(null);
  const token = useRef(0);
  const busyRef = useRef(false);

  const conclude = useCallback(
    (e: Ended, limitHit = false) => {
      const achieved = lesson.goal === 'win' ? e.winner === user : limitHit || e.winner !== foe;
      setEnded(e);
      setOutcome(achieved ? 'achieved' : 'missed');
      playSound(achieved ? 'correct' : 'wrong');
      void bumpCalendar({ lessons: 1 });
      void recordEndgame(lesson.id, achieved).then(setRecord);
    },
    [lesson.goal, lesson.id, user, foe],
  );

  useEffect(() => {
    session.start(Date.now());
    const tok = token;
    const eng = engine;
    return () => {
      tok.current++;
      stopSearch('a');
      releaseEngine('a');
      eng.current = null;
    };
  }, [session]);

  const reply = useCallback(async () => {
    if (busyRef.current || session.over) return;
    busyRef.current = true;
    const my = ++token.current;
    setThinking(true);
    try {
      engine.current ??= await prepareEngine('a', OPPONENT);
      const uci = await engineMove(engine.current, session, OPPONENT);
      if (my !== token.current || !uci) return;
      const out = session.move(uci, Date.now());
      if (out.ok) {
        playSound(soundForSan(out.ply.san));
        if (out.ended) conclude(out.ended);
        else if (lesson.goal === 'draw' && Math.ceil(session.plies.length / 2) >= 30) conclude(session.stop() ?? { result: '1/2-1/2', reason: 'stopped', text: '' }, true);
      }
      rev();
    } catch (e) {
      if (my === token.current) setError(e instanceof Error ? e.message : 'The engine failed.');
    } finally {
      busyRef.current = false;
      if (my === token.current) setThinking(false);
    }
  }, [session, lesson.goal, conclude, rev]);

  const onMove = (m: { uci: string; san: string }): boolean => {
    if (ended || thinking || session.turn !== user) return false;
    const fen = session.fen;
    const out = session.move(m.uci, Date.now());
    if (!out.ok) return false;
    playSound(soundForSan(out.ply.san));
    const ply = out.ply.ply;
    rev();
    // Grade the move in the background with the second engine slot, so play is never blocked.
    void (async () => {
      try {
        const e = await getEngine('live');
        const a = await assessMove(e, fen, m.uci, { depth: 12, cache: idbEvalCache });
        if (!a) return;
        const wasWinning = winPctFor(a.evalBefore, user) >= WINNING;
        const stillWinning = winPctFor(a.evalAfter, user) >= WINNING;
        setFeedback((f) => [{ ply, san: out.ply.san, a, threwAway: lesson.goal === 'win' && wasWinning && !stillWinning }, ...f].slice(0, 6));
      } catch {
        /* feedback is a bonus: the game goes on without it */
      }
    })();
    if (out.ended) conclude(out.ended);
    else if (lesson.goal === 'win' && Math.ceil(session.plies.length / 2) >= MOVE_LIMIT) conclude(session.stop() ?? { result: '*', reason: 'stopped', text: '' }, false);
    else void reply();
    return true;
  };

  // If the lesson starts with the engine to move, let it play first.
  useEffect(() => {
    if (!session.over && session.turn !== user && session.plies.length === 0) void reply();
  }, [session, user, reply]);

  const sans = session.plies.map((p) => p.san);
  const goalText = lesson.goal === 'win' ? `Checkmate within ${MOVE_LIMIT} moves.` : 'Avoid defeat: reach a draw, or survive 30 moves.';
  const last = session.lastMove;

  return (
    <div className="analysis">
      <div className="board-wrap">
        <Board fen={session.fen} orientation={user} movable={ended || thinking ? null : user} onMove={onMove} lastMove={last} ariaLabel={`Endgame board. ${lesson.title}. ${session.turn === 'w' ? 'White' : 'Black'} to move.`} />
      </div>
      <div className="stack-sm">
        <section className="sheet pad stack-sm" aria-label="Lesson">
          <h2 style={{ fontSize: '1.2rem' }}>{lesson.title}</h2>
          <p style={{ margin: 0 }}>
            You are {user === 'w' ? 'White' : 'Black'}. <strong>Goal:</strong> {goalText}
          </p>
          <div role="status" aria-live="polite">
            {thinking ? <Spinner label="The engine is defending…" /> : null}
            {ended && outcome === 'achieved' ? <Celebrate /> : null}
            {ended ? (
              <Banner kind={outcome === 'achieved' ? 'ok' : 'warn'}>
                <div>
                  <strong>{outcome === 'achieved' ? 'Goal achieved.' : 'Goal missed.'}</strong> {ended.text || (lesson.goal === 'win' ? 'The move limit ran out before checkmate.' : '')}
                  {record ? (
                    <div className="small" style={{ marginTop: 4 }}>
                      {outcome === 'achieved' ? (record.wins === 1 ? 'Your first success in this ending.' : 'Another success.') : `That is ${record.sinceWin} attempt${record.sinceWin === 1 ? '' : 's'} since your last success. Run it again: this ending is worth getting right.`} {describeRecord(record)}.
                    </div>
                  ) : null}
                </div>
              </Banner>
            ) : null}
            {error ? <Banner kind="bad" role="alert">{error}</Banner> : null}
          </div>
          <div className="row">
            <button className="btn btn-sm" type="button" onClick={() => setShowHint((v) => !v)} aria-expanded={showHint}>
              <Icon name="bulb" /> Hint
            </button>
            <button className="btn btn-sm" type="button" onClick={() => setShowIdea((v) => !v)} aria-expanded={showIdea}>
              <Icon name="book" /> The idea
            </button>
            <button className="btn btn-sm" type="button" onClick={() => setShowDemo((v) => !v)} aria-expanded={showDemo}>
              <Icon name="eye" /> Watch the best line
            </button>
            <button className="btn btn-sm" type="button" onClick={onExit}>
              {ended ? 'Choose another' : 'Leave'}
            </button>
            {ended ? (
              <button className="btn btn-sm btn-primary" type="button" onClick={onAgain}>
                <Icon name="refresh" /> {outcome === 'achieved' ? 'Play it again' : 'Try again'}
              </button>
            ) : null}
          </div>
          {showHint ? <p className="facts" style={{ margin: 0 }}>{lesson.hint}</p> : null}
          {showIdea ? <p className="facts" style={{ margin: 0 }}>{lesson.idea}</p> : null}
          {showDemo ? <Demo lesson={lesson} /> : null}
        </section>

        {(() => {
          const last = feedback.at(-1);
          const l = outcome === 'achieved' ? endgameLine(lesson.goal === 'win' ? 'win' : 'draw') : outcome === 'missed' ? endgameLine('lost') : last ? endgameLine(last.threwAway || last.a.winLoss >= 8 ? 'bad' : 'good', {}, feedback.length) : endgameLine('start', { goal: lesson.goal === 'win' ? 'win the game' : 'hold the draw' });
          return <Coach compact autoSpeak={!!outcome} mood={l.mood} text={l.text} />;
        })()}
        {feedback.length ? (
          <section className="sheet pad-sm stack-sm" aria-label="Move feedback">
            <div className="label">Your moves, graded by the engine</div>
            <ul className="list-plain list-rows">
              {feedback.map((f) => (
                <li key={f.ply} className="row-nowrap" style={{ alignItems: 'flex-start' }}>
                  <strong style={{ minWidth: 70 }}>{`${Math.ceil(f.ply / 2)}${f.ply % 2 ? '.' : '...'}${f.san}`}</strong>
                  <ClassBadge cls={f.a.cls} />
                  <span className="small muted grow">
                    {f.threwAway ? 'This throws away the win. ' : ''}
                    {f.a.winLoss >= 5 && f.a.bestSan ? `${f.a.bestSan} was better.` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="sheet" aria-label="Moves">
          <MoveList sans={sans} startNumber={fullmoveNumber(session.startFen)} startsWithBlack={sideToMove(session.startFen) === 'b'} />
        </section>
      </div>
    </div>
  );
}
