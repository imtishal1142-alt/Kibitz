import type { MoveClass } from '../lib/types';
import { Icon } from './Icon';

const SYMBOL: Record<MoveClass, string> = {
  brilliant: '!!',
  great: '!',
  best: '★',
  excellent: '✓',
  good: '+',
  book: '',
  inaccuracy: '?!',
  miss: '✕',
  mistake: '?',
  blunder: '??',
  forced: '•',
};

/** The round grade icon. Decorative: the grade is always named in text next to it, or in an sr-only label. */
export function GradeIcon({ cls, size = 18 }: { cls: MoveClass; size?: number }) {
  return (
    <span className={`gi gi-${cls}`} aria-hidden="true" style={{ width: size, height: size, fontSize: Math.round(size * 0.58) }}>
      {cls === 'book' ? <Icon name="book" size={Math.round(size * 0.62)} strokeWidth={2.4} /> : SYMBOL[cls]}
    </span>
  );
}
