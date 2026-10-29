import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Empty, PageHead, Segmented, Spinner } from '../../components/ui';
import { Board, ARROW_COLORS } from '../../components/Board';
import { ClassBadge } from '../../components/ClassBadge';
import { GamePicker } from '../../components/GamePicker';
import { Icon } from '../../components/Icon';
import { Pv } from '../../components/Pv';
import { assessMove } from '../../lib/analysis/assess';
import type { MoveAssessment } from '../../lib/analysis/assess';
import { idbEvalCache } from '../../lib/analysis/gameAnalysis';
import { resolveMove } from '../../lib/chess/rules';
import { gradeGuess, guessPositions } from '../../lib/training/guess';
import type { GuessGrade, GuessPosition } from '../../lib/training/guess';
import { bumpCalendar } from '../../lib/storage/repos';
import { useGames } from '../../hooks/data';
import { getEngine } from '../../services/engines';
import { playSound } from '../../services/sound';
import type { Color } from '../../lib/types';

type Phase = 'guess' | 'busy' | 'result' | 'error';

function sample<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  const step = list.length / n;
  return Array.from({ length: n }, (_, i) => list[Math.floor(i * step)]!);
}

export default function Guess() {
  const games = useGames();
  const eligible = useMemo(() => (games.data ?? []).filter((g) => g.plies >= 24 && (!g.rules || g.rules === 'chess') && !g.startFen), [games.data]);
  const [gameId, setGameId] = useState('');
  const game = eligible.find((g) => g.id === gameId);
  const [side, setSide] = useState<Color>('w');
  const mySide: Color = game?.userColor ?? side;
  const [run, setRun] = useState<{ positions: GuessPosition[]; index: number; points: number[] } | null>(null);
  const [phase, setPhase] = useState<Phase>('guess');
  const [shown, setShown] = useState<string | null>(null);
  const [result, setResult] = useState<{ guess: MoveAssessment; actual: MoveAssessment | null; grade: GuessGrade } | null>(null);
  const [error, setError] = useState('');
  const token = useRef(0);

  const start = () => {
    if (!game) return;
    const positions = sample(guessPositions(game, { side: mySide }), 10);
    setRun({ positions, index: 0, points: [] });
    setPhase('guess');
    setShown(null);
    setResult(null);
  };

  const pos = run ? run.positions[run.index] : undefined;

  const onGuess = (m: { uci: string }): boolean => {
    if (!pos || phase !== 'guess') return false;
    const my = ++token.current;
    setPhase('busy');
    setShown(resolveMove(pos.fen, m.uci)?.fenAfter ?? null);
    void (async () => {
      try {
        const engine = await getEngine('live');
        const guess = await assessMove(engine, pos.fen, m.uci, { depth: 14, cache: idbEvalCache });
        if (!guess || my !== token.current) return;
        const actual = m.uci === pos.actualUci ? guess : await assessMove(engine, pos.fen, pos.actualUci, { depth: 14, cache: idbEvalCache });
        if (my !== token.current) return;
        const grade = gradeGuess(guess, pos.actualUci);
        playSound(grade.points >= 2 ? 'correct' : 'wrong');
        setResult({ guess, actual, grade });
        setRun((r) => (r ? { ...r, points: [...r.points, grade.points] } : r));
        setPhase('result');
        void bumpCalendar({ puzzles: 0, lessons: 1 });
      } catch (e) {
        if (my === token.current) {
          setError(e instanceof Error ? e.message : 'The engine failed.');
          setPhase('error');
        }
      }
    })();
    return true;
  };

  const next = () => {
    if (!run) return;
    setRun({ ...run, index: run.index + 1 });
    setPhase('guess');
    setShown(null);
    setResult(null);
  };

  const total = run?.points.reduce((a, b) => a + b, 0) ?? 0;
  const finished = run && run.index >= run.positions.length;

  return (
    <div className="stack">
      <PageHead title="Guess the move" sub="Play a game forward, one position at a time. The engine grades your guess against the move played." actions={<Link className="btn" to="/train">All tools</Link>} />
      {games.loading ? <Spinner /> : eligible.length === 0 ? (
        <Empty title="No suitable game yet" action={<Link className="btn btn-primary" to="/library">Add games</Link>}>
          You need a standard-chess game with at least 12 moves. The built-in demo game works too.
        </Empty>
      ) : !run || finished ? (
        <section className="sheet pad stack page-narrow" aria-label="Choose a game">
          {finished ? (
            <Banner kind="ok" role="status">
              Round finished: {total} of {run.positions.length * 3} points. 3 points = the engine&apos;s top choice, 2 = a good alternative, 1 = playable, 0 = missed.
            </Banner>
          ) : null}
          <GamePicker games={eligible} value={gameId} onChange={setGameId} id="guess-game" hint="Games with a result are best: you will see how your guesses compare with what happened." />
          {game && !game.userColor ? (
            <div>
              <div className="label">Guess the moves of</div>
              <Segmented<Color> label="Side" value={side} onChange={setSide} options={[{ value: 'w', label: 'White' }, { value: 'b', label: 'Black' }]} />
            </div>
          ) : null}
          <div>
            <button className="btn btn-primary" type="button" disabled={!game} onClick={start}>
              <Icon name="play" /> Start (up to 10 positions)
            </button>
          </div>
          <p className="hint" style={{ margin: 0 }}>The first eight plies are skipped (that is mostly opening theory), as are positions with only one legal move.</p>
        </section>
      ) : pos ? (
        <div className="analysis">
          <div className="board-wrap">
            <Board fen={shown ?? pos.fen} orientation={pos.color} movable={phase === 'guess' ? pos.color : null} onMove={(m) => onGuess(m)} arrows={phase === 'result' && result?.guess.bestUci ? [{ from: result.guess.bestUci.slice(0, 2), to: result.guess.bestUci.slice(2, 4), color: ARROW_COLORS.best }] : []} ariaLabel={`Guess the move. ${pos.color === 'w' ? 'White' : 'Black'} to move.`} />
          </div>
          <div className="stack-sm">
            <section className="sheet pad stack-sm" aria-label="Guess">
              <div className="row">
                <span className="chip">
                  Position {run.index + 1} of {run.positions.length}
                </span>
                <span className="chip">{total} points</span>
              </div>
              <h2 style={{ fontSize: '1.2rem' }}>
                Move {pos.moveNumber}: what would {pos.color === 'w' ? 'White' : 'Black'} play?
              </h2>
              {phase === 'guess' ? <p className="muted" style={{ margin: 0 }}>Make your move on the board.</p> : null}
              {phase === 'busy' ? <Spinner label="The engine is checking your move…" /> : null}
              {phase === 'error' ? (
                <Banner kind="bad" role="alert">
                  {error} <button className="btn btn-sm" type="button" onClick={() => setPhase('guess')}>Try again</button>
                </Banner>
              ) : null}
              {phase === 'result' && result ? (
                <div className="stack-sm" role="status">
                  <div className="row">
                    <ClassBadge cls={result.guess.cls} />
                    <strong>
                      {result.grade.title}: {result.grade.points} point{result.grade.points === 1 ? '' : 's'}
                    </strong>
                  </div>
                  <p style={{ margin: 0 }}>{result.grade.detail}</p>
                  <div className="facts">
                    <div className="facts-title">Verified by the engine (depth {result.guess.depth})</div>
                    <p style={{ margin: 0 }}>
                      Best move: <strong>{result.guess.bestSan ?? '—'}</strong>
                      {result.guess.bestPvSan.length ? <> <Pv fen={pos.fen} sans={result.guess.bestPvSan} max={8} /></> : null}
                    </p>
                    {result.actual && pos.actualUci !== result.guess.uci ? (
                      <p style={{ margin: '6px 0 0' }}>
                        In the game: <strong>{pos.actualSan}</strong> ({result.actual.cls}, {result.actual.winLoss.toFixed(1)} points from the best).
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <button className="btn btn-primary" type="button" onClick={next} autoFocus>
                      {run.index + 1 >= run.positions.length ? 'Finish' : 'Next position'} <Icon name="right" />
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
