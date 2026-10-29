import { Chess } from 'chess.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Empty, Field, PageHead, Segmented, TabPanel, Tabs } from '../components/ui';
import { Board } from '../components/Board';
import { Icon } from '../components/Icon';
import { loadOpenings, openingAt, searchOpenings, theoryContinuations } from '../lib/chess/openings';
import { START_FEN } from '../lib/chess/rules';
import { expectedMoves, findDeviations, formatLine, groupDeviations, suggestLines, toRepertoireLine, validateLine } from '../lib/training/repertoire';
import { deleteRepertoire, putRepertoire } from '../lib/storage/repos';
import { isPersonal } from '../lib/games/records';
import { useGames, useRepertoire } from '../hooks/data';
import { usePrefs } from '../hooks/usePrefs';
import { playSound, soundForSan } from '../services/sound';
import { toast } from '../services/toast';
import type { Color, RepertoireLine } from '../lib/types';

type Tab = 'drill' | 'repertoire' | 'games' | 'explore';

const colorName = (c: Color) => (c === 'w' ? 'White' : 'Black');

/** Accepts "1.e4 e5 2.Nf3 Nc6", "e4 e5 Nf3" and similar, returns bare SAN tokens. */
function tokens(text: string): string[] {
  return text
    .replace(/\{[^}]*\}|\([^)]*\)|\$\d+/g, ' ')
    .replace(/\d+\s*\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
}

export default function Openings() {
  const [tab, setTab] = useState<Tab>('drill');
  const [ready, setReady] = useState(false);
  const lines = useRepertoire();

  useEffect(() => {
    void loadOpenings()
      .then(() => setReady(true))
      .catch(() => setReady(false));
  }, []);

  return (
    <div className="stack">
      <PageHead title="Openings" sub="Build a repertoire from the lines you actually play, then drill it." />
      <section className="sheet">
        <Tabs
          label="Opening tools"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'drill', label: 'Drill' },
            { id: 'repertoire', label: `Repertoire (${lines.data?.length ?? 0})` },
            { id: 'games', label: 'From my games' },
            { id: 'explore', label: 'Explore theory' },
          ]}
        />
        <TabPanel id="drill" active={tab === 'drill'}>
          <Drill lines={lines.data ?? []} onAdd={() => setTab('repertoire')} />
        </TabPanel>
        <TabPanel id="repertoire" active={tab === 'repertoire'}>
          <Repertoire lines={lines.data ?? []} ready={ready} />
        </TabPanel>
        <TabPanel id="games" active={tab === 'games'}>
          <FromGames lines={lines.data ?? []} ready={ready} />
        </TabPanel>
        <TabPanel id="explore" active={tab === 'explore'}>
          <Explore ready={ready} />
        </TabPanel>
      </section>
    </div>
  );
}

/* ------------------------------ repertoire ------------------------------ */

