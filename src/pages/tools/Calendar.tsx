import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHead, Progress, StatBlock } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { listCalendar, localDateKey } from '../../lib/storage/repos';
import { useQuery } from '../../hooks/useQuery';
import { usePrefs } from '../../hooks/usePrefs';
import type { CalendarDay } from '../../lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const activity = (d?: CalendarDay): number => (d ? d.puzzles + d.reviews + d.lessons * 2 + d.played * 3 + d.gamesAnalyzed * 2 : 0);
const level = (n: number): 0 | 1 | 2 | 3 | 4 => (n <= 0 ? 0 : n < 4 ? 1 : n < 10 ? 2 : n < 20 ? 3 : 4);

function key(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function Calendar() {
  const [prefs] = usePrefs();
  const days = useQuery(listCalendar, ['calendar']);
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [picked, setPicked] = useState<string>(localDateKey());
  const byDate = useMemo(() => new Map((days.data ?? []).map((d) => [d.date, d])), [days.data]);

  const first = new Date(cursor.y, cursor.m, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const count = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];

  // Streaks count consecutive local days with any activity. Today may still be empty without breaking a streak.
  const { current, best } = useMemo(() => {
    const active = new Set((days.data ?? []).filter((d) => activity(d) > 0).map((d) => d.date));
    let cur = 0;
    const d = new Date();
    if (!active.has(localDateKey(d))) d.setDate(d.getDate() - 1);
    while (active.has(localDateKey(d))) {
      cur++;
      d.setDate(d.getDate() - 1);
    }
    let bestRun = 0;
    let run = 0;
    let prev: Date | null = null;
    for (const k of [...active].sort()) {
      const [y, m, dd] = k.split('-').map(Number) as [number, number, number];
      const dt = new Date(y, m - 1, dd);
      run = prev && Math.round((dt.getTime() - prev.getTime()) / 86_400_000) === 1 ? run + 1 : 1;
      bestRun = Math.max(bestRun, run);
      prev = dt;
    }
    return { current: cur, best: bestRun };
  }, [days.data]);

  const month = (days.data ?? []).filter((d) => d.date.startsWith(`${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`));
  const sum = (f: (d: CalendarDay) => number) => month.reduce((s, d) => s + f(d), 0);
  const todayRec = byDate.get(localDateKey());
  const sel = byDate.get(picked);
  const shift = (n: number) => setCursor((c) => ({ y: c.y + Math.floor((c.m + n) / 12), m: (c.m + n + 12) % 12 }));

  return (
    <div className="stack">
      <PageHead title="Training calendar" sub="What you practised, day by day. Stored on this device only." actions={<Link className="btn" to="/train">All tools</Link>} />
      <div className="grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <StatBlock label="Current streak" value={`${current} day${current === 1 ? '' : 's'}`} sub="in a row with any practice" />
        <StatBlock label="Best streak" value={`${best} day${best === 1 ? '' : 's'}`} />
        <StatBlock label="Puzzles today" value={`${todayRec?.puzzlesCorrect ?? 0} of ${prefs.dailyGoal}`} sub="solved, against your daily goal" />
      </div>
      <Progress value={Math.min(1, (todayRec?.puzzlesCorrect ?? 0) / Math.max(1, prefs.dailyGoal))} label="Today's puzzle goal" />

      <section className="sheet pad stack-sm" aria-label="Calendar">
        <div className="row">
          <button className="btn btn-icon" type="button" onClick={() => shift(-1)} aria-label="Previous month">
            <Icon name="left" />
          </button>
          <h2 style={{ fontSize: '1.1rem', margin: 0, minWidth: 160, textAlign: 'center' }} aria-live="polite">
            {first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </h2>
          <button className="btn btn-icon" type="button" onClick={() => shift(1)} aria-label="Next month">
            <Icon name="right" />
          </button>
        </div>
        <div role="group" aria-label="Days of the month" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {WEEKDAYS.map((w) => (
            <div key={w} aria-hidden="true" className="small muted" style={{ textAlign: 'center' }}>
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={`b${i}`} />;
            const k = key(cursor.y, cursor.m, d);
            const rec = byDate.get(k);
            const lv = level(activity(rec));
            const isToday = k === localDateKey();
            return (
              <button
                key={k}
                type="button"
                className={`heat-cell ${lv ? `heat-${lv}` : ''}`}
                style={{ aspectRatio: '1', minHeight: 40, border: isToday ? '2px solid var(--accent)' : picked === k ? '2px solid var(--ink-2)' : '1px solid var(--line-2)', color: lv >= 3 ? '#fff' : 'var(--ink)', cursor: 'pointer', fontWeight: 600, borderRadius: 8 }}
                aria-label={`${new Date(cursor.y, cursor.m, d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}: ${rec ? `${rec.puzzles} puzzles, ${rec.played} games played, ${rec.gamesAnalyzed} games analysed` : 'no practice'}`}
                aria-pressed={picked === k}
                onClick={() => setPicked(k)}
              >
                {d}
              </button>
            );
          })}
        </div>
        <p className="hint" style={{ margin: 0 }}>Darker means more activity. Puzzles count 1, a reflection or lesson 2, an analysed game 2 and a played game 3.</p>
      </section>

      <section className="sheet pad stack-sm" aria-label="Day detail">
        <h2 style={{ fontSize: '1.05rem' }}>{picked}</h2>
        {sel ? (
          <ul className="list-plain" style={{ margin: 0 }}>
            <li>{sel.puzzles} puzzles attempted, {sel.puzzlesCorrect} solved first time</li>
            <li>{sel.reviews} reviews, {sel.lessons} lessons and reflections</li>
            <li>{sel.played} games played, {sel.gamesAnalyzed} games analysed</li>
            <li>About {sel.minutes} minutes of puzzle time</li>
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Nothing recorded on this day.</p>
        )}
        <p className="small muted" style={{ margin: 0 }}>
          This month: {sum((d) => d.puzzles)} puzzles, {sum((d) => d.played)} games played, {sum((d) => d.gamesAnalyzed)} games analysed.
        </p>
      </section>
    </div>
  );
}
