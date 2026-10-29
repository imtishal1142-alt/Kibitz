// Facts about how the game went for your opponent, and where the game left opening theory.
//
// Everything is read from the stored analysis. The theory comparison uses the bundled list of named openings, which
// knows which named continuations exist but not how often strong players choose them, so it never says a move is
// "rare" or "popular". Who left the list, and what the engine preferred at that moment, are the facts it can state.
import { lossClassOf, isSevere } from '../chess/classify';
import { theoryContinuations } from '../chess/openings';
import type { Color, GameAnalysis, GameRecord } from '../types';
import { timeReport } from './timeAnalysis';

const label = (ply: number, san: string) => `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '...'}${san}`;

export interface TheoryDeparture {
  /** First ply played outside the named openings. */
  ply: number;
  by: Color;
  san: string;
  /** Named continuations the list offers at that point (SAN), possibly empty. */
  listed: string[];
  engineSan: string | null;
  winLoss: number;
  text: string;
}

/** Who first left the list of named openings, and what the list and the engine had in that position. */
export function theoryDeparture(analysis: GameAnalysis, userColor?: Color): TheoryDeparture | null {
  const depth = analysis.opening?.plies ?? 0;
  const m = analysis.moves[depth];
  if (!m || depth >= 40) return null;
  const listed = theoryContinuations(analysis.moves.slice(0, depth).map((x) => x.san)).map((c) => c.san);
  const who = userColor ? (m.color === userColor ? 'You' : 'Your opponent') : m.color === 'w' ? 'White' : 'Black';
  const engineSan = m.bestSan && m.bestSan !== m.san ? m.bestSan : null;
  const bits = [`${who} left the named openings with ${label(m.ply, m.san)}.`];
  if (listed.length) bits.push(`The opening list continues with ${listed.slice(0, 5).join(', ')}${listed.length > 5 ? ' and others' : ''} here.`);
  else if (analysis.opening) bits.push('The opening list has no named continuation from this position.');
  if (engineSan) bits.push(`Stockfish preferred ${engineSan}${m.winLoss >= 2 ? ` (${m.san} cost ${m.winLoss.toFixed(0)} points)` : ' (the difference was small)'}.`);
  else bits.push(`Stockfish agreed with ${m.san}.`);
  return { ply: m.ply, by: m.color, san: m.san, listed, engineSan, winLoss: m.winLoss, text: bits.join(' ') };
}

/** Plain facts about the opponent's play in this game. Empty when there is nothing worth saying. */
export function opponentNotes(analysis: GameAnalysis, game: GameRecord | undefined, userColor: Color | undefined): string[] {
  if (!userColor) return [];
  const opp: Color = userColor === 'w' ? 'b' : 'w';
  const out: string[] = [];
  const mine = analysis.summary[userColor];
  const theirs = analysis.summary[opp];
  const name = game?.opponent ?? 'Your opponent';
  const diff = mine.accuracy - theirs.accuracy;
  out.push(`${name} played at ${theirs.accuracy.toFixed(0)}% accuracy against your ${mine.accuracy.toFixed(0)}%${Math.abs(diff) < 3 ? ': an even game' : diff > 0 ? '' : ': they outplayed you by this measure'}.`);
  const errs = analysis.moves.filter((m) => m.color === opp && isSevere(lossClassOf(m)));
  if (errs.length === 0) out.push(`${name} made no mistake or blunder at this depth, so the result was decided by your own moves.`);
  else {
    const first = errs[0]!;
    const worst = [...errs].sort((a, b) => b.winLoss - a.winLoss)[0]!;
    out.push(`${name} made ${errs.length} mistake${errs.length === 1 ? '' : 's'} or blunder${errs.length === 1 ? '' : 's'}; the biggest was ${label(worst.ply, worst.san)} (-${worst.winLoss.toFixed(0)} points).`);
    // Did you take what they offered?
    const replies = errs.map((e) => analysis.moves[e.ply]).filter((m): m is NonNullable<typeof m> => !!m && m.color === userColor && m.winBefore >= 60);
    const taken = replies.filter((m) => m.winLoss <= 3).length;
    if (replies.length) out.push(`After their errors you were clearly better ${replies.length} time${replies.length === 1 ? '' : 's'} and kept the advantage ${taken} of those.`);
    if (first.ply <= 20) out.push(`Their first mistake came early, at ${label(first.ply, first.san)}.`);
  }
  const t = timeReport(analysis, opp);
  if (t.hasClocks && t.moves.length >= 10) {
    out.push(t.low.moves > 0 ? `They had under 30 s on the clock for ${t.low.moves} move${t.low.moves === 1 ? '' : 's'}${t.low.severe ? `, ${t.low.severe} of them a mistake or blunder` : ''}.` : 'They were never short of time.');
  }
  return out;
}
