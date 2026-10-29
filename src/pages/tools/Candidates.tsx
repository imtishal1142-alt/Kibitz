import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Empty, PageHead, Segmented, Spinner } from '../../components/ui';
import { Board, ARROW_COLORS } from '../../components/Board';
import { GamePicker } from '../../components/GamePicker';
import { Icon } from '../../components/Icon';
import { Pv } from '../../components/Pv';
import { evaluateCandidates } from '../../lib/analysis/assess';
import { formatScore } from '../../lib/chess/eval';
import { uciLineToSan, uciToSan } from '../../lib/chess/rules';
import { guessPositions, judgeCandidates } from '../../lib/training/guess';
import type { CandidateJudgement, GuessPosition } from '../../lib/training/guess';
import { bumpCalendar } from '../../lib/storage/repos';
import { useGames } from '../../hooks/data';
import { getEngine } from '../../services/engines';
import { playSound } from '../../services/sound';
import type { Color, SearchLine } from '../../lib/types';

type Phase = 'pick' | 'busy' | 'result' | 'error';

export default function Candidates() {
  const games = useGames();
  const eligible = useMemo(() => (games.data ?? []).filter((g) => g.plies >= 24 && (!g.rules || g.rules === 'chess') && !g.startFen), [games.data]);
  const [gameId, setGameId] = useState('');
  const game = eligible.find((g) => g.id === gameId);
  const [side, setSide] = useState<Color>('w');
  const mySide: Color = game?.userColor ?? side;
  const [positions, setPositions] = useState<GuessPosition[]>([]);
  const [index, setIndex] = useState(0);
  const [cands, setCands] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('pick');
  const [verdict, setVerdict] = useState<CandidateJudgement | null>(null);
  const [lines, setLines] = useState<SearchLine[]>([]);
  const [error, setError] = useState('');
  const token = useRef(0);
  const pos = positions[index];

  const start = () => {
    if (!game) return;
    const all = guessPositions(game, { side: mySide, fromPly: 11 });
    const step = Math.max(1, Math.floor(all.length / 8));
    setPositions(all.filter((_, i) => i % step === 0).slice(0, 8));
    setIndex(0);
    setCands([]);
    setPhase('pick');
    setVerdict(null);
  };

  const compare = () => {
    if (!pos || !cands.length) return;
    const my = ++token.current;
    setPhase('busy');
    void (async () => {
      try {
        const engine = await getEngine('live');
        const top = await engine.search({ fen: pos.fen, depth: 14, multipv: 3 });
        if (top.cancelled || my !== token.current) return;
        const mine = await evaluateCandidates(engine, pos.fen, cands, { depth: 14 });
        if (!mine || my !== token.current) return;
        const j = judgeCandidates(pos.color, top.lines, mine, (u) => uciToSan(pos.fen, u) ?? u);
        setLines(top.lines);
        setVerdict(j);
        setPhase('result');
        playSound(j.verdict === 'found-best' ? 'correct' : 'wrong');
        void bumpCalendar({ lessons: 1 });
      } catch (e) {
        if (my === token.current) {
          setError(e instanceof Error ? e.message : 'The engine failed.');
          setPhase('error');
        }
      }
    })();
  };

  const next = () => {
    setIndex((i) => i + 1);
    setCands([]);
    setVerdict(null);
    setPhase('pick');
  };

  const arrows = pos && phase === 'pick' ? cands.map((u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), color: ARROW_COLORS.alt })) : pos && verdict ? lines.slice(0, 1).flatMap((l) => (l.pv[0] ? [{ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), color: ARROW_COLORS.best }] : [])) : [];

  return (
    <div className="stack">
      <PageHead title="Candidate moves" sub="Strong players look at a few moves before choosing. Name yours, then see how they compare." actions={<Link className="btn" to="/train">All tools</Link>} />
      {games.loading ? <Spinner /> : eligible.length === 0 ? (
        <Empty title="No suitable game yet" action={<Link className="btn btn-primary" to="/library">Add games</Link>}>
          You need a standard-chess game with at least 12 moves. The built-in demo game works too.
        </Empty>
      ) : !pos ? (
        <section className="sheet pad stack page-narrow">
          {positions.length && index >= positions.length ? <Banner kind="ok">Round finished. Pick another game or go again.</Banner> : null}
          <GamePicker games={eligible} value={gameId} onChange={setGameId} id="cand-game" />
          {game && !game.userColor ? <Segmented<Color> label="Side" value={side} onChange={setSide} options={[{ value: 'w', label: 'White' }, { value: 'b', label: 'Black' }]} /> : null}
          <div><button className="btn btn-primary" type="button" disabled={!game} onClick={start}><Icon name="play" /> Start</button></div>
        </section>
      ) : (
        <div className="analysis">
          <div className="board-wrap">
            <Board
              fen={pos.fen}
              orientation={pos.color}
              movable={phase === 'pick' && cands.length < 3 ? pos.color : null}
              onMove={(m) => {
                if (!cands.includes(m.uci)) setCands((c) => [...c, m.uci]);
                return false; // candidate moves are noted, never played
              }}
              arrows={arrows}
              ariaLabel={`Candidate moves. ${pos.color === 'w' ? 'White' : 'Black'} to move.`}
            />
          </div>
          <div className="stack-sm">
            <section className="sheet pad stack-sm" aria-label="Exercise">
              <span className="chip" style={{ alignSelf: 'flex-start' }}>
                Position {index + 1} of {positions.length}
              </span>
              <h2 style={{ fontSize: '1.15rem' }}>{pos.color === 'w' ? 'White' : 'Black'}: pick one to three candidate moves</h2>
              <p className="muted small" style={{ margin: 0 }}>Drag a piece (or click it, then a square) to note a candidate. The piece springs back: nothing is played. Keyboard: open “Type a move instead” under the board.</p>
              <div className="row" aria-label="Your candidates">
                {cands.length === 0 ? <span className="muted small">No candidates yet.</span> : null}
                {cands.map((u) => (
                  <span key={u} className="chip chip-accent">
                    {uciToSan(pos.fen, u) ?? u}
                    {phase === 'pick' ? (
                      <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label={`Remove ${uciToSan(pos.fen, u) ?? u}`} onClick={() => setCands((c) => c.filter((x) => x !== u))} style={{ minHeight: 0, padding: 0 }}>
                        <Icon name="x" size={12} />
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
              {phase === 'pick' ? (
                <div className="row">
                  <button className="btn btn-primary" type="button" disabled={!cands.length} onClick={compare}>
                    Compare with the engine
                  </button>
                  <button className="btn btn-sm" type="button" onClick={next}>
                    Skip
                  </button>
                </div>
              ) : null}
              {phase === 'busy' ? <Spinner label="The engine is evaluating your candidates…" /> : null}
              {phase === 'error' ? (
                <Banner kind="bad" role="alert">
                  {error} <button className="btn btn-sm" type="button" onClick={() => setPhase('pick')}>Back</button>
                </Banner>
              ) : null}
              {phase === 'result' && verdict ? (
                <div className="stack-sm" role="status">
                  <strong>{verdict.title}</strong>
                  <p style={{ margin: 0 }}>{verdict.detail}</p>
                  <div className="facts">
                    <div className="facts-title">Verified by the engine (depth 14)</div>
                    <div className="table-wrap">
                      <table className="table">
                        <caption className="sr-only">Your candidates ranked by the engine</caption>
                        <thead>
                          <tr>
                            <th scope="col">Your move</th>
                            <th scope="col" className="right">Winning chances</th>
                          </tr>
                        </thead>
                        <tbody>
                          {verdict.ranked.map((r) => (
                            <tr key={r.uci}>
                              <th scope="row">{r.san}{r.isEngineTop ? ' (engine top choice)' : ''}</th>
                              <td className="right num">{r.win.toFixed(0)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="label" style={{ marginTop: 8 }}>The engine&apos;s own top lines</div>
                    {lines.map((l) => (
                      <div className="engine-line" key={l.multipv}>
                        <span className="score-pill">{formatScore(l.score, { signed: true })}</span>
                        <Pv fen={pos.fen} sans={uciLineToSan(pos.fen, l.pv, 8).sans} max={8} />
                      </div>
                    ))}
                  </div>
                  <div>
                    <button className="btn btn-primary" type="button" onClick={next} autoFocus>
                      {index + 1 >= positions.length ? 'Finish' : 'Next position'} <Icon name="right" />
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
