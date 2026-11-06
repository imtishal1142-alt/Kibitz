import { Coach } from '../../components/Coach';
import { quizLine } from '../../lib/coach/lines';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Celebrate } from '../../components/Celebrate';
import { Banner, PageHead } from '../../components/ui';
import { Board } from '../../components/Board';
import type { MarkKind } from '../../components/Board';
import { POSITIONAL } from '../../lib/training/positionalLessons';
import type { PositionalLesson } from '../../lib/training/positionalLessons';

interface Question {
  id: string;
  fen: string;
  squares: string[];
  ask: string;
  what: string;
}
const QUESTIONS: Question[] = POSITIONAL.flatMap((l) => [{ id: l.id, fen: l.fen, squares: l.squares, ask: l.ask, what: l.what }, ...l.more.map((m) => ({ id: l.id, fen: m.fen, squares: m.squares, ask: l.ask, what: l.what }))]);

function shuffle<T>(xs: T[], seed: number): T[] {
  const a = xs.slice();
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function Lesson({ l, onBack }: { l: PositionalLesson; onBack: () => void }) {
  const marks: Record<string, MarkKind> = {};
  for (const s of l.squares) marks[s] = 'info';
  return (
    <div className="stack">
      <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={onBack}>All ideas</button>
      <div className="grid-2">
        <Board fen={l.fen} marks={marks} ariaLabel={`${l.title} diagram`} />
        <div className="stack-sm">
          <h2>{l.title}</h2>
          <p><strong>What it is.</strong> {l.what}</p>
          <p><strong>Why it matters.</strong> {l.why}</p>
          <p><strong>If you have it.</strong> {l.have}</p>
          <p><strong>If your opponent has it.</strong> {l.face}</p>
        </div>
      </div>
    </div>
  );
}

function Quiz({ onBack }: { onBack: () => void }) {
  const [round, setRound] = useState(0);
  const order = useMemo(() => shuffle(QUESTIONS, 7 + round * 13).slice(0, 12), [round]);
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<{ sq: string; ok: boolean } | null>(null);
  const q = order[i];
  if (!q) {
    return (
      <div className="stack">
        {score === order.length ? <Celebrate /> : null}
        <h2>Quiz finished</h2>
        <p>You found {score} of {order.length}.</p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => { setRound(round + 1); setI(0); setScore(0); setPicked(null); }}>Again</button>
          <button type="button" className="btn" onClick={onBack}>All ideas</button>
        </div>
      </div>
    );
  }
  const marks: Record<string, MarkKind> = {};
  if (picked) {
    marks[picked.sq] = picked.ok ? 'good' : 'bad';
    if (!picked.ok) for (const s of q.squares) marks[s] = 'best';
  }
  return (
    <div className="stack">
      <div className="row">
        <span className="chip">{i + 1} / {order.length}</span>
        <span className="chip">Score {score}</span>
        <button type="button" className="btn" onClick={onBack}>Stop</button>
      </div>
      <div className="grid-2">
        <Board
          fen={q.fen}
          marks={marks}
          ariaLabel="Quiz position"
          onSquareClick={(sq) => {
            if (picked) return;
            const ok = q.squares.includes(sq);
            setPicked({ sq, ok });
            if (ok) setScore((n) => n + 1);
          }}
        />
        <div className="stack-sm">
          <h2>{q.ask}</h2>
          {picked ? (
            <>
              <Coach compact autoSpeak={false} mood={quizLine(picked.ok, i).mood} text={quizLine(picked.ok, i).text} />
              <Banner kind={picked.ok ? 'ok' : 'warn'} role="status">
                {picked.ok ? 'Correct.' : `Not that square. It is ${q.squares.join(' or ')}.`} {q.what}
              </Banner>
              <button type="button" className="btn btn-primary" onClick={() => { setI(i + 1); setPicked(null); }}>Next</button>
            </>
          ) : (
            <p className="muted">Click a square on the board.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Positional() {
  const [mode, setMode] = useState<{ kind: 'list' } | { kind: 'quiz' } | { kind: 'lesson'; l: PositionalLesson }>({ kind: 'list' });
  return (
    <div className="stack">
      <PageHead title="Positional play" sub="The quiet things that decide games when nothing is hanging." actions={<Link className="btn" to="/train">All tools</Link>} />
      {mode.kind === 'lesson' ? (
        <Lesson l={mode.l} onBack={() => setMode({ kind: 'list' })} />
      ) : mode.kind === 'quiz' ? (
        <Quiz onBack={() => setMode({ kind: 'list' })} />
      ) : (
        <>
          <Banner kind="info">
            These are plain board features, found by rule from the position, not engine opinions. The same detector explains your quiet mistakes in Review.
          </Banner>
          <button type="button" className="nav-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setMode({ kind: 'quiz' })}>
            <strong>Train your eye</strong>
            <span>Find the feature on the board. {QUESTIONS.length} positions, twelve at a time.</span>
          </button>
          <div className="grid-3">
            {POSITIONAL.map((l) => (
              <button key={l.id} type="button" className="nav-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => setMode({ kind: 'lesson', l })}>
                <strong>{l.title}</strong>
                <span>{l.what}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
