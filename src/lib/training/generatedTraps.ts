// Traps found by engine search: starting from library positions, a move that looks natural to a shallow search but
// loses clearly at depth 15, kept only when the reply is a real tactic and the final position stays clearly better for
// the trap-setter (depth 16). They are not from a book and have no famous names.
import type { Color } from '../types';
import type { Trap } from './openingLibrary';
import data from '../../data/generatedTraps.json';

interface Raw {
  opening: string;
  by: Color;
  base: string[];
  tempting: string;
  best: string;
  line: string[];
  does: string[];
  loss: number;
}

const moveNo = (plies: number, san: string): string => `${Math.floor(plies / 2) + 1}${plies % 2 === 0 ? '.' : '...'}${san}`;

export function generatedTrapsFor(openingId: string): Trap[] {
  const out: Trap[] = [];
  (data as Raw[]).forEach((r, i) => {
    if (r.opening !== openingId) return;
    const reply = r.line[1];
    const does = r.does[0] ? ` ${reply} ${r.does[0].replace(/\s*\([^)]*\)/g, '')}.` : '';
    out.push({
      id: `gen-${openingId}-${i}`,
      name: `Tempting ${moveNo(r.base.length, r.tempting)}`,
      by: r.by,
      line: [...r.base, ...r.line],
      lesson: `After ${r.base.slice(-3).join(' ')}, ${r.tempting} looks natural, but it loses ground.${does} The better move was ${r.best}. (Found by engine search, not from a book.)`,
      claim: 'material',
    });
  });
  return out;
}
