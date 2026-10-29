import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { PageHead } from '../components/ui';
import { BOTS, BOT_TIERS } from '../lib/engine/bots';
import type { Bot } from '../lib/engine/bots';
import { describeConfig } from '../lib/engine/strength';

function Avatar({ bot }: { bot: Bot }) {
  return (
    <span className="bot-avatar" style={{ background: `hsl(${bot.hue} 42% 38%)` }} aria-hidden="true">
      {bot.name.slice(0, 1)}
    </span>
  );
}

export default function Bots() {
  const nav = useNavigate();
  return (
    <div className="stack">
      <PageHead title="Bots" sub="Pick an opponent. Every bot is the bundled Stockfish, limited in a way the description spells out. None of them has a rating, because any number would be a guess." />
      {BOT_TIERS.map((tier) => (
        <section key={tier} className="stack-sm" aria-labelledby={`tier-${tier}`}>
          <h2 id={`tier-${tier}`}>{tier}</h2>
          <ul className="bot-grid list-plain">
            {BOTS.filter((b) => b.tier === tier).map((b) => (
              <li key={b.id} className="bot-card sheet">
                <div className="bot-top">
                  <Avatar bot={b} />
                  <div>
                    <h3>{b.name}</h3>
                    <p className="small muted" style={{ margin: 0 }}>
                      {b.tagline}
                    </p>
                  </div>
                </div>
                <p className="hint" style={{ margin: 0 }}>
                  {describeConfig(b.config)}
                  {b.config.style ? `. Style: favours ${b.config.style === 'attacker' ? 'captures and checks' : b.config.style === 'trader' ? 'captures and trades' : 'quiet moves'}.` : ''}
                </p>
                <button type="button" className="btn btn-primary" onClick={() => nav(`/play?bot=${b.id}`)} aria-label={`Play ${b.name}`}>
                  <Icon name="play" /> Play {b.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="hint">Want two engines to play each other? Use the Engine vs engine lab from the Play page.</p>
    </div>
  );
}
