import { useNavigate } from 'react-router-dom';
import { Dialog } from '../components/ui';
import { Icon } from '../components/Icon';
import { ensureDemoGame } from '../lib/data/ensureDemo';
import { toast } from '../services/toast';

export function Onboarding({ open, onDone }: { open: boolean; onDone: () => void }) {
  const nav = useNavigate();
  const go = (to: string) => {
    onDone();
    nav(to);
  };
  return (
    <Dialog
      open={open}
      onClose={onDone}
      title="Welcome to Kibitz"
      footer={
        <button className="btn btn-quiet" type="button" onClick={onDone}>
          Skip for now
        </button>
      }
    >
      <div className="stack">
        <p>Kibitz plays and analyses chess with a real Stockfish engine running inside your browser, then turns your own mistakes into training.</p>
        <ul className="list-plain stack-sm">
          <li className="row-nowrap" style={{ alignItems: 'flex-start' }}>
            <Icon name="shield" /> <span>Your games, analysis and progress stay in this browser. There is no account and no Kibitz server.</span>
          </li>
          <li className="row-nowrap" style={{ alignItems: 'flex-start' }}>
            <Icon name="cloud" /> <span>The one network request: importing from Chess.com asks Chess.com&apos;s public data service for that username&apos;s public games. Nothing else leaves your device.</span>
          </li>
          <li className="row-nowrap" style={{ alignItems: 'flex-start' }}>
            <Icon name="download" /> <span>You can export a full backup or delete everything at any time in Settings.</span>
          </li>
        </ul>
        <div className="stack-sm">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() =>
              void ensureDemoGame()
                .then((id) => go(`/analysis/${id}`))
                .catch(() => toast.error('Could not add the demo game.'))
            }
          >
            <Icon name="eye" /> Look around with the demo game
          </button>
          <button className="btn" type="button" onClick={() => go('/chesscom')}>
            <Icon name="cloud" /> Import my Chess.com games
          </button>
          <button className="btn" type="button" onClick={() => go('/play')}>
            <Icon name="play" /> Play the engine
          </button>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          The demo game is Morphy&apos;s 1858 &quot;Opera Game&quot;. It is labelled as a demo wherever it appears and is left out of your statistics.
        </p>
      </div>
    </Dialog>
  );
}
