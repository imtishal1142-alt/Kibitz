import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { Link } from 'react-router-dom';
import { Board } from '../components/Board';
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
  return (
    <article className="sheet pad stack-sm" aria-label={trap.name}>
      <h4 style={{ margin: 0 }}>{trap.name} <span className="chip">{trap.by === 'w' ? 'White springs it' : 'Black springs it'}</span></h4>
      <p style={{ margin: 0 }}>{trap.lesson}</p>
      <Stepper sans={trap.line} orientation={side} label={trap.name} />
    </article>
  );
}

function Detail({ o, onBack }: { o: OpeningLesson; onBack: () => void }) {
  const { games, analyses, loading } = usePersonalEntries();
  const stats = useMemo(() => (games && analyses ? openingStats(o, games, analyses) : null), [o, games, analyses]);
  const side = o.side === 'w' ? 'White' : 'Black';
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn btn-sm" onClick={onBack}>All openings</button>
        <span className="chip">{o.eco} · usually played as {side}</span>
      </div>
      <h2 style={{ margin: 0 }}>{o.name}</h2>
      <p className="muted" style={{ margin: 0 }}>{o.gist}</p>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Stepper sans={o.line} orientation={o.side} label={`${o.name} main line`} />
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
