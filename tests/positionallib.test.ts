import { describe, it, expect } from 'vitest';
import { POSITIONAL, lessonFeatures } from '../src/lib/training/positionalLessons';
import { validateFen } from '../src/lib/chess/rules';

import type { PositionalLesson } from '../src/lib/training/positionalLessons';
import { positionFeatures } from '../src/lib/analysis/positional';

/** What the detector finds for a lesson's feature in a given position, as a list of squares ('*' = the lesson is about the whole side). */
function found(l: PositionalLesson, fen: string): string[] {
  const f = positionFeatures(fen)[l.side];
  switch (l.feature) {
    case 'bishopPair': return f.bishopPair ? ['*'] : [];
    case 'doubled': return f.doubled.length ? ['*'] : [];
    case 'kingInCentre': return f.kingInCentre ? ['*'] : [];
    case 'undeveloped': return f.undeveloped > 0 ? ['*'] : [];
    case 'kingShield': return f.kingShield > 0 ? ['*'] : [];
    default: return f[l.feature] as string[];
  }
}

describe('positional lessons', () => {
  it('has an id, a question and a diagram for every idea, with no duplicates', () => {
    expect(new Set(POSITIONAL.map((l) => l.id)).size).toBe(POSITIONAL.length);
    expect(POSITIONAL.length).toBeGreaterThanOrEqual(16);
    for (const l of POSITIONAL) expect(l.ask.length, l.id).toBeGreaterThan(5);
  });
  for (const l of POSITIONAL) {
    for (const [i, d] of [{ fen: l.fen, squares: l.squares }, ...l.more].entries()) {
      it(`${l.id}${i ? ` (extra ${i})` : ''}: diagram shows what the lesson says`, () => {
        expect(validateFen(d.fen).ok).toBe(true);
        const hit = found(l, d.fen);
        expect(hit.length).toBeGreaterThan(0);
        if (!hit.includes('*')) for (const s of d.squares) expect(hit).toContain(s);
      });
    }
  }
  it('lessonFeatures still returns the side features', () => {
    expect(lessonFeatures(POSITIONAL[0]!).isolated.length).toBeGreaterThan(0);
  });
});
