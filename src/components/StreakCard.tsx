import type { StreakInfo } from '../lib/training/streak';
import { Icon } from './Icon';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function StreakCard({ streak }: { streak: StreakInfo }) {
  const word = streak.current === 1 ? 'day' : 'days';
  return (
    <div className="streak" role="group" aria-label="Practice streak">
      <div className="streak-main">
        <span className="streak-icon" aria-hidden="true">
          <Icon name="trophy" size={22} />
        </span>
        <div>
          <div className="streak-n">
            {streak.current} <span className="streak-w">{word}</span>
          </div>
          <div className="small muted">
            {streak.activeToday ? 'Practised today. Nice.' : streak.current > 0 ? 'Practise today to keep it going.' : 'Practise today to start a streak.'}
            {streak.longest > streak.current ? ` Longest: ${streak.longest}.` : ''}
          </div>
        </div>
      </div>
      <ol className="streak-week" aria-label="The last seven days">
        {streak.week.map((d) => {
          const dow = DOW[new Date(`${d.date}T12:00:00`).getDay()]!;
          return (
            <li key={d.date} className={d.active ? 'on' : ''}>
              <span className="streak-dot" aria-hidden="true">
                {d.active ? '✓' : ''}
              </span>
              <span className="small">{dow}</span>
              <span className="sr-only">{d.active ? ', practised' : ', no practice'}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
