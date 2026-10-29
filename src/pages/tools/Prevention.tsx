import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, Empty, PageHead, Spinner } from '../../components/ui';
import { Board, ARROW_COLORS } from '../../components/Board';
import type { MarkKind } from '../../components/Board';
import { ClassBadge } from '../../components/ClassBadge';
import { Icon } from '../../components/Icon';
import { assessMove, findThreat } from '../../lib/analysis/assess';
import type { MoveAssessment, ThreatReport } from '../../lib/analysis/assess';
import { idbEvalCache } from '../../lib/analysis/gameAnalysis';
import { userMistakes } from '../../lib/analysis/weaknesses';
import { lossClassOf } from '../../lib/chess/classify';
import { resolveMove } from '../../lib/chess/rules';
import { bumpCalendar } from '../../lib/storage/repos';
import { usePersonalEntries } from '../../hooks/data';
import { getEngine } from '../../services/engines';
import { playSound } from '../../services/sound';
import type { GameRecord, MoveAnalysis } from '../../lib/types';

interface Item {
  game: GameRecord;
  move: MoveAnalysis;
}
type Step = 'loading' | 'threat' | 'move' | 'busy' | 'result' | 'error';

export default function Prevention() {
  const { entries, loading } = usePersonalEntries();
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const { game, analysis } of entries ?? []) {
      if (!game.userColor) continue;
      for (const move of userMistakes(analysis, game.userColor)) if (lossClassOf(move) === 'blunder') out.push({ game, move });
    }
    return out.sort((a, b) => b.move.winLoss - a.move.winLoss);
  }, [entries]);

  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>('loading');
  const [report, setReport] = useState<ThreatReport | null>(null);
  const [threatOk, setThreatOk] = useState<boolean | null>(null);
  const [clicked, setClicked] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [res, setRes] = useState<MoveAssessment | null>(null);
  const [error, setError] = useState('');
  const [typedSquare, setTypedSquare] = useState('');
  const [typedBad, setTypedBad] = useState(false);
  const token = useRef(0);
  const item = items[index];

  // For every blunder, first work out (with the engine) what the opponent was really threatening.
  useEffect(() => {
    if (!item) return;
    const my = ++token.current;
    setStep('loading');
    setReport(null);
    setThreatOk(null);
    setClicked(null);
    setShown(null);
    setRes(null);
    setError('');
    void (async () => {
      try {
        const engine = await getEngine('live');
        const r = await findThreat(engine, item.move.fenBefore, { depth: 12, cache: idbEvalCache });
        if (my !== token.current) return;
        if (!r) throw new Error('The engine was interrupted.');
        setReport(r);
        setStep('threat');
      } catch (e) {
        if (my === token.current) {
          setError(e instanceof Error ? e.message : 'The engine failed.');
          setStep('error');
        }
      }
    })();
    const tok = token;
    return () => {
      tok.current++;
    };
  }, [item]);

  if (loading) return <Spinner label="Loading your games…" />;

  const threat = report?.threat ?? null;
  const targetSquares = threat ? new Set([threat.uci.slice(0, 2), threat.uci.slice(2, 4)]) : new Set<string>();

  const answerSquare = (sq: string) => {
    if (step !== 'threat') return;
    setClicked(sq);
    const ok = targetSquares.has(sq);
    setThreatOk(ok);
    playSound(ok ? 'correct' : 'wrong');
    setStep('move');
  };
  const answerNothing = () => {
    if (step !== 'threat') return;
    const ok = !threat;
    setThreatOk(ok);
    playSound(ok ? 'correct' : 'wrong');
    setStep('move');
  };

  const onMove = (m: { uci: string }): boolean => {
    if (!item || step !== 'move') return false;
    const fen = item.move.fenBefore;
    const my = ++token.current;
    setStep('busy');
    setShown(resolveMove(fen, m.uci)?.fenAfter ?? null);
    void (async () => {
      try {
        const engine = await getEngine('live');
        const a = await assessMove(engine, fen, m.uci, { depth: 14, cache: idbEvalCache });
        if (!a || my !== token.current) return;
        setRes(a);
        setStep('result');
        playSound(a.winLoss < 10 ? 'correct' : 'wrong');
        void bumpCalendar({ reviews: 1 });
      } catch (e) {
        if (my === token.current) {
          setError(e instanceof Error ? e.message : 'The engine failed.');
          setStep('error');
        }
      }
    })();
    return true;
  };

  const marks: Record<string, MarkKind> = {};
  if (step !== 'threat' && step !== 'loading' && threat) {
    marks[threat.uci.slice(2, 4)] = 'bad';
  }
  if (clicked && !targetSquares.has(clicked)) marks[clicked] = 'info';

  return (
    <div className="stack">
      <PageHead title="Blunder prevention" sub="Train the habit that stops blunders: find the threat first, then choose a move." actions={<Link className="btn" to="/train">All tools</Link>} />
      {items.length === 0 ? (
        <Empty title="No blunders to practise on" action={<Link className="btn btn-primary" to="/library">Analyse some games</Link>}>
          Positions come from blunders in your own analysed games. Demo games are not used.
        </Empty>
      ) : !item ? (
        <section className="sheet pad stack-sm page-narrow">
          <h2>That was all {items.length}</h2>
          <div><button className="btn btn-primary" type="button" onClick={() => setIndex(0)}>Start again</button></div>
        </section>
      ) : (
        <div className="analysis">
          <div className="board-wrap">
            <Board
              fen={shown ?? item.move.fenBefore}
              orientation={item.move.color}
              movable={step === 'move' ? item.move.color : null}
              onMove={(m) => onMove(m)}
              onSquareClick={answerSquare}
              marks={marks}
              arrows={step === 'result' && threat ? [{ from: threat.uci.slice(0, 2), to: threat.uci.slice(2, 4), color: ARROW_COLORS.bad }] : []}
              ariaLabel={`Blunder prevention. ${item.move.color === 'w' ? 'White' : 'Black'} to move.`}
            />
          </div>
          <div className="stack-sm">
            <section className="sheet pad stack-sm" aria-label="Exercise">
              <div className="row">
                <span className="chip">
                  {index + 1} of {items.length}
                </span>
                <span className="chip">Step {step === 'threat' || step === 'loading' ? 1 : 2} of 2</span>
              </div>
              {step === 'loading' ? <Spinner label="Preparing the position…" /> : null}
              {step === 'error' ? (
                <Banner kind="bad" role="alert">
                  {error}{' '}
                  <button className="btn btn-sm" type="button" onClick={() => setIndex((i) => i + 1)}>Skip this one</button>
                </Banner>
              ) : null}
              {step === 'threat' ? (
                <>
                  <h2 style={{ fontSize: '1.15rem' }}>What is the opponent threatening?</h2>
                  <p className="muted" style={{ margin: 0 }}>
                    Before you move, ask what the opponent would do if it were their turn. Click the square of the piece they would move or take, or say there is nothing urgent.
                  </p>
                  <form
                    className="row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const sq = typedSquare.trim().toLowerCase();
                      if (/^[a-h][1-8]$/.test(sq)) {
                        setTypedBad(false);
                        setTypedSquare('');
                        answerSquare(sq);
                      } else setTypedBad(true);
                    }}
                  >
                    <label className="sr-only" htmlFor="prev-square">
                      Or type the square, for example f7
                    </label>
                    <input id="prev-square" className="input" style={{ width: 96 }} value={typedSquare} onChange={(e) => (setTypedSquare(e.target.value), setTypedBad(false))} placeholder="e.g. f7" maxLength={2} spellCheck={false} autoComplete="off" aria-invalid={typedBad} aria-describedby={typedBad ? 'prev-square-err' : undefined} />
                    <button className="btn" type="submit">
                      Name this square
                    </button>
                    {typedBad ? (
                      <span id="prev-square-err" role="alert" className="small" style={{ color: 'var(--c-blunder)' }}>
                        Type a square such as f7.
                      </span>
                    ) : null}
                  </form>
                  <div className="row">
                    <button className="btn" type="button" onClick={answerNothing}>
                      Nothing urgent
                    </button>
                    <button className="btn btn-sm" type="button" onClick={() => setIndex((i) => i + 1)}>
                      Skip
                    </button>
                  </div>
                </>
              ) : null}
              {step === 'move' || step === 'busy' || step === 'result' ? (
                <div className="facts" role="status">
                  <div className="facts-title">
                    {threatOk ? (
                      <>
                        <Icon name="check" size={14} /> You read the position correctly
                      </>
                    ) : (
                      'The engine sees it differently'
                    )}
                  </div>
                  <p style={{ margin: 0 }}>{report?.note}</p>
                </div>
              ) : null}
              {step === 'move' ? <p style={{ margin: 0 }}><strong>Now choose your move.</strong> In the game you played {item.move.san}, which lost {item.move.winLoss.toFixed(0)} points of winning chances.</p> : null}
              {step === 'busy' ? <Spinner label="Checking your move…" /> : null}
              {step === 'result' && res ? (
                <div className="stack-sm" role="status">
                  <div className="row">
                    <ClassBadge cls={res.cls} />
                    <strong>
                      {res.san}: {res.winLoss < 5 ? 'a safe choice' : res.winLoss < 10 ? 'slightly worse than the best' : 'this loses ground'}
                    </strong>
                  </div>
                  <p style={{ margin: 0 }}>
                    {res.winLoss >= 10 && res.replyPvSan[0] ? `After ${res.san}, the engine's answer is ${res.replyPvSan[0]}. ` : ''}
                    {res.bestSan && res.uci !== res.bestUci ? `The engine prefers ${res.bestSan}.` : ''}
                  </p>
                  <p className="small muted" style={{ margin: 0 }}>The habit: before every move, name the threat, then check what your move leaves undefended.</p>
                  <div>
                    <button className="btn btn-primary" type="button" onClick={() => setIndex((i) => i + 1)} autoFocus>
                      Next position <Icon name="right" />
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
