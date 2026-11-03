import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Link } from 'react-router-dom';
import { Celebrate } from '../components/Celebrate';
import { Board } from '../components/Board';
import type { BoardArrow } from '../components/Board';
import { MiniBoard } from '../components/MiniBoard';
import { Segmented } from '../components/ui';
import { MoveList } from '../components/MoveList';
import { usePersonalEntries } from '../hooks/data';
import { OPENING_LIBRARY } from '../lib/training/openingLibrary';
import type { OpeningLesson, Trap } from '../lib/training/openingLibrary';
import { openingStats } from '../lib/training/openingStats';
import type { Color } from '../lib/types';

function fenAfter(sans: string[], n: number): string {
  const c = new Chess();
  for (const s of sans.slice(0, n)) c.move(s);
  return c.fen();
}

const DRILL_KEY = 'kibitz.drills';
function readDrills(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(DRILL_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function bumpDrill(id: string): void {
  try {
    const d = readDrills();
    d[id] = (d[id] ?? 0) + 1;
    localStorage.setItem(DRILL_KEY, JSON.stringify(d));
  } catch {
    /* storage unavailable: the drill still works, it just is not counted */
  }
}

/** Play the line yourself: you move for `side`, the opponent's book replies are played for you. */
function Drill({ id, sans, side, label, why }: { id: string; sans: string[]; side: Color; label: string; why?: string }) {
  const [n, setN] = useState(() => (side === 'w' ? 0 : 1));
  const [misses, setMisses] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const done = n >= sans.length;
  const fen = useMemo(() => fenAfter(sans, n), [sans, n]);
  const expected = sans[n];
  const arrow = useMemo((): BoardArrow[] | undefined => {
    if ((!showHint && misses < 2) || done || !expected) return undefined;
    try {
      const c = new Chess(fenAfter(sans, n));
      const m = c.move(expected);
      return [{ from: m.from, to: m.to }];
    } catch {
      return undefined;
    }
  }, [showHint, misses, done, expected, sans, n]);
  const reset = () => { setN(side === 'w' ? 0 : 1); setMisses(0); setNote(null); setMistakes(0); setShowHint(false); };
  // Black starts after White's first book move.
  return (
    <div className="stack-sm drill" style={{ maxWidth: 420 }}>
      <div className="board-wrap" style={{ maxWidth: 420 }}>
        <Board
          fen={fen}
          orientation={side}
          movable={done ? null : side}
          arrows={arrow}
          ariaLabel={`${label}: play your moves`}
          onMove={(m) => {
            if (done || m.san !== expected) {
              setMisses((x) => x + 1);
              setMistakes((x) => x + 1);
              setNote(`That is not the book move here. Try again${misses >= 1 ? ': the arrow shows it' : ' or press Hint'}.`);
              return false;
            }
            setNote(null);
            setMisses(0);
            setShowHint(false);
            const next = n + 1;
            setN(next);
            if (next >= sans.length) { bumpDrill(id); return true; }
            timer.current = setTimeout(() => {
              setN(next + 1);
              if (next + 1 >= sans.length) bumpDrill(id);
            }, 450);
            return true;
          }}
        />
      </div>
      <div className="row" role="group" aria-label="Drill controls">
        <button type="button" className="btn btn-sm" onClick={() => setShowHint(true)} disabled={done}>Hint</button>
        <button type="button" className="btn btn-sm" onClick={reset}>Restart</button>
        <span className="small muted" role="status">
          {done ? `Line complete${mistakes ? ` with ${mistakes} wrong ${mistakes === 1 ? 'try' : 'tries'}` : ' with no mistakes'}.` : `Your move: ${Math.floor(n / 2) + 1}${side === 'w' ? '.' : '...'}`}
        </span>
      </div>
      {done ? <Celebrate /> : null}
      {note ? <p className="small" role="alert" style={{ margin: 0 }}>{note}</p> : null}
      {done && why ? <p className="small muted" style={{ margin: 0 }}>{why}</p> : null}
    </div>
  );
}

/** A board that steps through a line one move at a time. */
function Stepper({ sans, orientation, label }: { sans: string[]; orientation: Color; label: string }) {
  const [n, setN] = useState(sans.length);
  const fen = useMemo(() => fenAfter(sans, n), [sans, n]);
  return (
    <div className="stack-sm" style={{ maxWidth: 360 }}>
      <div className="board-wrap" style={{ maxWidth: 360 }}>
        <Board fen={fen} orientation={orientation} movable={null} ariaLabel={`${label}, after ${n} of ${sans.length} moves`} />
      </div>
      <div className="row" role="group" aria-label={`${label} controls`}>
        <button type="button" className="btn btn-sm" onClick={() => setN(0)} disabled={n === 0}>Start</button>
        <button type="button" className="btn btn-sm" onClick={() => setN((v) => Math.max(0, v - 1))} disabled={n === 0}>Back</button>
        <button type="button" className="btn btn-sm" onClick={() => setN((v) => Math.min(sans.length, v + 1))} disabled={n === sans.length}>Next</button>
        <span className="small muted">Move {n} of {sans.length}</span>
      </div>
      <MoveList sans={sans} />
    </div>
  );
}

function TrapCard({ trap, side }: { trap: Trap; side: Color }) {
  const [mode, setMode] = useState<'watch' | 'play'>('watch');
  return (
    <article className="sheet pad stack-sm" aria-label={trap.name}>
      <h4 style={{ margin: 0 }}>{trap.name} <span className="chip">{trap.by === 'w' ? 'White springs it' : 'Black springs it'}</span></h4>
      <p style={{ margin: 0 }}>{trap.lesson}</p>
      <Segmented<'watch' | 'play'> label={`${trap.name} mode`} value={mode} onChange={setMode} options={[{ value: 'watch', label: 'Watch' }, { value: 'play', label: 'Play the trap' }]} />
      {mode === 'watch' ? <Stepper sans={trap.line} orientation={side} label={trap.name} /> : <Drill key={trap.id} id={`trap-${trap.id}`} sans={trap.line} side={trap.by} label={trap.name} why={trap.lesson} />}
    </article>
  );
}

function Detail({ o, onBack }: { o: OpeningLesson; onBack: () => void }) {
  const { games, analyses, loading } = usePersonalEntries();
  const stats = useMemo(() => (games && analyses ? openingStats(o, games, analyses) : null), [o, games, analyses]);
  const side = o.side === 'w' ? 'White' : 'Black';
  const [mode, setMode] = useState<'watch' | 'play'>('watch');
  const drills = readDrills();
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn btn-sm" onClick={onBack}>All openings</button>
        <span className="chip">{o.eco} · usually played as {side}</span>
      </div>
      <h2 style={{ margin: 0 }}>{o.name}</h2>
      <p className="muted" style={{ margin: 0 }}>{o.gist}</p>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack-sm">
          <Segmented<'watch' | 'play'> label="Line mode" value={mode} onChange={setMode} options={[{ value: 'watch', label: 'Watch' }, { value: 'play', label: 'Play it yourself' }]} />
          {mode === 'watch' ? <Stepper sans={o.line} orientation={o.side} label={`${o.name} main line`} /> : <Drill key={o.id} id={o.id} sans={o.line} side={o.side} label={o.name} why={o.idea} />}
          <span className="small muted">{(drills[o.id] ?? 0) ? `Completed ${drills[o.id]} ${drills[o.id] === 1 ? 'time' : 'times'}.` : 'Not played yet.'}</span>
        </div>
        <div className="stack-sm">
          <h3 style={{ fontSize: '1.05rem' }}>The idea</h3>
          <p style={{ margin: 0 }}>{o.idea}</p>
          <h3 style={{ fontSize: '1.05rem' }}>Your plans as {side}</h3>
          <ul className="list-plain stack-sm" style={{ margin: 0 }}>{o.plans.you.map((p) => <li key={p}>{p}</li>)}</ul>
          <h3 style={{ fontSize: '1.05rem' }}>What your opponent is trying to do</h3>
          <ul className="list-plain stack-sm" style={{ margin: 0 }}>{o.plans.opponent.map((p) => <li key={p}>{p}</li>)}</ul>
          <h3 style={{ fontSize: '1.05rem' }}>Typical mistakes</h3>
          <ul className="list-plain stack-sm" style={{ margin: 0 }}>{o.mistakes.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      </div>
      <section className="sheet pad stack-sm" aria-labelledby="mine">
        <h3 id="mine" style={{ margin: 0 }}>In your games</h3>
        {loading || !stats ? (
          <p className="muted" style={{ margin: 0 }}>Looking through your games...</p>
        ) : stats.games === 0 ? (
          <p className="muted" style={{ margin: 0 }}>None of your games as {side} reached this line in the first 12 moves. Games are matched by position, so move-order changes still count.</p>
        ) : (
          <>
            <p style={{ margin: 0 }}>
              You reached this position in <strong>{stats.games}</strong> {stats.games === 1 ? 'game' : 'games'} as {side}: {stats.wins} won, {stats.draws} drawn, {stats.losses} lost.
              {stats.analysed < stats.games ? ` ${stats.games - stats.analysed} of them are not analysed yet, so their mistakes are not listed.` : ''}
            </p>
            {stats.mistakes.length ? (
              <>
                <div className="label">Your costliest mistakes in this opening</div>
                <ul className="list-plain stack-sm" style={{ margin: 0 }}>
                  {stats.mistakes.slice(0, 5).map((m) => (
                    <li key={`${m.gameId}-${m.ply}`}>
                      <Link to={`/analysis/${m.gameId}?ply=${m.ply}`}>{m.label}</Link>
                      {m.bestSan ? ` — ${m.bestSan} was better` : ''} <span className="muted small">({m.winLoss.toFixed(0)} win-chance points lost)</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : stats.analysed ? (
              <p className="muted" style={{ margin: 0 }}>No serious mistakes in the first 12 moves of your analysed games here.</p>
            ) : null}
          </>
        )}
      </section>
      {o.traps.length ? (
        <section className="stack-sm" aria-labelledby="traps">
          <h3 id="traps" style={{ margin: 0 }}>Traps to know</h3>
          <div className="grid-2" style={{ alignItems: 'start' }}>{o.traps.map((t) => <TrapCard key={t.id} trap={t} side={t.by} />)}</div>
        </section>
      ) : null}
    </div>
  );
}

export function OpeningLibrary() {
  const [open, setOpen] = useState<string | null>(null);
  const [side, setSide] = useState<'all' | Color>('all');
  const current = OPENING_LIBRARY.find((o) => o.id === open);
  if (current) return <Detail o={current} onBack={() => setOpen(null)} />;
  const shown = OPENING_LIBRARY.filter((o) => side === 'all' || o.side === side);
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>The main openings with the idea behind them, the plans for both sides, the usual mistakes, a few classic traps, and what your own games say about each one.</p>
      <Segmented<'all' | Color> label="Played as" value={side} onChange={setSide} options={[{ value: 'all', label: 'All' }, { value: 'w', label: 'White' }, { value: 'b', label: 'Black' }]} />
      <div className="grid-3">
        {shown.map((o) => (
          <button key={o.id} type="button" className="hero-card" style={{ textAlign: 'left', cursor: 'pointer', border: 0 }} onClick={() => setOpen(o.id)}>
            <MiniBoard fen={fenAfter(o.line, o.line.length)} orientation={o.side} />
            <span className="hero-card-meta">
              <strong>{o.name}</strong>
              <span className="muted small">{o.gist}</span>
            </span>
            <span className="btn btn-sm">{o.traps.length ? `Learn it · ${o.traps.length} ${o.traps.length === 1 ? 'trap' : 'traps'}` : 'Learn it'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
