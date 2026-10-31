import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Banner, ConfirmDialog, Field, PageHead, Segmented, Spinner, copyText, downloadText } from '../components/ui';
import { Board } from '../components/Board';
import { Icon } from '../components/Icon';
import { MoveInput } from '../components/MoveInput';
import { MoveList } from '../components/MoveList';
import { OpponentPicker } from '../components/OpponentPicker';
import { PlayerStrip } from '../components/PlayerStrip';
import { WeakSpotPicker } from '../components/WeakSpotPicker';
import { TimeControlPicker } from '../components/TimeControlPicker';
import { capturedPieces } from '../lib/chess/captured';
import { START_FEN, fullmoveNumber, sideToMove, validateFen } from '../lib/chess/rules';
import { botById } from '../lib/engine/bots';
import { LEVELS, sanitizeConfig } from '../lib/engine/strength';
import type { OpponentConfig } from '../lib/engine/strength';
import { GameSession } from '../lib/play/session';
import type { Ended, SessionTime } from '../lib/play/session';
import { bumpCalendar, kvGet, kvSet } from '../lib/storage/repos';
import { useNow } from '../hooks/useNow';
import { useHotkeys } from '../hooks/useHotkeys';
import { usePrefs } from '../hooks/usePrefs';
import { engineAcceptsDraw, engineMove, engineName, prepareEngine, saveSession } from '../services/playEngine';
import { releaseEngine, restartEngine, stopSearch } from '../services/engines';
import type { Engine } from '../lib/engine/engine';
import { playSound, soundForSan } from '../services/sound';
import { toast } from '../services/toast';
import type { Color } from '../lib/types';

interface Setup {
  color: Color | 'random';
  opponent: OpponentConfig;
  timeId: string;
  time: SessionTime;
  fen: string;
}
interface Running {
  userColor: Color;
  opponent: OpponentConfig;
  time: SessionTime;
  fen: string;
  n: number;
}

const SETUP_KEY = 'play.setup';