function Repertoire({ lines, ready }: { lines: RepertoireLine[]; ready: boolean }) {
  const [color, setColor] = useState<Color>('w');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const check = useMemo(() => (text.trim() ? validateLine(tokens(text)) : null), [text]);
  const finalFen = check?.fens.at(-1) ?? START_FEN;
  const detected = ready && check?.ok ? openingAt(finalFen)?.name : undefined;

  const add = () => {
    const sans = tokens(text);
    const v = validateLine(sans);
    if (!sans.length) return setError('Type some moves first, for example 1.e4 e5 2.Nf3 Nc6 3.Bb5.');
    if (!v.ok) return setError(v.error ?? 'Those moves are not legal.');
    if (v.sans.length < 2) return setError('A line needs at least two moves.');
    setError('');
    void putRepertoire(toRepertoireLine(color, v.sans, name.trim() || detected || formatLine(v.sans.slice(0, 6)))).then(() => {
      toast.success('Line added.');
      setText('');
      setName('');
    });
  };

  return (
    <div className="pad stack">
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="stack-sm">
          <h3 style={{ fontSize: '1.05rem' }}>Add a line</h3>
          <Field label="You play">
            <Segmented<Color> label="Colour" value={color} onChange={setColor} options={[{ value: 'w', label: 'White' }, { value: 'b', label: 'Black' }]} />
          </Field>
          <Field label="Moves" htmlFor="rep-moves" hint="Standard notation from the start position, including the opponent's replies. Move numbers are optional.">
            <textarea id="rep-moves" className="textarea textarea-mono" rows={3} value={text} onChange={(e) => (setText(e.target.value), setError(''))} placeholder="1.e4 e5 2.Nf3 Nc6 3.Bb5 a6" spellCheck={false} aria-invalid={!!error || (check ? !check.ok : false)} />
          </Field>
          {check && !check.ok ? (
            <p role="alert" className="small" style={{ margin: 0, color: 'var(--c-blunder)' }}>
              {check.error}
            </p>
          ) : null}
          <Field label="Name (optional)" htmlFor="rep-name" hint={detected ? `Detected: ${detected}` : undefined}>
            <input id="rep-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={detected ?? 'My Ruy Lopez'} />
          </Field>
          {error ? (
            <p role="alert" className="small" style={{ margin: 0, color: 'var(--c-blunder)' }}>
              {error}
            </p>
          ) : null}
          <div>
            <button className="btn btn-primary" type="button" onClick={add}>
              <Icon name="plus" /> Add to repertoire
            </button>
          </div>
        </div>
        <div className="board-wrap" style={{ maxWidth: 320 }}>
          <Board fen={finalFen} orientation={color} ariaLabel="Preview of the position after your line" />
        </div>
      </div>

      <div className="stack-sm">
        <h3 style={{ fontSize: '1.05rem' }}>Your lines</h3>
        {lines.length === 0 ? <p className="muted" style={{ margin: 0 }}>None yet. Add one above, or build lines from your games in the next tab.</p> : null}
        {(['w', 'b'] as const).map((c) => {
          const mine = lines.filter((l) => l.color === c);
          if (!mine.length) return null;
          return (
            <div key={c}>
              <div className="label">As {colorName(c)}</div>
              <ul className="list-plain list-rows">
                {mine.map((l) => (
                  <li key={l.id} className="row-nowrap" style={{ alignItems: 'flex-start' }}>
                    <span className="grow">
                      <strong>{l.name}</strong>
                      <span className="muted small" style={{ display: 'block' }}>
                        {formatLine(l.sans)}
                        {l.stats ? ` · drilled ${l.stats.attempts}×, clean ${l.stats.correct}×` : ''}
                      </span>
                    </span>
                    <button className="btn btn-sm btn-quiet" type="button" aria-label={`Delete ${l.name}`} onClick={() => void deleteRepertoire(l.id)}>
                      <Icon name="trash" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------- drill --------------------------------- */

type DrillState = { history: string[]; fen: string; tries: number; clean: boolean; done: boolean; msg: string; last: { from: string; to: string } | null };

function Drill({ lines, onAdd }: { lines: RepertoireLine[]; onAdd: () => void }) {
  const [color, setColor] = useState<Color>('w');
  const colorLines = lines.filter((l) => l.color === color);
  const [d, setD] = useState<DrillState | null>(null);
  const [score, setScore] = useState({ clean: 0, total: 0 });
  const timer = useRef<number | null>(null);

  const startState = (): DrillState => ({ history: [], fen: START_FEN, tries: 0, clean: true, done: false, msg: '', last: null });

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const playSan = (state: DrillState, san: string): DrillState => {
    const c = new Chess(state.fen);
    const mv = c.move(san);
    playSound(soundForSan(mv.san));
    return { ...state, history: [...state.history, mv.san], fen: c.fen(), last: { from: mv.from, to: mv.to } };
  };

  // After each move, play the opponent's reply from the repertoire, or finish the line.
  const settle = (state: DrillState) => {
    const exp = expectedMoves(lines, color, state.history);
    const myTurn = (color === 'w') === (state.history.length % 2 === 0);
    if (myTurn) {
      if (!exp.user.length) return finish(state);
      setD({ ...state, msg: '' });
      return;
    }
    if (!exp.opponent.length) return finish(state);
    const pick = exp.opponent[Math.floor(Math.random() * exp.opponent.length)]!;
    setD({ ...state, msg: 'Opponent replies…' });
    timer.current = window.setTimeout(() => settle(playSan(state, pick)), 450);
  };

  const finish = (state: DrillState) => {
    const full = state.history.join(' ');
    for (const l of lines) {
      if (l.color === color && l.sans.join(' ') === full) void putRepertoire({ ...l, stats: { attempts: (l.stats?.attempts ?? 0) + 1, correct: (l.stats?.correct ?? 0) + (state.clean ? 1 : 0) } });
    }
    setScore((s) => ({ clean: s.clean + (state.clean ? 1 : 0), total: s.total + 1 }));
    setD({ ...state, done: true, msg: state.clean ? 'Line complete with no mistakes.' : 'Line complete. You needed help on the way, so it will come up again.' });
  };

  const start = () => {
    if (timer.current) clearTimeout(timer.current);
    settle(startState());
  };

  const onMove = (m: { san: string }): boolean => {
    if (!d || d.done) return false;
    const myTurn = (color === 'w') === (d.history.length % 2 === 0);
    if (!myTurn) return false;
    const exp = expectedMoves(lines, color, d.history).user;
    if (exp.includes(m.san)) {
      settle(playSan(d, m.san));
      return true;
    }
    playSound('wrong');
    const tries = d.tries + 1;
    setD({ ...d, tries, clean: false, msg: tries >= 2 ? `Your repertoire plays ${exp.join(' or ')} here. Play it to continue.` : 'That is not in your repertoire here. Try again.' });
    return false;
  };

  if (lines.length === 0)
    return (
      <div className="pad">
        <Empty title="Your repertoire is empty" action={<button className="btn btn-primary" type="button" onClick={onAdd}>Add lines</button>}>
          Drilling needs lines to drill. Add a few by hand or build them from your games.
        </Empty>
      </div>
    );

  return (
    <div className="pad stack">
      <div className="row">
        <Segmented<Color> label="Drill as" value={color} onChange={(c) => (setColor(c), setD(null))} options={[{ value: 'w', label: 'White' }, { value: 'b', label: 'Black' }]} />
        <span className="muted small">
          {colorLines.length} line{colorLines.length === 1 ? '' : 's'} as {colorName(color)}
          {score.total ? ` · ${score.clean} of ${score.total} clean this session` : ''}
        </span>
      </div>
      {colorLines.length === 0 ? (
        <p className="muted">No lines as {colorName(color)} yet.</p>
      ) : (
        <div className="analysis">
          <div className="board-wrap">
            <Board fen={d?.fen ?? START_FEN} orientation={color} movable={d && !d.done ? color : null} onMove={onMove} lastMove={d?.last ?? null} ariaLabel="Opening drill board" />
          </div>
          <div className="stack-sm">
            <div role="status" aria-live="polite" style={{ minHeight: 24 }}>
              {d?.msg ? <strong>{d.msg}</strong> : d ? null : <span className="muted">Press Start. You play your repertoire moves as {colorName(color)}; the opponent&apos;s replies are played for you.</span>}
            </div>
            {d && d.history.length ? <p className="small muted" style={{ margin: 0 }}>{formatLine(d.history)}</p> : null}
            <div className="row">
              <button className="btn btn-primary" type="button" onClick={start}>
                <Icon name={d ? 'refresh' : 'play'} /> {d ? (d.done ? 'Next line' : 'Restart') : 'Start'}
              </button>
              {d && !d.done ? (
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    const exp = expectedMoves(lines, color, d.history).user;
                    setD({ ...d, clean: false, msg: `Your repertoire plays ${exp.join(' or ')} here.` });
                  }}
                >
                  <Icon name="bulb" /> Show the move
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ from my games ------------------------------ */

function FromGames({ lines, ready }: { lines: RepertoireLine[]; ready: boolean }) {
  const [prefs] = usePrefs();
  const games = useGames();
  const mine = useMemo(() => (games.data ?? []).filter((g) => isPersonal(g, prefs.includeDemoInStats) && g.userOutcome), [games.data, prefs.includeDemoInStats]);
  const have = new Set(lines.map((l) => l.id));
  const suggested = useMemo(() => (['w', 'b'] as const).map((c) => ({ c, list: suggestLines(mine, c, { minGames: 2 }) })), [mine, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  const devs = useMemo(() => (['w', 'b'] as const).map((c) => ({ c, groups: groupDeviations(findDeviations(mine, lines.filter((l) => l.color === c), c)) })), [mine, lines]);

  if (!mine.length)
    return (
      <div className="pad">
        <Empty title="No games to learn from" action={<Link className="btn btn-primary" to="/chesscom">Import games</Link>}>
          Suggested lines come from openings you have played at least twice.
        </Empty>
      </div>
    );

  return (
    <div className="pad stack">
      <p className="muted" style={{ margin: 0 }}>
        Built from {mine.length} of your games. A line follows the move you chose most often at each of your turns, and branches at the replies you have met at least twice. Score is wins plus half the draws.
      </p>
      {suggested.map(({ c, list }) => (
        <div key={c} className="stack-sm">
          <h3 style={{ fontSize: '1.05rem' }}>Lines you play as {colorName(c)}</h3>
          {list.length === 0 ? <p className="muted" style={{ margin: 0 }}>No opening repeated often enough yet.</p> : null}
          <ul className="list-plain list-rows">
            {list.map((l) => {
              const id = toRepertoireLine(c, l.sans, '').id;
              return (
                <li key={id} className="row-nowrap" style={{ alignItems: 'flex-start' }}>
                  <span className="grow">
                    <strong>{l.name || formatLine(l.sans.slice(0, 4))}</strong>
                    <span className="muted small" style={{ display: 'block' }}>
                      {formatLine(l.sans)} · {l.games} games, score {(l.score * 100).toFixed(0)}% ({l.wins}W {l.draws}D {l.losses}L)
                    </span>
                  </span>
                  {have.has(id) ? (
                    <span className="chip chip-ok">In repertoire</span>
                  ) : (
                    <button className="btn btn-sm" type="button" onClick={() => void putRepertoire(toRepertoireLine(c, l.sans, l.name || formatLine(l.sans.slice(0, 4)))).then(() => toast.success('Added to your repertoire.'))}>
                      <Icon name="plus" /> Add
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="stack-sm">
        <h3 style={{ fontSize: '1.05rem' }}>Where you left your repertoire</h3>
        {lines.length === 0 ? <p className="muted" style={{ margin: 0 }}>Add lines to your repertoire and Kibitz will show the first move of each game that left it.</p> : null}
        {devs.map(({ c, groups }) =>
          groups.length ? (
            <div key={c}>
              <div className="label">As {colorName(c)}</div>
              <ul className="list-plain list-rows">
                {groups.slice(0, 8).map((g) => (
                  <li key={g.history.join(' ')}>
                    After <strong>{g.history.length ? formatLine(g.history) : 'the start'}</strong> your repertoire plays {g.expected.join(' or ')}, but in {g.games} game{g.games === 1 ? '' : 's'} you played{' '}
                    {g.played.map((p) => `${p.san} (${p.games}×, score ${(p.score * 100).toFixed(0)}%)`).join(', ')}.
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
        {lines.length > 0 && devs.every((x) => x.groups.length === 0) ? <Banner kind="ok">None of your games left your repertoire at your own move.</Banner> : null}
      </div>
    </div>
  );
}

/* --------------------------------- explore --------------------------------- */

function Explore({ ready }: { ready: boolean }) {
  const [q, setQ] = useState('');
  const [sans, setSans] = useState<string[]>([]);
  const check = useMemo(() => validateLine(sans), [sans]);
  const fen = check.fens.at(-1) ?? START_FEN;
  const here = ready ? openingAt(fen) : null;
  const next = ready ? theoryContinuations(sans) : [];
  const results = ready && q.trim().length >= 2 ? searchOpenings(q, 20) : [];

  return (
    <div className="pad stack">
      {!ready ? <p className="muted">Loading the opening names…</p> : null}
      <div className="analysis">
        <div className="stack-sm">
          <div className="board-wrap">
            <Board fen={fen} movable="both" onMove={(m) => (setSans((s) => [...s, m.san]), true)} lastMove={null} ariaLabel="Opening explorer board" />
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn btn-sm" type="button" disabled={!sans.length} onClick={() => setSans((s) => s.slice(0, -1))}>
              <Icon name="undo" /> Back
            </button>
            <button className="btn btn-sm" type="button" disabled={!sans.length} onClick={() => setSans([])}>
              Reset
            </button>
          </div>
        </div>
        <div className="stack-sm">
          <div>
            <div className="label">Position</div>
            <strong>{here ? `${here.name} (${here.eco})` : sans.length ? 'No named opening here' : 'Starting position'}</strong>
            {sans.length ? <div className="muted small">{formatLine(sans)}</div> : null}
          </div>
          {next.length ? (
            <div>
              <div className="label">Named continuations</div>
              <div className="row">
                {next.map((n) => (
                  <button key={n.san} className="btn btn-sm" type="button" onClick={() => setSans((s) => [...s, n.san])} title={n.names.join(', ')}>
                    {n.san}
                    {n.names.length ? <span className="muted"> {n.names[0]}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ) : sans.length ? (
            <p className="muted small" style={{ margin: 0 }}>
              No further named lines from here in the opening dataset.
            </p>
          ) : null}
          <Field label="Search openings by name or ECO code" htmlFor="op-q">
            <input id="op-q" className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sicilian, Najdorf, B90…" />
          </Field>
          {results.length ? (
            <ul className="list-plain list-rows" style={{ maxHeight: 260, overflow: 'auto' }}>
              {results.map((o) => (
                <li key={`${o.eco}-${o.epd}`}>
                  <button className="btn btn-quiet" type="button" style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => setSans(o.sans)}>
                    <strong>{o.eco}</strong> {o.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="hint" style={{ margin: 0 }}>
            Opening names come from the open lichess chess-openings dataset (CC0). The continuation list follows exact move order; a position reached by a different move order is still named correctly above.
          </p>
        </div>
      </div>
    </div>
  );
}
