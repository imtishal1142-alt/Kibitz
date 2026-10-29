import { Link } from 'react-router-dom';
import { PageHead } from '../components/ui';
import { usePuzzles, useRepertoire, useSrs } from '../hooks/data';
import { isDue } from '../lib/training/srs';

const TOOLS: { to: string; title: string; text: string }[] = [
  { to: '/puzzles', title: 'Puzzles from your games', text: 'Positions where you went wrong, spaced so the ones you miss come back.' },
  { to: '/openings', title: 'Opening trainer', text: 'Drill the repertoire you actually play and see where your games leave it.' },
  { to: '/train/guess', title: 'Guess the move', text: 'Replay a game and play the move you would choose; the engine grades each guess.' },
  { to: '/train/mistakes', title: 'Mistake replay', text: 'Go back to the positions where you blundered and try to find a better move.' },
  { to: '/train/prevention', title: 'Blunder prevention', text: 'Practise the habit: name the threat before you move, then check your move.' },
  { to: '/train/candidates', title: 'Candidate moves', text: 'List two or three moves, then see how your shortlist compares with the engine\'s.' },
  { to: '/train/endgames', title: 'Endgame lab', text: 'Convert or hold classic endings against the engine, with feedback on every move.' },
  { to: '/train/notebook', title: 'Position notebook', text: 'Save positions with your own notes and variations.' },
  { to: '/train/reflect', title: 'Post-game reflection', text: 'Three questions after a game, so the lesson sticks.' },
  { to: '/train/calendar', title: 'Training calendar', text: 'See what you have practised and keep a streak.' },
  { to: '/match', title: 'Engine match lab', text: 'Set two engine strengths against each other and watch or replay the series.' },
];

export default function Train() {
  const puzzles = usePuzzles();
  const srs = useSrs();
  const lines = useRepertoire();
  const due = (srs.data ?? []).filter((s) => isDue(s, Date.now())).length;
  const badge = (to: string): string | null => {
    if (to === '/puzzles' && puzzles.data) return `${puzzles.data.length} puzzles${due ? `, ${due} due` : ''}`;
    if (to === '/openings' && lines.data) return `${lines.data.length} line${lines.data.length === 1 ? '' : 's'}`;
    return null;
  };
  return (
    <div className="stack">
      <PageHead title="Train" sub="Every tool here uses the engine to check what it tells you." />
      <div className="grid-3">
        {TOOLS.map((t) => (
          <Link key={t.to} to={t.to} className="nav-card">
            <strong>{t.title}</strong>
            <span>{t.text}</span>
            {badge(t.to) ? <span className="chip" style={{ alignSelf: 'flex-start' }}>{badge(t.to)}</span> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
