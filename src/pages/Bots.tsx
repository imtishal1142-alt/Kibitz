import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BotAvatar } from '../components/BotAvatar';
import { Icon } from '../components/Icon';
import { MiniBoard } from '../components/MiniBoard';
import { PageHead } from '../components/ui';
import { BOTS, BOT_TIERS, botById } from '../lib/engine/bots';
import { describeConfig } from '../lib/engine/strength';
import { START_FEN } from '../lib/chess/rules';
import { usePrefs } from '../hooks/usePrefs';

type Pick = 'w' | 'r' | 'b';
const COLORS: { id: Pick; label: string }[] = [
  { id: 'w', label: 'Play as White' },
  { id: 'r', label: 'Random colour' },
  { id: 'b', label: 'Play as Black' },
];

export default function Bots() {
  const nav = useNavigate();
  const [prefs] = usePrefs();
  const [id, setId] = useState('dara');
  const [color, setColor] = useState<Pick>('w');
  const bot = botById(id) ?? BOTS[0]!;
  const me = prefs.chesscomUser.trim() || 'You';
  const flip = color === 'b';
  const strip = (name: string, kind: 'bot' | 'me') => (
    <div className="strip">
      {kind === 'bot' ? (
        <span className="strip-avatar-img">
          <BotAvatar bot={bot} size={42} />
        </span>
      ) : (
        <span className="strip-avatar strip-avatar-b" aria-hidden="true">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="strip-name">{name}</div>
    </div>
  );
  return (
    <div className="stack">
      <PageHead title="Bots" sub="Pick an opponent. Every bot is the bundled Stockfish, limited in a way the description spells out. None has a rating, because any number would be a guess." />
      <div className="analysis bots-layout">
        <div className="stack-sm">
          {strip(flip ? me : bot.name, flip ? 'me' : 'bot')}
          <div className="board-wrap">
            <div className="board-frame">
              <MiniBoard fen={START_FEN} orientation={flip ? 'b' : 'w'} />
            </div>
          </div>
          {strip(flip ? bot.name : me, flip ? 'bot' : 'me')}
        </div>
        <section className="review bots-panel" aria-label="Choose a bot">
          <div className="review-head">
            <h2>
              <span className="review-head-icon" aria-hidden="true">
                <Icon name="bot" size={18} />
              </span>
              Play bots
            </h2>
          </div>
          <div className="bots-selected" aria-live="polite">
            <BotAvatar bot={bot} size={84} />
            <div>
              <h3>{bot.name}</h3>
              <p className="small" style={{ margin: '2px 0 4px' }}>
                {bot.tagline}
              </p>
              <p className="hint" style={{ margin: 0 }}>
                {describeConfig(bot.config)}
                {bot.config.style ? `. Style: favours ${bot.config.style === 'attacker' ? 'captures and checks' : bot.config.style === 'trader' ? 'captures and trades' : 'quiet moves'}.` : ''}
              </p>
            </div>
          </div>
          <div className="bots-scroll">
            {BOT_TIERS.map((tier) => (
              <div key={tier} className="bots-tier">
                <h3 className="bots-tier-h">
                  {tier} <span className="muted small">{BOTS.filter((b) => b.tier === tier).length} bots</span>
                </h3>
                <ul className="bots-grid list-plain">
                  {BOTS.filter((b) => b.tier === tier).map((b) => (
                    <li key={b.id}>
                      <button type="button" className="bot-tile" aria-pressed={b.id === id} onClick={() => setId(b.id)} title={b.tagline}>
                        <BotAvatar bot={b} size={64} />
                        <span className="bot-tile-name">{b.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="bots-foot">
            <div className="bots-colors" role="group" aria-label="Your colour">
              {COLORS.map((c) => (
                <button key={c.id} type="button" className="bots-color" aria-pressed={color === c.id} aria-label={c.label} title={c.label} onClick={() => setColor(c.id)}>
                  <span className={`bots-color-sq bots-color-${c.id}`} aria-hidden="true">
                    {c.id === 'r' ? '?' : ''}
                  </span>
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-primary btn-lg" onClick={() => nav(`/play?bot=${bot.id}&color=${color}&go=1`)} aria-label={`Play ${bot.name}`}>
              <Icon name="play" /> Play
            </button>
          </div>
        </section>
      </div>
      <p className="hint">Want to set the level yourself, or use a clock? Use the <a href="#/play">Play page</a>. Two engines against each other: <a href="#/match">Engine vs engine</a>.</p>
    </div>
  );
}
