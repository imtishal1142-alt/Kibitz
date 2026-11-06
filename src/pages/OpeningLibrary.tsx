import { Coach } from '../components/Coach';
import { drillLine } from '../lib/coach/lines';
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
import { ANSWERS, BAND_PLANS } from '../lib/training/openingAnswers';
import { AGGRESSION_LABEL, BAND_LABEL, STYLE_LABEL } from '../lib/training/openingMeta';
import type { Band, Style } from '../lib/training/openingMeta';
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
      {(() => {
        const l = done ? drillLine('done', { times: readDrills()[id] }, mistakes) : note ? drillLine('wrong', {}, misses) : n > (side === 'w' ? 0 : 1) ? drillLine('right', {}, n) : drillLine('start', { name: label }, 0);
        return <Coach compact autoSpeak={false} mood={l.mood} text={l.text} />;
      })()}
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
      {o.profile ? <ProfileBox o={o} /> : null}
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
      {o.variations?.length ? <Lines o={o} /> : null}
      {o.traps.length ? (
        <section className="stack-sm" aria-labelledby="traps">
          <h3 id="traps" style={{ margin: 0 }}>Traps to know</h3>
          <div className="grid-2" style={{ alignItems: 'start' }}>{o.traps.map((t) => <TrapCard key={t.id} trap={t} side={t.by} />)}</div>
        </section>
      ) : null}
    </div>
  );
}

function ProfileBox({ o }: { o: OpeningLesson }) {
  const pr = o.profile!;
  return (
    <section className="sheet pad-sm stack-sm" aria-label="Character of this opening">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span className="chip">{AGGRESSION_LABEL[pr.aggression]}</span>
        {pr.styles.map((x) => <span key={x} className="chip">{STYLE_LABEL[x]}</span>)}
        <span className="chip">{['', 'Little theory', 'Some theory', 'Heavy theory'][pr.theory]}</span>
      </div>
      <p style={{ margin: 0 }}>{pr.choose}</p>
      <p className="small muted" style={{ margin: 0 }}>
        Suits: {pr.bands.map((b) => BAND_LABEL[b]).join(', ')}. This is common coaching guidance, not a statistic from this app or a promise about results.
      </p>
    </section>
  );
}

