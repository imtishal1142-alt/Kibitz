import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import type { IconName } from '../components/Icon';
import { MiniBoard } from '../components/MiniBoard';
import { PageHead } from '../components/ui';
import { usePuzzles, useRepertoire, useSrs } from '../hooks/data';
import { useSessionView } from '../hooks/session';
import { POSITIONAL } from '../lib/training/positionalLessons';
import { ENDGAMES } from '../lib/training/endgames';
import { OPENING_LIBRARY } from '../lib/training/openingLibrary';
import { isDue } from '../lib/training/srs';

interface Feature {
  to: string;
  title: string;
  text: string;
  fen: string;
  orientation?: 'w' | 'b';
  badge?: string | null;
}

interface Small {
  to: string;
  title: string;
  text: string;
  icon: IconName;
}

const LEARN: Omit<Feature, 'badge'>[] = [
  { to: '/openings', title: 'Openings', text: 'Learn the ideas, traps and plans, and see where your own games go wrong.', fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4' },
  { to: '/train/positional', title: 'Positional play', text: 'Pawn structure, outposts, open files and bishops, with a quiz to train your eye.', fen: 'r1bq1rk1/pp3ppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQ1RK1 w - - 0 9' },
  { to: '/train/tactics', title: 'Tactic patterns', text: 'Forks, pins, skewers, mates and more: learn the pattern, then practise it.', fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4' },
  { to: '/train/endgames', title: 'Endgames', text: 'Win the won positions and hold the drawn ones against the engine.', fen: '8/8/3k4/8/3K4/3P4/8/8 w - - 0 1' },
  { to: '/puzzles', title: 'Puzzles', text: 'Positions from your own games, repeated until you stop missing them.', fen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4', orientation: 'b' },
];

const PRACTISE: Small[] = [
  { to: '/train/mistakes', title: 'Mistake replay', text: 'Find the better move in the spots where you went wrong.', icon: 'undo' },
  { to: '/train/prevention', title: 'Blunder prevention', text: 'Name the threat before you move.', icon: 'warn' },
  { to: '/train/guess', title: 'Guess the move', text: 'Replay a game and play what you would choose.', icon: 'eye' },
  { to: '/train/candidates', title: 'Candidate moves', text: 'Shortlist moves, then compare with the engine.', icon: 'bulb' },
];

const MORE: Small[] = [
  { to: '/train/notebook', title: 'Notebook', text: 'Save positions with your notes.', icon: 'note' },
  { to: '/train/reflect', title: 'Reflection', text: 'Three questions after a game.', icon: 'book' },
  { to: '/train/calendar', title: 'Calendar', text: 'What you practised, and your streak.', icon: 'calendar' },
  { to: '/match', title: 'Engine match', text: 'Two engines play each other.', icon: 'swords' },
];

export default function Train() {
  const puzzles = usePuzzles();
  const srs = useSrs();
  const lines = useRepertoire();
  const sv = useSessionView();
  const due = (srs.data ?? []).filter((s) => isDue(s, Date.now())).length;
  const badge = (to: string): string | null => {
    if (to === '/puzzles' && puzzles.data) return puzzles.data.length ? `${due} due · ${puzzles.data.length} total` : 'None yet';
    if (to === '/openings') return lines.data?.length ? `${lines.data.length} in your repertoire` : `${OPENING_LIBRARY.length} to learn`;
    if (to === '/train/positional') return `${POSITIONAL.length} ideas + quiz`;
    if (to === '/train/tactics') return '11 patterns';
    if (to === '/train/endgames') return `${ENDGAMES.length} lessons`;
    return null;
  };
  const s = sv.loading ? null : sv.session;
  return (
    <div className="stack train">
      <PageHead title="Train" sub="Pick one thing and start." />

      <Link to="/session" className="train-hero" style={{ ['--i' as string]: 0 }}>
        <div className="train-hero-text">
          <span className="train-kicker">Today</span>
          <strong>{s ? (s.complete ? 'Today\'s session is done' : s.doneCount ? 'Keep going' : 'Start today\'s session') : 'Today\'s session'}</strong>
          <span>
            {s
              ? s.steps.length
                ? `${s.doneCount} of ${s.steps.length} steps done${s.complete ? '' : `, about ${s.steps.filter((x) => !x.complete).reduce((n, x) => n + x.minutes, 0)} minutes left`}.`
                : 'Nothing planned yet. Import some games to begin.'
              : 'Built from your own games.'}
          </span>
        </div>
        <div className="train-hero-art" aria-hidden="true">
          <span className="train-ring" style={{ ['--p' as string]: s && s.steps.length ? s.doneCount / s.steps.length : 0 }}>
            <Icon name="play" size={26} />
          </span>
        </div>
      </Link>

      <section className="stack-sm" aria-labelledby="learn-h">
        <h2 id="learn-h" className="train-h">Learn</h2>
        <div className="train-features">
          {LEARN.map((f, i) => (
            <Link key={f.to} to={f.to} className="train-card" style={{ ['--i' as string]: i + 1 }}>
              <span className="train-art"><MiniBoard fen={f.fen} orientation={f.orientation} /></span>
              <span className="train-body">
                <strong>{f.title}</strong>
                <span>{f.text}</span>
                {badge(f.to) ? <span className="chip">{badge(f.to)}</span> : null}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="stack-sm" aria-labelledby="prac-h">
        <h2 id="prac-h" className="train-h">Practise</h2>
        <div className="train-tiles">
          {PRACTISE.map((t, i) => (
            <Link key={t.to} to={t.to} className="train-tile" style={{ ['--i' as string]: i + 4 }}>
              <span className="train-icon"><Icon name={t.icon} size={22} /></span>
              <strong>{t.title}</strong>
              <span>{t.text}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="stack-sm" aria-labelledby="more-h">
        <h2 id="more-h" className="train-h">More</h2>
        <div className="train-tiles train-tiles-sm">
          {MORE.map((t, i) => (
            <Link key={t.to} to={t.to} className="train-tile" style={{ ['--i' as string]: i + 8 }}>
              <span className="train-icon"><Icon name={t.icon} size={20} /></span>
              <strong>{t.title}</strong>
              <span>{t.text}</span>
            </Link>
          ))}
          <Link to="/progress" className="train-tile" style={{ ['--i' as string]: 12 }}>
            <span className="train-icon"><Icon name="insights" size={20} /></span>
            <strong>Progress</strong>
            <span>How you are changing over time.</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
