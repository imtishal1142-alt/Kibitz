import { describe, expect, it } from 'vitest';
import { drillLine, emptyLine, endgameLine, gameEndLine, gradeLine, greeting, pick, puzzleLine, quizLine } from '../src/lib/coach/lines';
import { speakable } from '../src/services/speech';

const GRADES = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'forced', 'inaccuracy', 'miss', 'mistake', 'blunder'];

describe('coach lines', () => {
  it('pick is deterministic and never out of range', () => {
    for (let i = -5; i < 20; i++) expect(['a', 'b', 'c']).toContain(pick(['a', 'b', 'c'], i));
    expect(pick(['a', 'b', 'c'], 4)).toBe(pick(['a', 'b', 'c'], 4));
  });
  it('has a mood and text for every move grade, and passes the verified reason through unchanged', () => {
    for (const g of GRADES) {
      const l = gradeLine(g, 'Nf3 was better here.', 2);
      expect(l.text.endsWith('Nf3 was better here.')).toBe(true);
      expect(l.mood).toBeTruthy();
      expect(gradeLine(g).text.length).toBeGreaterThan(3);
    }
    expect(gradeLine('blunder').mood).toBe('surprised');
    expect(gradeLine('brilliant').mood).toBe('cheer');
    expect(gradeLine('unknown-grade').text.length).toBeGreaterThan(3);
  });
  it('greets using only the numbers it is given', () => {
    expect(greeting({ hour: 9, games: 0, analysed: 0, due: 0, streak: 0 }).text).toMatch(/Kibi/);
    expect(greeting({ hour: 9, games: 10, analysed: 4, due: 0, streak: 0 }).text).toMatch(/4 of 10/);
    expect(greeting({ hour: 15, games: 10, analysed: 10, due: 1, streak: 0 }).text).toMatch(/1 puzzle due/);
    expect(greeting({ hour: 15, games: 10, analysed: 10, due: 7, streak: 0, name: 'Sam' }).text).toMatch(/Sam.*7 puzzles/);
    expect(greeting({ hour: 20, games: 10, analysed: 10, due: 0, streak: 5 }).text).toMatch(/5 days/);
    expect(greeting({ hour: 2, games: 0, analysed: 0, due: 0, streak: 0 }).text).toMatch(/Up late/);
  });
  it('answers every situation with a non-empty line', () => {
    for (const k of ['start', 'solved', 'wrong', 'revealed', 'streak'] as const) expect(puzzleLine(k, { streak: 6 }, 1).text.length).toBeGreaterThan(5);
    for (const k of ['start', 'right', 'wrong', 'done'] as const) expect(drillLine(k, { name: 'Italian', times: 2 }, 1).text.length).toBeGreaterThan(5);
    for (const k of ['start', 'good', 'bad', 'win', 'draw', 'lost'] as const) expect(endgameLine(k, { goal: 'win' }, 1).text.length).toBeGreaterThan(5);
    expect(quizLine(true).mood).toBe('happy');
    expect(quizLine(false).mood).toBe('thinking');
    for (const o of ['win', 'loss', 'draw'] as const) expect(gameEndLine(o, 'White wins.', 3).text).toMatch(/^White wins\./);
    for (const p of ['games', 'insights', 'progress', 'puzzles', 'openings', 'session', 'zzz']) expect(emptyLine(p).text.length).toBeGreaterThan(5);
  });
});

describe('speakable', () => {
  it('reads castling and captures sensibly', () => {
    expect(speakable('O-O is safe')).toBe('castles kingside is safe');
    expect(speakable('O-O-O wins')).toBe('castles queenside wins');
    expect(speakable('Nxe5+')).toContain('takes');
    expect(speakable('Qh7#')).toContain('checkmate');
  });
});