/** Other well-known lines of one opening, each with a stepper and a drill. */
function Lines({ o }: { o: OpeningLesson }) {
  const vs = o.variations ?? [];
  const [i, setI] = useState(0);
  const [mode, setMode] = useState<'watch' | 'play'>('watch');
  const cur = vs[Math.min(i, vs.length - 1)]!;
  return (
    <section className="stack-sm" aria-labelledby="lines">
      <h3 id="lines" style={{ margin: 0 }}>Other lines ({vs.length})</h3>
      <div className="row" style={{ flexWrap: 'wrap' }} role="group" aria-label="Choose a line">
        {vs.map((x, k) => (
          <button key={x.name} type="button" className="btn btn-sm" aria-pressed={k === i} onClick={() => setI(k)} style={k === i ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px var(--accent-tint)' } : undefined}>{x.name}</button>
        ))}
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack-sm">
          <Segmented<'watch' | 'play'> label="Line mode" value={mode} onChange={setMode} options={[{ value: 'watch', label: 'Watch' }, { value: 'play', label: 'Play it yourself' }]} />
          {mode === 'watch' ? <Stepper key={cur.name} sans={cur.line} orientation={o.side} label={cur.name} /> : <Drill key={`${o.id}-${cur.name}`} id={`${o.id}:${cur.name}`} sans={cur.line} side={o.side} label={cur.name} why={cur.note} />}
        </div>
        <div className="stack-sm">
          <h4 style={{ margin: 0 }}>{cur.name}</h4>
          <p style={{ margin: 0 }}>{cur.note}</p>
          <p className="small muted" style={{ margin: 0 }}>{cur.line.length} moves from the start. Other moves can be good; this is the standard line.</p>
        </div>
      </div>
    </section>
  );
}

function Guide({ onOpen }: { onOpen: (id: string) => void }) {
  const [band, setBand] = useState<Band>('club');
  const plan = BAND_PLANS.find((b) => b.band === band)!;
  const byId = (id: string) => OPENING_LIBRARY.find((o) => o.id === id);
  const spectrum = [...OPENING_LIBRARY].filter((o) => o.profile).sort((a, b) => a.profile!.aggression - b.profile!.aggression || a.name.localeCompare(b.name));
  const group = (n: number) => spectrum.filter((o) => o.profile!.aggression === n);
  const Names = ({ ids }: { ids: string[] }) => (
    <span>{ids.map((id, k) => { const op = byId(id); return op ? <span key={id}>{k ? ', ' : ''}<button type="button" className="link-btn" onClick={() => onOpen(id)}>{op.name}</button></span> : null; })}</span>
  );
  return (
    <div className="stack">
      <section className="sheet pad stack-sm" aria-labelledby="by-rating">
        <h3 id="by-rating" style={{ margin: 0 }}>Which opening for my rating?</h3>
        <Segmented<Band> label="Rating range" value={band} onChange={setBand} options={(['beginner', 'club', 'advanced', 'expert'] as Band[]).map((b) => ({ value: b, label: BAND_LABEL[b] }))} />
        <p style={{ margin: 0 }}>{plan.advice}</p>
        <ul className="list-plain stack-sm" style={{ margin: 0 }}>
          <li><strong>As White:</strong> <Names ids={plan.white} /></li>
          <li><strong>As Black against 1.e4:</strong> <Names ids={plan.vsE4} /></li>
          <li><strong>As Black against 1.d4:</strong> <Names ids={plan.vsD4} /></li>
        </ul>
        <p className="small muted" style={{ margin: 0 }}>These are common coaching recommendations for each range, not statistics from this app. The best opening is one you understand and enjoy.</p>
      </section>
      <section className="sheet pad stack-sm" aria-labelledby="spectrum">
        <h3 id="spectrum" style={{ margin: 0 }}>From most defensive to most offensive</h3>
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="stack-sm">
            <div className="label">{AGGRESSION_LABEL[n]} ({group(n).length})</div>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {group(n).map((o) => <button key={o.id} type="button" className="btn btn-sm" onClick={() => onOpen(o.id)}>{o.name}</button>)}
            </div>
          </div>
        ))}
        <p className="small muted" style={{ margin: 0 }}>Aggression is a rough 1 to 5 judgement of how sharp and attacking the typical positions are. System openings (London, Colle, King's Indian Attack, Torre, Stonewall Attack, Larsen, Bird) are listed with the "System" style filter in the library.</p>
      </section>
    </div>
  );
}

