import { describe, it, expect } from 'vitest';
import { POSITIONAL, lessonFeatures } from '../src/lib/training/positionalLessons';
import { validateFen } from '../src/lib/chess/rules';

describe('positional lessons', () => {
  for (const l of POSITIONAL) {
    it(`${l.id}: diagram shows what the lesson says`, () => {
      expect(validateFen(l.fen).ok).toBe(true);
      const f = lessonFeatures(l);
      if (l.feature === 'bishopPair') expect(f.bishopPair).toBe(true);
      else if (l.feature === 'doubled') expect(f.doubled.length).toBeGreaterThan(0);
      else {
        const found = f[l.feature as 'isolated'];
        expect(found.length).toBeGreaterThan(0);
        for (const s of l.squares) expect(found).toContain(s);
      }
    });
  }
});