export default function Play() {
  const [sp] = useSearchParams();
  const fenParam = sp.get('fen');
  const colorParam = sp.get('color');
  const bot = botById(sp.get('bot'));
  const [setup, setSetup] = useState<Setup>({ color: colorParam === 'b' ? 'b' : colorParam === 'r' ? 'random' : 'w', opponent: bot ? { ...bot.config } : LEVELS[2]!.config, timeId: 'none', time: null, fen: fenParam && validateFen(fenParam).ok ? fenParam : '' });
  const [running, setRunning] = useState<Running | null>(null);
  const [fenError, setFenError] = useState('');
  const counter = useRef(0);

  useEffect(() => {
    void kvGet<Partial<Setup>>(SETUP_KEY).then((s) => {
      if (!s) return;
      setSetup((cur) => ({
        color: colorParam === 'w' || colorParam === 'b' || colorParam === 'r' ? cur.color : (s.color ?? cur.color),
        opponent: bot ? cur.opponent : { ...sanitizeConfig(s.opponent ?? cur.opponent), name: undefined },
        timeId: s.timeId ?? cur.timeId,
        time: s.time === undefined ? cur.time : s.time,
        fen: cur.fen,
      }));
    });
  }, [colorParam, bot]);

  const start = (override?: Partial<Setup>) => {
    const s = { ...setup, ...override };
    const fen = s.fen.trim() || START_FEN;
    const v = validateFen(fen);
    if (!v.ok) {
      setFenError(v.error ?? 'That FEN is not a legal position.');
      return;
    }
    setFenError('');
    void kvSet(SETUP_KEY, { color: s.color, opponent: s.opponent, timeId: s.timeId, time: s.time });
    const userColor: Color = s.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : s.color;
    setRunning({ userColor, opponent: sanitizeConfig(s.opponent), time: s.time, fen, n: ++counter.current });
  };

  // Coming from the Bots page, the game starts straight away with the bot and colour chosen there.
  const autoStarted = useRef(false);
  const wantsAutoStart = sp.get('go') === '1' && !!bot;
  useEffect(() => {
    if (!wantsAutoStart || autoStarted.current) return;
    autoStarted.current = true;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsAutoStart]);

  if (running) {
    return (
      <Game
        key={running.n}
        config={running}
        onExit={() => setRunning(null)}
        onRematch={() => {
          const swap: Color = running.userColor === 'w' ? 'b' : 'w';
          setSetup((s) => ({ ...s, color: swap }));
          start({ color: swap });
        }}
      />
    );
  }

  return (
    <div className="stack">
      <PageHead title="Play" sub="A game against Stockfish, running entirely in your browser." />
      {bot ? (
        <Banner kind="info" icon="bot">
          Playing <strong>{bot.name}</strong>: {bot.tagline} <Link to="/bots">Choose another bot</Link>
        </Banner>
      ) : null}
      {fenParam ? <Banner kind="info">Starting from the position you were analysing. Clear the position field below to play from the standard start instead.</Banner> : null}
      <div className="setup-grid">
        <div className="setup-preview" aria-hidden="true">
          <div className="board-wrap">
            <Board fen={setup.fen && validateFen(setup.fen).ok ? setup.fen : START_FEN} orientation={setup.color === 'b' ? 'b' : 'w'} movable={null} lastMove={null} ariaLabel="Preview of the starting position" />
          </div>
        </div>
      <section className="sheet pad stack" aria-label="New game">
        <Field label="You play">
          <Segmented<Setup['color']>
            label="Your colour"
            value={setup.color}
            onChange={(color) => setSetup((s) => ({ ...s, color }))}
            options={[
              { value: 'w', label: 'White' },
              { value: 'b', label: 'Black' },
              { value: 'random', label: 'Random' },
            ]}
          />
        </Field>
        <OpponentPicker value={setup.opponent} onChange={(opponent) => setSetup((s) => ({ ...s, opponent }))} idPrefix="play" timed={!!setup.time} />
        <TimeControlPicker presetId={setup.timeId} onChange={(timeId, time) => setSetup((s) => ({ ...s, timeId, time }))} idPrefix="play" />
        <WeakSpotPicker onPick={(fen, color) => setSetup((s) => ({ ...s, fen, color }))} />
        <details open={!!setup.fen}>
          <summary className="small" style={{ cursor: 'pointer' }}>
            Start from a position (optional)
          </summary>
          <div style={{ marginTop: 10 }}>
            <Field label="FEN" htmlFor="play-fen" hint="Leave empty for the standard start. The position is checked for legality." >
              <input id="play-fen" className="input" value={setup.fen} onChange={(e) => (setSetup((s) => ({ ...s, fen: e.target.value })), setFenError(''))} placeholder={START_FEN} spellCheck={false} aria-invalid={!!fenError} />
            </Field>
            {fenError ? (
              <p role="alert" className="small" style={{ color: 'var(--c-blunder)', margin: '6px 0 0' }}>
                {fenError}
              </p>
            ) : null}
          </div>
        </details>
        <div className="row">
          <button className="btn btn-primary" type="button" onClick={() => start()}>
            <Icon name="play" /> Start game
          </button>
          <Link className="btn" to="/match">
            <Icon name="swords" /> Engine vs engine
          </Link>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          Finished games are saved to your Games library automatically and can be analysed from there. Leaving this page during a game ends it without saving (closing or reloading the tab asks first).
        </p>
      </section>
      </div>
    </div>
  );
}