function Answers({ onOpen }: { onOpen: (id: string) => void }) {
  const [id, setId] = useState(ANSWERS[0]!.id);
  const a = ANSWERS.find((x) => x.id === id)!;
  return (
    <div className="stack">
      <div className="stack-sm">
        <label className="label" htmlFor="ans-sel">What did your opponent play?</label>
        <select id="ans-sel" className="select" value={id} onChange={(e) => setId(e.target.value)}>
          {ANSWERS.map((x) => <option key={x.id} value={x.id}>{x.when}</option>)}
        </select>
      </div>
      <h3 style={{ margin: 0 }}>{a.when}: your options as {a.chooser === 'w' ? 'White' : 'Black'}</h3>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {a.replies.map((r) => (
          <article key={r.name} className="sheet pad stack-sm" aria-label={r.name}>
            <h4 style={{ margin: 0 }}>{r.name}</h4>
            <p style={{ margin: 0 }}>{r.why}</p>
            <p className="small muted" style={{ margin: 0 }}>Good for: {r.bands.map((b) => BAND_LABEL[b]).join(', ')}.</p>
            <Stepper sans={r.line} orientation={a.chooser} label={r.name} />
            {r.opening ? <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onOpen(r.opening!)}>Study this opening</button> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

export function OpeningLibrary() {
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'guide' | 'answers'>('list');
  const [side, setSide] = useState<'all' | Color>('all');
  const [style, setStyle] = useState<'all' | Style>('all');
  const [band, setBand] = useState<'all' | Band>('all');
  const [sort, setSort] = useState<'default' | 'defensive' | 'offensive' | 'theory'>('default');
  const [q, setQ] = useState('');
  const current = OPENING_LIBRARY.find((o) => o.id === open);
  if (current) return <Detail o={current} onBack={() => setOpen(null)} />;
  const text = q.trim().toLowerCase();
  let shown = OPENING_LIBRARY.filter((o) => (side === 'all' || o.side === side) && (style === 'all' || o.profile?.styles.includes(style)) && (band === 'all' || o.profile?.bands.includes(band)) && (!text || o.name.toLowerCase().includes(text) || o.eco.toLowerCase().includes(text)));
  if (sort === 'defensive') shown = [...shown].sort((a, b) => (a.profile?.aggression ?? 3) - (b.profile?.aggression ?? 3));
  if (sort === 'offensive') shown = [...shown].sort((a, b) => (b.profile?.aggression ?? 3) - (a.profile?.aggression ?? 3));
  if (sort === 'theory') shown = [...shown].sort((a, b) => (a.profile?.theory ?? 2) - (b.profile?.theory ?? 2));
  const goto = (id: string) => { setOpen(id); };
  const lines = OPENING_LIBRARY.reduce((n, o) => n + 1 + (o.variations?.length ?? 0), 0);
  const traps = OPENING_LIBRARY.reduce((n, o) => n + o.traps.length, 0);
  return (
    <div className="stack">
      <p className="muted" style={{ margin: 0 }}>{OPENING_LIBRARY.length} openings, {lines} lines and {traps} traps, with the idea, plans, mistakes and your own results for each.</p>
      <Segmented<'list' | 'guide' | 'answers'> label="Library view" value={view} onChange={setView} options={[{ value: 'list', label: 'All openings' }, { value: 'guide', label: 'Which opening?' }, { value: 'answers', label: 'What to play against...' }]} />
      {view === 'guide' ? <Guide onOpen={goto} /> : view === 'answers' ? <Answers onOpen={goto} /> : (
        <>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <input className="input" type="search" placeholder="Search by name or code" aria-label="Search openings" value={q} onChange={(e) => setQ(e.target.value)} />
            <Segmented<'all' | Color> label="Played as" value={side} onChange={setSide} options={[{ value: 'all', label: 'All' }, { value: 'w', label: 'White' }, { value: 'b', label: 'Black' }]} />
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <label className="small muted" htmlFor="f-style">Style</label>
            <select id="f-style" className="select" value={style} onChange={(e) => setStyle(e.target.value as 'all' | Style)}>
              <option value="all">Any style</option>
              {(Object.keys(STYLE_LABEL) as Style[]).map((x) => <option key={x} value={x}>{STYLE_LABEL[x]}</option>)}
            </select>
            <label className="small muted" htmlFor="f-band">Rating</label>
            <select id="f-band" className="select" value={band} onChange={(e) => setBand(e.target.value as 'all' | Band)}>
              <option value="all">Any rating</option>
              {(Object.keys(BAND_LABEL) as Band[]).map((x) => <option key={x} value={x}>{BAND_LABEL[x]}</option>)}
            </select>
            <label className="small muted" htmlFor="f-sort">Sort</label>
            <select id="f-sort" className="select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="default">Library order</option>
              <option value="defensive">Most defensive first</option>
              <option value="offensive">Most offensive first</option>
              <option value="theory">Least theory first</option>
            </select>
          </div>
          {shown.length === 0 ? <p className="muted">No opening matches these filters.</p> : null}
          <div className="grid-3">
            {shown.map((o) => (
              <button key={o.id} type="button" className="hero-card" style={{ textAlign: 'left', cursor: 'pointer', border: 0 }} onClick={() => setOpen(o.id)}>
                <MiniBoard fen={fenAfter(o.line, o.line.length)} orientation={o.side} />
                <span className="hero-card-meta">
                  <strong>{o.name}</strong>
                  <span className="muted small">{o.gist}</span>
                  {o.profile ? <span className="small muted">{AGGRESSION_LABEL[o.profile.aggression]} · {o.profile.styles.map((x) => STYLE_LABEL[x]).join(', ')}</span> : null}
                </span>
                <span className="btn btn-sm">{`Learn it${(o.variations?.length ?? 0) ? ` · ${(o.variations?.length ?? 0) + 1} lines` : ''}${o.traps.length ? ` · ${o.traps.length} ${o.traps.length === 1 ? 'trap' : 'traps'}` : ''}`}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
