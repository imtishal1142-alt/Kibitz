import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, ConfirmDialog, Empty, Field, PageHead, Progress } from '../components/ui';
import { Board } from '../components/Board';
import { Icon } from '../components/Icon';
import { MoveList } from '../components/MoveList';
import { OpponentPicker } from '../components/OpponentPicker';
import { PlayerStrip } from '../components/PlayerStrip';
import { TimeControlPicker } from '../components/TimeControlPicker';
import { capturedPieces } from '../lib/chess/captured';
import { START_FEN, fullmoveNumber, sideToMove, validateFen } from '../lib/chess/rules';
import { BOTS } from '../lib/engine/bots';
import { LEVELS, describeConfig, sanitizeConfig } from '../lib/engine/strength';
import type { OpponentConfig } from '../lib/engine/strength';
import type { Engine } from '../lib/engine/engine';
import { GameSession } from '../lib/play/session';
import type { SessionTime } from '../lib/play/session';
import { kvGet, kvSet } from '../lib/storage/repos';
import { formatDateTime } from '../lib/ui/format';
import { useQuery } from '../hooks/useQuery';
import { useNow } from '../hooks/useNow';
import { engineMove, engineName, prepareEngine, saveSession } from '../services/playEngine';
import { releaseEngine, stopSearch } from '../services/engines';
import { playSound, soundForSan } from '../services/sound';
import { toast } from '../services/toast';
import type { Color, GameResult } from '../lib/types';

const KEY = 'matches';
const MAX_PLIES = 400;

interface Round {
  round: number;
  aWhite: boolean;
  result: GameResult;
  plies: number;
  reason: string;
  gameId: string | null;
}
interface Series {
  id: string;
  startedAt: number;
  rounds: number;
  a: OpponentConfig;
  b: OpponentConfig;
  timeLabel: string;
  startFen: string;
  results: Round[];
  status: 'running' | 'finished' | 'stopped';
}

const points = (r: Round): { a: number; b: number } => {
  if (r.result === '1/2-1/2' || r.result === '*') return { a: 0.5, b: 0.5 };
  const whiteWon = r.result === '1-0';
  return r.aWhite === whiteWon ? { a: 1, b: 0 } : { a: 0, b: 1 };
};
const score = (s: Pick<Series, 'results'>) => s.results.reduce((t, r) => ({ a: t.a + points(r).a, b: t.b + points(r).b }), { a: 0, b: 0 });
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function BotSelect({ id, onPick }: { id: string; onPick: (c: OpponentConfig) => void }) {
  return (
    <Field label="Start from a bot" htmlFor={id} hint="Copies the bot's settings, which you can still fine-tune below.">
      <select
        id={id}
        className="select"
        value=""
        onChange={(e) => {
          const b = BOTS.find((x) => x.id === e.target.value);
          if (b) onPick({ ...b.config });
        }}
      >
        <option value="">Choose a bot…</option>
        {BOTS.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name} ({b.tier})
          </option>
        ))}
      </select>
    </Field>
  );
}