function Game({ config, onExit, onRematch }: { config: Running; onExit: () => void; onRematch: () => void }) {
  const [prefs] = usePrefs();
  const { userColor, opponent, time, fen: startFen } = config;
  const engineColor: Color = userColor === 'w' ? 'b' : 'w';
  const timed = !!time;
  const [session] = useState(() => new GameSession({ startFen, time }));
  const [, setRev] = useState(0);
  const rev = useCallback(() => setRev((r) => r + 1), []);
  const [orientation, setOrientation] = useState<Color>(userColor);
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState<Ended | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [engineError, setEngineError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'resign' | 'new' | null>(null);
  const [takebacks, setTakebacks] = useState(0);
  const [announce, setAnnounce] = useState('');
  const engine = useRef<Engine | null>(null);
  const token = useRef(0);
  const thinkingRef = useRef(false);
  const finished = useRef(false);

  const userName = prefs.chesscomUser.trim() || 'You';
  const opponentName = engineName(opponent);

  // Closing or reloading the tab mid-game would lose it (it is saved only when it ends), so ask first.
  const inProgress = !ended && session.ucis.length > 0;
  useEffect(() => {
    if (!inProgress) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [inProgress]);

  const finish = useCallback(
    (e: Ended) => {
      if (finished.current) return;
      finished.current = true;
      token.current++;
      stopSearch('a');
      thinkingRef.current = false;
      setThinking(false);
      setEnded(e);
      playSound('end');
      setAnnounce(e.text);
      const tags = ['vs-engine', ...(takebacks ? ['takebacks'] : [])];
      void saveSession(session, {
        white: userColor === 'w' ? userName : opponentName,
        black: userColor === 'b' ? userName : opponentName,
        source: 'played',
        event: 'Kibitz game vs Stockfish',
        userColor,
        userName,
        tags,
        headers: { ...(takebacks ? { Takebacks: String(takebacks) } : {}), ...(userColor === 'w' ? { BlackEngine: opponentName } : { WhiteEngine: opponentName }) },
        engines: { [engineColor]: opponent },
      })
        .then((id) => {
          setSavedId(id);
          void bumpCalendar({ played: 1 });
        })
        .catch(() => toast.error('The game finished but could not be saved to your library.'));
    },
    [session, userColor, userName, opponentName, engineColor, opponent, takebacks],
  );

  useEffect(() => {
    session.start(Date.now());
    rev();
    const tok = token;
    const eng = engine;
    return () => {
      tok.current++;
      stopSearch('a');
      releaseEngine('a');
      eng.current = null;
    };
  }, [session, rev]);

  const now = useNow(200, timed && !ended);
  useEffect(() => {
    if (!timed || ended) return;
    const e = session.tick(Date.now());
    if (e) {
      finish(e);
      rev();
    }
  }, [now, timed, ended, session, finish, rev]);

  const runEngine = useCallback(async () => {
    if (thinkingRef.current || session.over) return;
    const my = ++token.current;
    thinkingRef.current = true;
    setThinking(true);
    setEngineError(null);
    try {
      engine.current ??= await prepareEngine('a', opponent);
      if (my !== token.current) return;
      const uci = await engineMove(engine.current, session, opponent);
      if (my !== token.current || uci === null) return;
      if (!uci || uci === '(none)') {
        setEngineError('The engine returned no move.');
        return;
      }
      const out = session.move(uci, Date.now());
      if (out.ok) {
        playSound(soundForSan(out.ply.san));
        setAnnounce(`Engine played ${out.ply.san}`);
        if (out.ended) finish(out.ended);
      } else if (out.error === 'flagged' && out.ended) finish(out.ended);
      else setEngineError(`The engine suggested a move that could not be played (${uci}).`);
      rev();
    } catch (e) {
      if (my === token.current) setEngineError(e instanceof Error ? e.message : String(e));
    } finally {
      if (my === token.current) {
        thinkingRef.current = false;
        setThinking(false);
      }
    }
  }, [session, opponent, finish, rev]);

  // Whenever it becomes the engine's turn, ask it to move.
  const myTurn = session.turn === userColor;
  const over = session.over || !!ended;
  const paused = session.isPaused;
  useEffect(() => {
    if (!over && !myTurn && !paused && !thinkingRef.current && !engineError && !busy) void runEngine();
  });

  const onMove = (m: { from: string; to: string; promotion?: string }): boolean => {
    if (over || !myTurn || paused || thinking || busy) return false;
    const out = session.move({ from: m.from, to: m.to, promotion: m.promotion }, Date.now());
    if (!out.ok) {
      if (out.error === 'flagged' && out.ended) finish(out.ended);
      rev();
      return false;
    }
    playSound(soundForSan(out.ply.san));
    setNotice('');
    if (out.ended) finish(out.ended);
    rev();
    return true;
  };

  const takeback = () => {
    if (over) return;
    const last = session.plies.at(-1);
    if (!last) return;
    let count = 0;
    if (thinking && last.color === userColor) count = 1;
    else if (!thinking && myTurn && session.plies.length >= 2) count = 2;
    if (!count) return;
    token.current++;
    stopSearch('a');
    thinkingRef.current = false;
    setThinking(false);
    setEngineError(null);
    session.undo(count, Date.now());
    setTakebacks((t) => t + 1);
    setNotice('Move taken back. Takebacks are recorded on the saved game.');
    rev();
  };
  const canTakeback = !over && !busy && ((thinking && session.plies.at(-1)?.color === userColor) || (!thinking && myTurn && session.plies.length >= 2));

  const offerDraw = async () => {
    if (over || !myTurn || thinking || busy) return;
    setBusy(true);
    setNotice('Offering a draw…');
    try {
      engine.current ??= await prepareEngine('a', opponent);
      session.offerDraw(userColor);
      const r = await engineAcceptsDraw(engine.current, session, engineColor);
      if (r.accept) {
        const e = session.acceptDraw();
        if (e) finish(e);
      } else {
        session.declineDraw();
      }
      setNotice(r.reason);
    } catch (e) {
      session.declineDraw();
      setNotice(e instanceof Error ? e.message : 'The engine could not answer the draw offer.');
    } finally {
      setBusy(false);
      rev();
    }
  };

  const claim = session.claimableDraw();
  const exportPgn = () => session.pgn({ Event: 'Kibitz game vs Stockfish', White: userColor === 'w' ? userName : opponentName, Black: userColor === 'b' ? userName : opponentName });

  useHotkeys({ f: () => setOrientation((o) => (o === 'w' ? 'b' : 'w')) });

  const cap = useMemo(() => capturedPieces(session.fen), [session, session.plies.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const clock = (c: Color) => (timed ? session.remaining(c, Date.now()) : null);
  const strip = (c: Color) => ({
    name: c === userColor ? userName : opponentName,
    color: c,
    clockMs: clock(c),
    running: !over && !paused && session.turn === c,
    captured: c === 'w' ? cap.byWhite : cap.byBlack,
    balance: c === 'w' ? Math.max(0, cap.balance) : Math.max(0, -cap.balance),
    note: c === userColor && userName !== 'You' ? 'You' : undefined,
  });
  const top: Color = orientation === 'w' ? 'b' : 'w';
  const status = ended ? ended.text : paused ? 'Paused. Clocks are stopped.' : thinking ? 'The engine is thinking…' : myTurn ? (session.inCheck ? 'Your move. You are in check.' : 'Your move.') : 'Waiting for the engine…';
  const startsBlack = sideToMove(session.startFen) === 'b';
  const sans = session.plies.map((p) => p.san);

  return (
    <div className="stack">
      <PageHead title={`You vs ${opponentName}`} sub={timed ? `Clock ${session.timeControlHeader()?.replace('+', ' + ')} s` : 'No clock'} />
      <div className="analysis">
        <div className="stack-sm">
          <PlayerStrip {...strip(top)} />
          <div className="board-wrap">
            <Board fen={session.fen} typedMoves={false} orientation={orientation} movable={over || paused ? null : userColor} onMove={onMove} lastMove={session.lastMove} ariaLabel={`Game board. ${session.turn === 'w' ? 'White' : 'Black'} to move. ${status}`} />
          </div>
          <PlayerStrip {...strip(orientation)} />
          <div className="controls" role="group" aria-label="Game controls">
            <button className="btn btn-icon" type="button" onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} aria-label="Flip the board" title="Flip the board (F)">
              <Icon name="flip" />
            </button>
          </div>
          <div className="sr-only" aria-live="polite">
            {announce}
          </div>
        </div>

        <div className="stack-sm">
          <section className="sheet pad-sm stack-sm" aria-label="Game status">
            <div className="row-nowrap" role="status" aria-live="polite">
              {thinking ? <span className="spinner" aria-hidden="true" /> : null}
              <strong>{status}</strong>
            </div>
            {notice ? <p className="small muted" style={{ margin: 0 }}>{notice}</p> : null}
            {engineError ? (
              <Banner kind="bad" role="alert">
                <div className="stack-sm">
                  <span>The engine had a problem: {engineError}</span>
                  <span className="row">
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => {
                        setEngineError(null);
                        engine.current = null;
                        void restartEngine('a').catch(() => undefined).finally(rev);
                      }}
                    >
                      Restart engine and retry
                    </button>
                  </span>
                </div>
              </Banner>
            ) : null}
            {ended ? (
              <div className="row">
                {savedId ? (
                  <Link className="btn btn-primary" to={`/analysis/${savedId}`}>
                    <Icon name="insights" /> Review this game
                  </Link>
                ) : (
                  <span className="small muted">{savedId === null && finished.current ? 'Saving…' : ''}</span>
                )}
                <button className="btn" type="button" onClick={onRematch}>
                  <Icon name="refresh" /> Rematch, swap colours
                </button>
                <button className="btn" type="button" onClick={onExit}>
                  New game
                </button>
              </div>
            ) : null}
          </section>

          <section className="sheet" aria-label="Moves">
            <MoveList sans={sans} startNumber={fullmoveNumber(session.startFen)} startsWithBlack={startsBlack} />
          </section>

          {!over ? (
            <section className="sheet pad-sm stack-sm" aria-label="Actions">
              <MoveInput fen={session.fen} onMove={(m) => onMove({ from: m.uci.slice(0, 2), to: m.uci.slice(2, 4), promotion: m.uci.length > 4 ? m.uci.slice(4) : undefined })} disabled={!myTurn || thinking || paused || busy} />
              <div className="row">
                <button className="btn btn-sm" type="button" onClick={takeback} disabled={!canTakeback}>
                  <Icon name="undo" /> Take back
                </button>
                <button className="btn btn-sm" type="button" onClick={() => void offerDraw()} disabled={!myTurn || thinking || busy}>
                  <Icon name="handshake" /> Offer draw
                </button>
                {claim ? (
                  <button
                    className="btn btn-sm"
                    type="button"
                    disabled={!myTurn || busy}
                    onClick={() => {
                      const e = session.claimDraw();
                      if (e) finish(e);
                      rev();
                    }}
                  >
                    Claim draw ({claim === 'threefold' ? 'repetition' : 'fifty moves'})
                  </button>
                ) : null}
                {timed ? (
                  <button
                    className="btn btn-sm"
                    type="button"
                    disabled={thinking || busy}
                    onClick={() => {
                      if (paused) session.resume(Date.now());
                      else session.pause(Date.now());
                      rev();
                    }}
                  >
                    <Icon name={paused ? 'play' : 'pause'} /> {paused ? 'Resume' : 'Pause'}
                  </button>
                ) : null}
                <button className="btn btn-sm btn-danger" type="button" onClick={() => setConfirm('resign')}>
                  <Icon name="flag" /> Resign
                </button>
              </div>
              <p className="hint" style={{ margin: 0 }}>
                The engine accepts a draw offer when it rates the position level or worse for itself (at most +0.20 at depth 12). It does not claim draws itself.
              </p>
            </section>
          ) : null}

          <section className="sheet pad-sm row" aria-label="Export">
            <button className="btn btn-sm" type="button" onClick={() => void copyText(session.fen).then((ok) => (ok ? toast.success('FEN copied.') : toast.error('Could not copy.')))}>
              <Icon name="copy" /> FEN
            </button>
            <button className="btn btn-sm" type="button" onClick={() => void copyText(exportPgn()).then((ok) => (ok ? toast.success('PGN copied.') : toast.error('Could not copy.')))}>
              <Icon name="copy" /> PGN
            </button>
            <button className="btn btn-sm" type="button" onClick={() => downloadText('kibitz-game.pgn', exportPgn() + '\n', 'application/x-chess-pgn')}>
              <Icon name="download" /> Save PGN
            </button>
            {!ended ? (
              <button className="btn btn-sm btn-quiet" type="button" onClick={() => setConfirm('new')}>
                Abandon game
              </button>
            ) : null}
          </section>
          {!engine.current && thinking ? <Spinner label="Loading the engine for the first time…" /> : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === 'resign'}
        title="Resign this game?"
        confirmLabel="Resign"
        danger
        body={<p>The game is recorded as a loss for you and saved to your library.</p>}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          setConfirm(null);
          const e = session.resign(userColor);
          if (e) finish(e);
          rev();
        }}
      />
      <ConfirmDialog open={confirm === 'new'} title="Abandon this game?" confirmLabel="Abandon" danger body={<p>The game will not be saved. To keep it, resign instead.</p>} onCancel={() => setConfirm(null)} onConfirm={onExit} />
    </div>
  );
}
