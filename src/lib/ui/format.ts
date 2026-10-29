import type { GameRecord, MoveAnalysis, MoveClass, TimeClass } from '../types';
import { resultLabel } from '../games/records';

export const moveNumberLabel = (ply: number, san: string): string => `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '...'}${san}`;

export const TIME_CLASS_LABEL: Record<TimeClass, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', daily: 'Daily', classical: 'Classical', unknown: 'Unknown' };

export function formatDate(ts: number | string | undefined): string {
  if (ts === undefined) return '';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts.replace(/\./g, '-'));
  if (Number.isNaN(d.getTime())) return typeof ts === 'string' ? ts : '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(ts: number | undefined): string {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 45) return `${d} day${d === 1 ? '' : 's'} ago`;
  return formatDate(ts);
}

export function gameTitle(g: GameRecord): string {
  return `${g.white} vs ${g.black}`;
}

/** The date to show for a game: exact when known, otherwise the partial date or "Date unknown". */
export function gameDateText(g: Pick<GameRecord, 'dateLabel' | 'endTime' | 'date'>): string {
  return g.dateLabel ?? formatDate(g.endTime || g.date);
}

export function gameSubtitle(g: GameRecord): string {
  const tc = g.timeControl ? `${TIME_CLASS_LABEL[g.timeClass]} ${g.timeControl}`.replace(/^Unknown /, '') : g.timeClass === 'unknown' ? '' : TIME_CLASS_LABEL[g.timeClass];
  const bits = [resultLabel(g), tc, g.opening, gameDateText(g)];
  return bits.filter(Boolean).join(' · ');
}

export const pct = (n: number, d = 0): string => `${n.toFixed(d)}%`;

export function classFlagsText(m: Pick<MoveAnalysis, 'flags'>): string[] {
  const out: string[] = [];
  if (m.flags.includes('missed-mate')) out.push('Missed a forced mate');
  if (m.flags.includes('allowed-mate')) out.push('Allowed a forced mate');
  if (m.flags.includes('missed-win')) out.push('Let a win slip');
  if (m.flags.includes('turning-point')) out.push('Turning point');
  if (m.flags.includes('critical')) out.push('Critical moment: only one move held the position');
  return out;
}

export const isBad = (c: MoveClass): boolean => c === 'mistake' || c === 'blunder';
export const isDubious = (c: MoveClass): boolean => c === 'inaccuracy' || c === 'mistake' || c === 'blunder';