export default function Match() {
  const [a, setA] = useState<OpponentConfig>(LEVELS[3]!.config);
  const [b, setB] = useState<OpponentConfig>(LEVELS[1]!.config);
  const [timeId, setTimeId] = useState('none');
  const [time, setTime] = useState<SessionTime>(null);
  const [rounds, setRounds] = useState(4);
  const [alternate, setAlternate] = useState(true);
  const [fen, setFen] = useState('');
  const [fenError, setFenError] = useState('');
  const [run, setRun] = useState<{ n: number; series: Series; alternate: boolean; time: SessionTime } | null>(null);
  const history = useQuery(async () => (await kvGet<Series[]>(KEY)) ?? [], ['kv']);

  const start = () => {
    const startFen = fen.trim() || START_FEN;
    const v = validateFen(startFen);
    if (!v.ok) return setFenError(v.error ?? 'That FEN is not a legal position.');
    setFenError('');
    const series: Series = { id: `m${Date.now().toString(36)}`, startedAt: Date.now(), rounds, a: sanitizeConfig(a), b: sanitizeConfig(b), timeLabel: timeId === 'none' ? 'no clock' : timeId, startFen, results: [], status: 'running' };
    setRun({ n: (run?.n ?? 0) + 1, series, alternate, time });
  };

  if (run) return <Lab key={run.n} {...run} onExit={() => setRun(null)} onRestart={start} />;

  return (
    <div className="stack">
      <PageHead title="Engine match lab" sub="Two engine settings play each other. Each game is saved so you can replay and analyse it." actions={<Link className="btn" to="/play">Play against the engine</Link>} />
      <section className="sheet pad stack" aria-label="Series setup">
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="stack-sm">
            <h2 style={{ fontSize: '1.05rem' }}>Engine A</h2>
            <BotSelect id="ma-bot" onPick={setA} />
            <OpponentPicker value={a} onChange={setA} idPrefix="ma" timed={!!time} />
          </div>
          <div className="stack-sm">
            <h2 style={{ fontSize: '1.05rem' }}>Engine B</h2>
            <BotSelect id="mb-bot" onPick={setB} />
            <OpponentPicker value={b} onChange={setB} idPrefix="mb" timed={!!time} />
          </div>
        </div>
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <TimeControlPicker presetId={timeId} onChange={(id, t) => (setTimeId(id), setTime(t))} idPrefix="match" />
          <div className="stack-sm">
            <Field label="Games in the series" htmlFor="m-rounds">
              <input id="m-rounds" className="input" type="number" min={1} max={20} value={rounds} onChange={(e) => setRounds(Math.min(20, Math.max(1, Math.round(Number(e.target.value) || 1))))} style={{ width: 100 }} />
            </Field>
            <label className="row-nowrap">
              <input type="checkbox" checked={alternate} onChange={(e) => setAlternate(e.target.checked)} />
              <span>Swap colours every game</span>
            </label>
          </div>
        </div>
        <details>
          <summary className="small" style={{ cursor: 'pointer' }}>
            Start from a position (optional)
          </summary>
          <div style={{ marginTop: 10 }}>
            <Field label="FEN" htmlFor="m-fen" hint="Engines with a fixed depth can repeat the same game; a start position gives variety.">
              <input id="m-fen" className="input" value={fen} onChange={(e) => (setFen(e.target.value), setFenError(''))} placeholder={START_FEN} spellCheck={false} aria-invalid={!!fenError} />
            </Field>
            {fenError ? <p role="alert" className="small" style={{ margin: '6px 0 0', color: 'var(--c-blunder)' }}>{fenError}</p> : null}
          </div>
        </details>
        <div>
          <button className="btn btn-primary" type="button" onClick={start}>
            <Icon name="swords" /> Start series
          </button>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          Both engines are the same Stockfish, limited in different ways. The UCI_Elo numbers are Stockfish&apos;s own scale and a result here says nothing about human ratings. Each side runs in its own worker, one after the other, in this browser tab, so keep the tab open.
        </p>
      </section>

      <section className="sheet pad stack-sm" aria-label="Earlier series">
        <h2 style={{ fontSize: '1.05rem' }}>Earlier series</h2>
        {history.data?.length ? (
          <ul className="list-plain list-rows">
            {history.data.map((s) => {
              const sc = score(s);
              return (
                <li key={s.id} className="stack-sm">
                  <div>
                    <strong>
                      A {fmt(sc.a)} – {fmt(sc.b)} B
                    </strong>{' '}
                    <span className="muted small">
                      {formatDateTime(s.startedAt)} · {s.results.length} of {s.rounds} games{s.status === 'stopped' ? ' (stopped)' : ''} · {s.timeLabel}
                    </span>
                    <div className="small muted">
                      A: {describeConfig(s.a)}. B: {describeConfig(s.b)}.
                    </div>
                  </div>
                  <div className="row">
                    {s.results.map((r) => (
                      <span key={r.round}>
                        {r.gameId ? (
                          <Link className="btn btn-sm" to={`/analysis/${r.gameId}`} aria-label={`Replay game ${r.round}: ${r.result}`}>
                            Game {r.round}: {r.result === '1/2-1/2' ? '½-½' : r.result}
                          </Link>
                        ) : (
                          <span className="chip">Game {r.round}: not saved</span>
                        )}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty title="No series yet">Finished series are listed here with a link to replay every game.</Empty>
        )}
      </section>
    </div>
  );
}

function Lab({ series: initial, alternate, time, onExit, onRestart }: { series: Series; alternate: boolean; time: SessionTime; onExit: () => void; onRestart: () => void }) {
  const [series, setSeries] = useState<Series>(initial);
  const [session, setSession] = useState<GameSession | null>(null);
  const [, setRev] = useState(0);
  const rev = useCallback(() => setRev((r) => r + 1), []);
  const [paused, setPaused] = useState(false);
  const [thinking, setThinking] = useState<'a' | 'b' | null>(null);
  const [error, setError] = useState('');
  const [confirmStop, setConfirmStop] = useState(false);
  const [aWhite, setAWhite] = useState(true);
  const [round, setRound] = useState(1);
  const ctl = useRef({ stop: false, paused: false });
  const engines = useRef<{ a: Engine | null; b: Engine | null }>({ a: null, b: null });
  const started = useRef(false);

  const persist = useCallback((s: Series) => {
    void (async () => {
      const all = (await kvGet<Series[]>(KEY)) ?? [];
      await kvSet(KEY, [s, ...all.filter((x) => x.id !== s.id)].slice(0, 20));
    })();
  }, []);

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const play = useCallback(async () => {
    const cfg = { a: initial.a, b: initial.b };
    try {
      engines.current.a = await prepareEngine('a', cfg.a);
      engines.current.b = await prepareEngine('b', cfg.b);
      let cur: Series = initial;
      persist(cur);
      for (let r = 1; r <= initial.rounds && !ctl.current.stop; r++) {
        const aw = alternate ? r % 2 === 1 : true;
        const s = new GameSession({ startFen: initial.startFen, time, autoClaimDraws: true });
        s.start(Date.now());
        setSession(s);
        setAWhite(aw);
        setRound(r);
        rev();
        await engines.current.a.newGame();
        await engines.current.b.newGame();
        while (!s.over && !ctl.current.stop) {
          const colorOfA: Color = aw ? 'w' : 'b';
          const slot = s.turn === colorOfA ? 'a' : 'b';
          setThinking(slot);
          const uci = await engineMove(engines.current[slot]!, s, slot === 'a' ? cfg.a : cfg.b);
          if (ctl.current.stop || uci === null) break;
          if (!uci || uci === '(none)') throw new Error(`Engine ${slot.toUpperCase()} returned no move.`);
          const out = s.move(uci, Date.now());
          if (!out.ok) {
            if (out.error === 'flagged') break;
            throw new Error(`Engine ${slot.toUpperCase()} played an unplayable move (${uci}).`);
          }
          playSound(soundForSan(out.ply.san));
          rev();
          if (s.plies.length >= MAX_PLIES) s.stop();
          if (ctl.current.paused) {
            s.pause(Date.now());
            while (ctl.current.paused && !ctl.current.stop) await sleep(120);
            s.resume(Date.now());
          }
          await sleep(30); // let the board paint between moves
        }
        setThinking(null);
        if (ctl.current.stop) break;
        const ended = s.ended;
        const result: GameResult = ended?.result ?? '*';
        const white = aw ? `A: ${engineName(cfg.a)}` : `B: ${engineName(cfg.b)}`;
        const black = aw ? `B: ${engineName(cfg.b)}` : `A: ${engineName(cfg.a)}`;
        const gameId = await saveSession(s, { white, black, source: 'engine-match', event: `Kibitz engine match ${initial.id}`, tags: ['engine-match', initial.id], uniqueKey: `${initial.id}-${r}`, headers: { Round: String(r) }, engines: { w: aw ? cfg.a : cfg.b, b: aw ? cfg.b : cfg.a } }).catch(() => null);
        const entry: Round = { round: r, aWhite: aw, result, plies: s.plies.length, reason: ended?.text ?? 'Stopped at the move limit.', gameId };
        cur = { ...cur, results: [...cur.results, entry], status: r === initial.rounds ? 'finished' : 'running' };
        setSeries(cur);
        persist(cur);
      }
      if (ctl.current.stop) {
        cur = { ...cur, status: 'stopped' };
        setSeries(cur);
        persist(cur);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setThinking(null);
    }
  }, [initial, alternate, time, persist, rev]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void play();
    const c = ctl;
    return () => {
      c.current.stop = true;
      stopSearch('a');
      stopSearch('b');
      releaseEngine('a');
      releaseEngine('b');
    };
  }, [play]);

  const now = useNow(250, !!time && !!session && !session.over && !paused);
  void now;

  const sc = score(series);
  const finished = series.status !== 'running';
  const cap = useMemo(() => (session ? capturedPieces(session.fen) : null), [session, session?.plies.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const nameFor = (c: Color) => {
    const isA = (c === 'w') === aWhite;
    return `${isA ? 'A' : 'B'}: ${engineName(isA ? series.a : series.b)}`;
  };
  const strip = (c: Color) => ({
    name: nameFor(c),
    color: c,
    clockMs: time && session ? session.remaining(c, Date.now()) : null,
    running: !!session && !session.over && !paused && session.turn === c,
    captured: cap ? (c === 'w' ? cap.byWhite : cap.byBlack) : [],
    balance: cap ? (c === 'w' ? Math.max(0, cap.balance) : Math.max(0, -cap.balance)) : 0,
  });

  return (
    <div className="stack">
      <PageHead title={`Series: A ${fmt(sc.a)} – ${fmt(sc.b)} B`} sub={`Game ${Math.min(round, series.rounds)} of ${series.rounds}${finished ? ' · ' + (series.status === 'stopped' ? 'stopped' : 'finished') : ''}`} />
      <Progress value={series.results.length / series.rounds} label="Series progress" />
      {error ? (
        <Banner kind="bad" role="alert">
          The series stopped because of an engine problem: {error} Games finished so far are saved.
        </Banner>
      ) : null}
      <div className="analysis">
        <div className="stack-sm">
          <PlayerStrip {...strip('b')} />
          <div className="board-wrap">
            <Board fen={session?.fen ?? series.startFen} orientation="w" movable={null} lastMove={session?.lastMove ?? null} ariaLabel="Engine match board" />
          </div>
          <PlayerStrip {...strip('w')} />
          <div className="controls" role="group" aria-label="Series controls">
            {!finished ? (
              <>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    ctl.current.paused = !ctl.current.paused;
                    setPaused(ctl.current.paused);
                  }}
                >
                  <Icon name={paused ? 'play' : 'pause'} /> {paused ? 'Resume' : 'Pause after this move'}
                </button>
                <button className="btn btn-danger" type="button" onClick={() => setConfirmStop(true)}>
                  <Icon name="stop" /> Stop series
                </button>
              </>
            ) : (
              <button className="btn btn-primary" type="button" onClick={onRestart}>
                <Icon name="refresh" /> Run it again
              </button>
            )}
            <button className="btn" type="button" onClick={onExit}>
              Back to setup
            </button>
          </div>
          <div role="status" aria-live="polite" className="small muted" style={{ textAlign: 'center' }}>
            {thinking ? `Engine ${thinking.toUpperCase()} is thinking…` : paused ? 'Paused.' : finished ? 'Done.' : 'Starting…'}
          </div>
        </div>
        <div className="stack-sm">
          <section className="sheet pad-sm stack-sm" aria-label="Results">
            <h2 style={{ fontSize: '1.05rem' }}>Results</h2>
            {series.results.length === 0 ? <p className="muted small" style={{ margin: 0 }}>The first game is in progress.</p> : null}
            <ul className="list-plain list-rows">
              {series.results.map((r) => (
                <li key={r.round} className="row-nowrap">
                  <span className="grow">
                    Game {r.round}: {r.aWhite ? 'A' : 'B'} was White, <strong>{r.result === '1/2-1/2' ? '½-½' : r.result}</strong>
                    <span className="muted small" style={{ display: 'block' }}>
                      {r.plies} plies. {r.reason}
                    </span>
                  </span>
                  {r.gameId ? (
                    <Link className="btn btn-sm" to={`/analysis/${r.gameId}`}>
                      Replay
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="small muted" style={{ margin: 0 }}>
              A: {describeConfig(series.a)}
              <br />
              B: {describeConfig(series.b)}
            </p>
          </section>
          {session ? (
            <section className="sheet" aria-label="Moves">
              <MoveList sans={session.plies.map((p) => p.san)} startNumber={fullmoveNumber(session.startFen)} startsWithBlack={sideToMove(session.startFen) === 'b'} />
            </section>
          ) : null}
        </div>
      </div>
      <ConfirmDialog
        open={confirmStop}
        title="Stop the series?"
        confirmLabel="Stop"
        danger
        body={<p>The game in progress is discarded. Games already finished stay saved.</p>}
        onCancel={() => setConfirmStop(false)}
        onConfirm={() => {
          setConfirmStop(false);
          ctl.current.stop = true;
          ctl.current.paused = false;
          stopSearch('a');
          stopSearch('b');
          toast.info('Series stopped.');
        }}
      />
    </div>
  );
}

