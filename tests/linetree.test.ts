import { describe, expect, it } from 'vitest';
import { LineTree } from '../src/lib/analysis/lineTree';
import { parsePgn } from '../src/lib/chess/rules';

describe('analysis line tree', () => {
  const main = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'];
  it('builds the main line and navigates it', () => {
    const t = new LineTree(undefined, main);
    const ids = t.mainlineIds();
    expect(ids).toHaveLength(6);
    expect(t.sansTo(ids.at(-1)!)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(t.next(0)).toBe(ids[1]);
    expect(t.prev(ids[2]!)).toBe(ids[1]);
    expect(t.node(ids[5]!).fen).toMatch(/^r1bqkbnr\/pppp1ppp\/2n5\/1B2p3\/4P3\/5N2/);
  });
  it('re-uses an existing move and rejects an illegal one', () => {
    const t = new LineTree(undefined, main);
    const ids = t.mainlineIds();
    expect(t.add(ids[1]!, 'e7e5')).toBe(ids[2]);
    expect(t.add(ids[2]!, 'e2e4')).toBeNull();
    expect(t.add(ids[2]!, 'zzzz')).toBeNull();
  });
  it('stores variations without disturbing the main line, and writes them as PGN', () => {
    const t = new LineTree(undefined, main);
    const ids = t.mainlineIds();
    const alt = t.add(ids[3]!, 'g8f6')!; // after 2.Nf3, Black tries 2...Nf6 instead of 2...Nc6
    expect(t.node(alt).main).toBe(false);
    const alt2 = t.add(alt, 'f3e5')!;
    expect(t.sansTo(alt2)).toEqual(['e4', 'e5', 'Nf3', 'Nf6', 'Nxe5']);
    expect(t.mainlineIds()).toHaveLength(6);
    expect(t.variationsAfter(ids[3]!)).toEqual([alt]);
    const text = t.movetext();
    expect(text).toBe('1. e4 e5 2. Nf3 Nc6 (2... Nf6 3. Nxe5) 3. Bb5');
    const pgn = t.toPgn({ White: 'a', Black: 'b' }, '*');
    expect(pgn).toMatch(/^\[Event "Kibitz analysis"\]\n\[Site "\?"\]\n\[Date "\?\?\?\?\.\?\?\.\?\?"\]\n\[Round "-"\]\n\[White "a"\]\n\[Black "b"\]\n\[Result "\*"\]/); // seven tag roster, in order
    expect(parsePgn(pgn).moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']); // chess.js keeps the main line
  });
  it('numbers black moves correctly after a variation and supports a variation on the first move', () => {
    const t = new LineTree(undefined, ['e2e4', 'e7e5', 'g1f3']);
    t.add(0, 'd2d4');
    const e5 = t.mainlineIds()[2]!;
    t.add(e5, 'f2f4');
    expect(t.movetext()).toBe('1. e4 (1. d4) 1... e5 2. Nf3 (2. f4)'); // black's move is re-numbered after a variation
  });
  it('removes variations but never the main line', () => {
    const t = new LineTree(undefined, main);
    const ids = t.mainlineIds();
    const alt = t.add(ids[3]!, 'g8f6')!;
    expect(t.remove(ids[2]!)).toBe(false);
    expect(t.remove(alt)).toBe(true);
    expect(t.variationsAfter(ids[3]!)).toEqual([]);
    expect(t.movetext()).toBe('1. e4 e5 2. Nf3 Nc6 3. Bb5');
  });
  it('starts from a set-up position and records it in the PGN', () => {
    const t = new LineTree('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', ['e2e4']);
    const pgn = t.toPgn({}, '*');
    expect(pgn).toMatch(/\[FEN "4k3\/8\/8\/8\/8\/8\/4P3\/4K3 w - - 0 1"\]/);
    expect(pgn).toMatch(/1\. e4 \*$/);
  });
});

describe('labels from a set-up position', () => {
  it('numbers moves from the FEN, including Black to move', () => {
    const t = new LineTree('8/8/8/8/8/4k3/4p3/7K b - - 0 41', ['e2e1q']);
    const first = t.mainlineIds()[1]!;
    expect(t.label(first)).toBe('41...e1=Q+');
    expect(t.movetext()).toMatch(/^41\.\.\. e1=Q\+/);
    expect(t.node(first)).toMatchObject({ color: 'b', moveNo: 41 });
  });
});
