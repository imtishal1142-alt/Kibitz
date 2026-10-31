// Deterministic coaching. Every sentence is assembled from facts that were verified either by the
// engine (evaluations, principal variations) or by the rules (legal-move replay and board geometry
// in tactics.ts). Nothing here calls a language model, and where no concrete idea can be verified
// the text says so instead of guessing.
import { Chess } from 'chess.js';
import type { GameAnalysis, MoveAnalysis, MoveClass } from '../types';
import { CLASS_GLYPH, CLASS_LABEL, lossClassOf } from '../chess/classify';
import { forMover, formatScore, winPctFor } from '../chess/eval';
import { formatClock, materialCount, normalizeFen, phaseOf, uciLineToSan } from '../chess/rules';
import { settledMaterial } from './grades';
import { describeMove, pawnStructure, PIECE_NAME, VAL, whatItDoes } from './tactics';
import type { MoveFacts } from './tactics';

export type Category =
  | 'hanging-piece'
  | 'fork'
  | 'pin-skewer'
  | 'discovered-attack'
  | 'mate-threat'
  | 'back-rank'
  | 'missed-threat'
  | 'poor-exchange'
  | 'missed-tactic'
  | 'missed-win'
  | 'king-safety'
  | 'pawn-structure'
  | 'development'
  | 'endgame-technique'
  | 'positional'
  | 'calculation'
  | 'time-pressure'
  | 'sound';

export const CATEGORY_LABEL: Record<Category, string> = {
  'hanging-piece': 'Hanging pieces',
  fork: 'Forks',
  'pin-skewer': 'Pins and skewers',
  'discovered-attack': 'Discovered attacks',
  'mate-threat': 'Missed mating threats',
  'back-rank': 'Back-rank weakness',
  'missed-threat': 'Overlooked opponent threats',
  'poor-exchange': 'Poor exchanges',
  'missed-tactic': 'Missed tactics',
  'missed-win': 'Squandered advantages',
  'king-safety': 'King safety',
  'pawn-structure': 'Pawn structure',
  development: 'Development',
  'endgame-technique': 'Endgame technique',
  positional: 'Positional understanding',
  calculation: 'Calculation',
  'time-pressure': 'Time pressure',
  sound: 'Sound move',
};

export const CATEGORY_LESSON: Record<Category, string> = {
  'hanging-piece': 'Before every move, check which of your pieces are unprotected and whether the move leaves one attackable. "Loose pieces drop off."',
  fork: 'Before moving, look at where the opponent\'s knights, pawns and queen could land with a double attack. Keep your valuable pieces off squares that can be forked.',
  'pin-skewer': 'Watch rooks, bishops and queens aiming along lines at your king or queen. Unpin early, or avoid lining up a valuable piece behind a lesser one.',
  'discovered-attack': 'When a piece steps aside, the piece behind it may strike. Check what each opponent move uncovers, especially against your king and queen.',
  'mate-threat': 'Always ask "what is my opponent threatening?" and check every forcing reply (checks, captures) against your king before you commit.',
  'back-rank': 'Give your king an escape square (a "luft") or keep a rook on the back rank so a single check cannot be mate.',
  'missed-threat': 'After every opponent move, ask first: "What does that move attack or threaten?" Deal with the threat before pursuing your own plan.',
  'poor-exchange': 'Count attackers and defenders on the square before capturing, then count the recaptures to the end of the sequence.',
  'missed-tactic': 'Make a habit of scanning for checks, captures and threats for BOTH sides on every move - the winning shot often starts with a forcing move.',
  'missed-win': 'When you are clearly better, slow down: look for the safest way to convert and avoid allowing counterplay.',
  'king-safety': 'Castle early and avoid loosening the pawns in front of your king without a concrete reason.',
  'pawn-structure': 'Pawns cannot move backwards. Before pushing or capturing with a pawn, check whether it leaves doubled, isolated or backward pawns.',
  development: 'In the opening, develop knights and bishops, fight for the centre and castle before moving the same piece twice or starting an attack.',
  'endgame-technique': 'In endgames the king is a fighting piece: activate it, keep your pawns safe and calculate pawn races exactly.',
  positional: 'Prefer moves that improve your worst-placed piece and keep your structure healthy; compare candidate moves by what they leave weak.',
  calculation: 'Before a committal move, calculate the opponent\'s forcing replies to the end of the line, not just the first move.',
  'time-pressure': 'Low clock time caused or contributed to this error. Budget your time earlier and use easy moves to bank minutes.',
  sound: 'Nothing to fix here.',
};

export interface Explanation {
  moveLabel: string;
  cls: MoveClass;
  headline: string;
  paragraphs: string[];
  category: Category;
  themes: Category[];
  lesson: string;
  evidence: {
    playedSan: string;
    bestSan: string | null;
    evalBefore: string;
    evalAfter: string;
    winLoss: number;
    refutation: string[];
    bestLine: string[];
    materialPlayed: number | null;
    materialBest: number | null;
  };
  /** True when every quoted variation was replayed and found legal. */
  verified: boolean;
  /** What the move threatens to do next (found by passing the move and looking for forcing ideas), or null. */
  threat: string | null;
  /** The opponent's best reply from the engine line, with what it does. */
  reply: string | null;
}

export const moveLabel = (m: Pick<MoveAnalysis, 'ply' | 'color' | 'san'>): string => `${Math.ceil(m.ply / 2)}${m.color === 'w' ? '.' : '...'}${m.san}`;

const POINTS: Record<number, string> = { 1: 'a pawn', 2: 'two pawns', 3: 'a minor piece', 4: 'a minor piece and a pawn', 5: 'a rook', 6: 'a rook and a pawn', 9: 'a queen' };
export const pointsText = (n: number): string => POINTS[Math.abs(Math.round(n))] ?? `${Math.abs(Math.round(n))} points of material`;

/** Net material change for `color` along a UCI line from `fen` (stops once the exchanges settle). */
export function netMaterial(fen: string, ucis: string[], color: 'w' | 'b', maxPlies = 6): number | null {
  try {
    const chess = new Chess(normalizeFen(fen));
    const bal = (f: string) => {
      const m = materialCount(f);
      return color === 'w' ? m.diff : -m.diff;
    };
    const start = bal(chess.fen());
    let used = 0;
    for (const u of ucis.slice(0, maxPlies)) {
      const mv = chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u.slice(4, 5) : undefined });
      used++;
      if (used >= 2 && !mv.captured && !mv.promotion) break;
    }
    return bal(chess.fen()) - start;
  } catch {
    return null;
  }
}

function castlingRights(fen: string, color: 'w' | 'b'): boolean {
  const r = fen.split(' ')[2] ?? '-';
  return color === 'w' ? /[KQ]/.test(r) : /[kq]/.test(r);
}

function undevelopedMinors(fen: string, color: 'w' | 'b'): number {
  const rows = (fen.split(' ')[0] ?? '').split('/');
  const row = color === 'w' ? rows[7] : rows[0];
  if (!row) return 0;
  let n = 0;
  for (const c of row) if (c.toLowerCase() === 'n' || c.toLowerCase() === 'b') if ((color === 'w') === (c === c.toUpperCase())) n++;
  return n;
}

const nm = (p: keyof typeof PIECE_NAME): string => PIECE_NAME[p];

const RANK_WORD = { mate: 'checkmate', fork: 'a fork', win: 'winning material', pin: 'a pin', skewer: 'a skewer', disc: 'a discovered attack' } as const;

/** What the side that just moved threatens to do next, found by handing the move back to it (a "null move"). */
export function threatAfter(fenAfter: string, mover: 'w' | 'b'): string | null {
  let chess: Chess;
  try {
    chess = new Chess(normalizeFen(fenAfter));
  } catch {
    return null;
  }
  if (chess.turn() === mover || chess.inCheck()) return null;
  const parts = normalizeFen(fenAfter).split(' ');
  parts[1] = mover;
  parts[3] = '-';
  let swapped: Chess;
  try {
    swapped = new Chess(parts.join(' '));
  } catch {
    return null;
  }
  let best: { score: number; kind: keyof typeof RANK_WORD; facts: MoveFacts } | null = null;
  for (const mv of swapped.moves({ verbose: true })) {
    const facts = describeMove(swapped.fen(), mv.from + mv.to + (mv.promotion ?? ''));
    if (!facts) continue;
    let score = 0;
    let kind: keyof typeof RANK_WORD = 'win';
    if (facts.mate) { score = 100; kind = 'mate'; }
    else if (facts.fork) { score = 8; kind = 'fork'; }
    else if (facts.capture && (!facts.capture.defended || facts.capture.gain >= 3) && !facts.movedPieceUnsafe) { score = 4 + facts.capture.gain; kind = 'win'; }
    else if (facts.skewers.some((k) => VAL[k.front.piece] > VAL[k.behind.piece] && VAL[k.behind.piece] >= 3)) { score = 5; kind = 'skewer'; }
    else if (facts.pins.some((k) => k.pinned.piece !== 'p' && VAL[k.behind.piece] > VAL[k.pinned.piece])) { score = 4; kind = 'pin'; }
    else if (facts.discovered.length) { score = 4; kind = 'disc'; }
    if (score > (best?.score ?? 0)) best = { score, kind, facts };
  }
  if (!best || best.score < 4) return null;
  const doing = whatItDoes(best.facts).slice(0, 2).join(', and ');
  return `It threatens ${best.facts.san} next, which ${doing || RANK_WORD[best.kind]}.`;
}

export function explainMove(m: MoveAnalysis, a: GameAnalysis): Explanation {
  const base = explainMoveCore(m, a);
  if (m.cls === 'forced') return { ...base, threat: null, reply: null };
  let threat: string | null = null;
  let reply: string | null = null;
  try {
    threat = threatAfter(m.fenAfter, m.color);
    const pv = a.positions[m.ply]?.lines[0]?.pv ?? [];
    const chk = uciLineToSan(m.fenAfter, pv, 3);
    if (chk.valid && chk.sans.length) {
      const facts = describeMove(m.fenAfter, pv[0]!);
      const does = facts ? whatItDoes(facts).slice(0, 2) : [];
      reply = `${m.color === 'w' ? 'Black' : 'White'}'s best reply is ${chk.sans[0]}${does.length ? `, which ${does.join(', and ')}` : ''}.`;
    }
  } catch {
    /* the extra notes are optional */
  }
  return { ...base, threat, reply };
}

function explainMoveCore(m: MoveAnalysis, a: GameAnalysis): Omit<Explanation, 'threat' | 'reply'> {
  const label = moveLabel(m);
  const evBefore = formatScore(forMover(m.evalBefore, m.color));
  const evAfter = formatScore(forMover(m.evalAfter, m.color));
  const playedFacts = describeMove(m.fenBefore, m.uci);
  const bestFacts = m.bestUci ? describeMove(m.fenBefore, m.bestUci) : null;
  const doText = playedFacts ? whatItDoes(playedFacts) : [];

  const evidenceBase = { playedSan: m.san, bestSan: m.bestSan, evalBefore: evBefore, evalAfter: evAfter, winLoss: m.winLoss };

  if (m.cls === 'forced') {
    return {
      moveLabel: label,
      cls: m.cls,
      headline: `${label} was the only legal move`,
      paragraphs: ['There was nothing to choose between here, so no judgement is made.'],
      category: 'sound',
      themes: ['sound'],
      lesson: CATEGORY_LESSON.sound,
      evidence: { ...evidenceBase, refutation: [], bestLine: [], materialPlayed: null, materialBest: null },
      verified: true,
    };
  }

  const bestLineCheck = m.bestUci ? uciLineToSan(m.fenBefore, a.positions[m.ply - 1]?.lines[0]?.pv ?? [], 8) : null;
  const refPv = a.positions[m.ply]?.lines[0]?.pv ?? [];
  const refCheck = uciLineToSan(m.fenAfter, refPv, 8);
  const verified = (bestLineCheck?.valid ?? true) && refCheck.valid;

  const lc = lossClassOf(m);
  if (lc === 'best' || lc === 'excellent' || lc === 'good') {
    const paragraphs: string[] = [];
    if (doText.length) paragraphs.push(`This move ${doText.join(', and ')}.`);
    let headline: string;
    if (m.cls === 'brilliant') {
      const mat = settledMaterial(m.fenBefore, [m.uci, ...(a.positions[m.ply]?.lines[0]?.pv ?? [])], m.color);
      headline = `${label} is brilliant`;
      paragraphs.push(`It gives up ${mat !== null ? pointsText(mat) : 'material'} on purpose, and the engine still rates the position ${evAfter} for you afterwards (${evBefore} before). A sacrifice that works is the hardest kind of move to find.`);
    } else if (m.cls === 'great') {
      headline = `${label} is a great move`;
      const second = m.secondSan && m.secondScore ? `The next best move, ${m.secondSan}, was ${(m.winBefore - winPctFor(m.secondScore, m.color)).toFixed(0)} win-chance points worse.` : 'Every other move was clearly worse.';
      paragraphs.push(`It was the only move that kept the position. ${second}`);
    } else if (m.cls === 'book') {
      headline = `${label} is a book move`;
      paragraphs.push(a.opening ? `It is part of the opening theory in the bundled list (${a.opening.name}, ${a.opening.eco}), and the engine agrees with it.` : 'It is part of the opening theory in the bundled list, and the engine agrees with it.');
    } else if (m.cls === 'best') {
      headline = `${label} is the engine's top choice`;
      paragraphs.push(`It is the engine's first choice (evaluation ${evBefore} for you).`);
    } else {
      headline = `${label} is a ${CLASS_LABEL[m.cls].toLowerCase()} move`;
      if (m.bestSan) paragraphs.push(`The engine slightly prefers ${m.bestSan} (${formatScore(forMover(m.evalBefore, m.color))}), but ${m.san} gives up only ${m.winLoss.toFixed(1)} win-percentage points.`);
    }
    if (m.cls !== 'best' && m.cls !== 'excellent' && m.cls !== 'good' && m.bestSan && m.bestUci !== m.uci) paragraphs.push(`The engine's very first choice was ${m.bestSan}; ${m.san} gives up only ${m.winLoss.toFixed(1)} points.`);
    if (m.playedRank && m.playedRank > 1) paragraphs.push(`It was the engine's number ${m.playedRank} candidate.`);
    return {
      moveLabel: label,
      cls: m.cls,
      headline,
      paragraphs,
      category: 'sound',
      themes: ['sound'],
      lesson: CATEGORY_LESSON.sound,
      evidence: { ...evidenceBase, refutation: [], bestLine: bestLineCheck?.sans ?? [], materialPlayed: null, materialBest: null },
      verified,
    };
  }

  // ---- Inaccuracy, mistake or blunder: find out WHY. ----
  const reply: MoveFacts | null = refPv[0] ? describeMove(m.fenAfter, refPv[0]) : null;
  const matPlayed = netMaterial(m.fenBefore, [m.uci, ...refPv], m.color);
  const matBest = m.bestUci ? netMaterial(m.fenBefore, a.positions[m.ply - 1]?.lines[0]?.pv ?? [], m.color) : null;
  const lostMaterial = matPlayed !== null && matPlayed <= -2 && (matBest === null || matBest - matPlayed >= 2);
  const mAfter = forMover(m.evalAfter, m.color);
  const mateAgainst = mAfter.kind === 'mate' && mAfter.mate < 0;
  const themes = new Set<Category>();
  let category: Category;
  const why: string[] = [];
  const phase = phaseOf(m.fenBefore);

  if (mateAgainst && reply) {
    const lastFacts = refCheck.valid && refCheck.ucis.length ? describeMove(refCheck.fens[refCheck.fens.length - 2] ?? m.fenAfter, refCheck.ucis[refCheck.ucis.length - 1]!) : null;
    category = lastFacts?.backRankMate ? 'back-rank' : 'mate-threat';
    themes.add(category);
    why.push(
      `After ${m.san}, ${m.color === 'w' ? 'Black' : 'White'} has a forced checkmate in ${Math.abs(mAfter.mate)}: ${refCheck.sans.join(' ')}${refCheck.valid ? '' : ' ...'}.`,
    );
    if (lastFacts?.backRankMate) why.push('The mate works because the king has no escape square on the back rank.');
  } else if (m.flags.includes('missed-mate') || bestFacts?.mate) {
    // A forced checkmate was available: that is the lesson, even if the move played also lost material.
    category = 'missed-tactic';
    themes.add('missed-tactic');
    if (bestFacts) {
      const d = whatItDoes(bestFacts);
      why.push(`${m.bestSan} was available and ${d.length ? d.join(', and ') : 'forces checkmate'}.`);
    }
    why.push(`There was a forced checkmate (${evBefore}); ${m.san} gives it up (${evAfter}).`);
    if (reply?.capture && lostMaterial) {
      const stillHanging = playedFacts?.hangingBefore.some((h) => h.square === reply.capture!.square);
      why.push(`On top of that, ${reply.san} wins your ${nm(reply.capture.piece)} on ${reply.capture.square}${stillHanging ? ', which was already under attack' : ''}.`);
      themes.add(stillHanging ? 'missed-threat' : 'hanging-piece');
    }
  } else if (lostMaterial && reply) {
    const cap = reply.capture;
    const hung = cap && playedFacts?.newlyHanging.find((h) => h.square === cap.square);
    const movedPieceTaken = cap && cap.square === m.uci.slice(2, 4);
    const alreadyAttacked = cap && !movedPieceTaken && playedFacts?.hangingBefore.some((h) => h.square === cap.square);
    if (cap && alreadyAttacked && !hung) {
      category = 'missed-threat';
      why.push(`Your ${nm(cap.piece)} on ${cap.square} was already under attack, and ${m.san} does nothing about it, so ${reply.san} takes it.`);
    } else if (cap && (hung || movedPieceTaken) && !cap.defended) {
      category = 'hanging-piece';
      why.push(`${m.san} leaves the ${nm(cap.piece)} on ${cap.square} without protection, so ${reply.san} simply wins it.`);
    } else if (reply.fork) {
      category = 'fork';
      why.push(`${m.san} allows ${reply.san}, a fork of the ${reply.fork.map((f) => `${nm(f.piece)} on ${f.square}`).join(' and the ')}. You cannot save both.`);
    } else if (reply.pins.length || reply.skewers.length) {
      category = 'pin-skewer';
      const p = reply.pins[0];
      const s = reply.skewers[0];
      why.push(
        p
          ? `${m.san} allows ${reply.san}, pinning the ${nm(p.pinned.piece)} on ${p.pinned.square} to the ${nm(p.behind.piece)} on ${p.behind.square}.`
          : `${m.san} allows ${reply.san}, a skewer: the ${nm(s!.front.piece)} on ${s!.front.square} must move and the ${nm(s!.behind.piece)} on ${s!.behind.square} falls.`,
      );
    } else if (reply.discovered.length) {
      category = 'discovered-attack';
      const d = reply.discovered[0]!;
      why.push(`${m.san} allows ${reply.san}, which uncovers an attack on the ${nm(d.piece)} on ${d.target}.`);
    } else if (playedFacts?.capture) {
      category = 'poor-exchange';
      why.push(`The capture ${m.san} starts an exchange that loses material: after ${refCheck.sans.slice(0, 4).join(' ')} you come out behind.`);
    } else {
      category = 'calculation';
      why.push(`A forcing sequence refutes ${m.san}: ${refCheck.sans.slice(0, 5).join(' ')}. The engine confirms it wins material, but no single simple motif (fork, pin, loose piece) explains it - this is a calculation error.`);
    }
    themes.add(category);
    if (matPlayed !== null) why.push(`At the end of the engine's line you are ${pointsText(matPlayed)} down in material.`);
  } else if (m.flags.includes('missed-mate') || m.flags.includes('missed-win') || (bestFacts && (bestFacts.mate || bestFacts.fork || bestFacts.pins.length || bestFacts.skewers.length || (bestFacts.capture && !bestFacts.capture.defended && bestFacts.capture.gain >= 3)))) {
    category = m.flags.includes('missed-mate') || (bestFacts && (bestFacts.mate || bestFacts.fork || bestFacts.pins.length || bestFacts.skewers.length || bestFacts.capture)) ? 'missed-tactic' : 'missed-win';
    themes.add(category);
    if (m.flags.includes('missed-win')) themes.add('missed-win');
    if (bestFacts) {
      const d = whatItDoes(bestFacts);
      if (d.length) why.push(`${m.bestSan} was available and ${d.join(', and ')}.`);
    }
    if (m.flags.includes('missed-mate')) why.push('There was a forced checkmate, and the move played gives it up.');
    else if (m.flags.includes('missed-win')) why.push(`You were clearly winning (${evBefore}); ${m.san} lets the advantage slip (${evAfter}).`);
  } else {
    const ps0 = pawnStructure(m.fenBefore, m.color);
    const ps1 = pawnStructure(m.fenAfter, m.color);
    const kingMoved = playedFacts?.piece === 'k' && !playedFacts.castle && phase !== 'endgame' && castlingRights(m.fenBefore, m.color);
    const shieldPawn = playedFacts?.piece === 'p' && ['f', 'g', 'h'].includes(m.uci[0]!) && /^[fgh]/.test(m.uci[0]!) && phase !== 'endgame';
    if (kingMoved) {
      category = 'king-safety';
      why.push(`${m.san} moves the king and gives up the right to castle, which leaves it less safe than the engine's ${m.bestSan ?? 'alternative'}.`);
    } else if (shieldPawn && ps1.isolated >= ps0.isolated && (new Chess(normalizeFen(m.fenBefore)).get(m.color === 'w' ? 'g1' : 'g8')?.type === 'k' || new Chess(normalizeFen(m.fenBefore)).get(m.color === 'w' ? 'h1' : 'h8')?.type === 'k')) {
      category = 'king-safety';
      why.push(`${m.san} pushes a pawn in front of your castled king, creating holes the opponent can use.`);
    } else if (ps1.doubled > ps0.doubled || ps1.isolated > ps0.isolated) {
      category = 'pawn-structure';
      why.push(`${m.san} damages your pawn structure (${ps1.doubled > ps0.doubled ? 'doubled' : 'isolated'} pawns), a lasting weakness.`);
    } else if (phase === 'opening' && undevelopedMinors(m.fenAfter, m.color) >= 2 && !playedFacts?.develops) {
      category = 'development';
      why.push(`${m.san} does not help your development: ${undevelopedMinors(m.fenAfter, m.color)} minor pieces are still on their starting squares.`);
    } else if (phase === 'endgame') {
      category = 'endgame-technique';
      why.push(`In this endgame the engine prefers ${m.bestSan ?? 'another move'}: there is no immediate tactic, so the difference is about king activity, pawn timing or piece placement.`);
    } else {
      category = 'positional';
      why.push(`I could not verify a concrete tactic behind this evaluation drop. The engine simply rates ${m.bestSan ?? 'its choice'} higher, which usually means a positional difference (piece activity, structure or timing).`);
    }
    themes.add(category);
  }

  // Time pressure context (only when clock data exists).
  if (m.clockMs !== undefined && m.clockMs < 30_000) {
    themes.add('time-pressure');
    why.push(`You had only ${formatClock(m.clockMs)} left on the clock, so time pressure likely played a part.`);
    if (category === 'positional' || category === 'calculation') category = 'time-pressure';
  }

  const paragraphs: string[] = [];
  if (m.cls === 'miss') paragraphs.push(`Your opponent's previous move was a mistake and left you at ${m.winBefore.toFixed(0)}% winning chances. ${label} did not take advantage of it.`);
  paragraphs.push(`${label} is ${m.cls === 'miss' ? 'a miss' : `a ${CLASS_LABEL[m.cls].toLowerCase()}`}: your evaluation drops from ${evBefore} to ${evAfter} (${m.winLoss.toFixed(0)} points of win chance).${doText.length ? ` The move ${doText.join(', and ')}, but that is not enough.` : ''}`);
  paragraphs.push(...why);
  if (m.bestSan) {
    const bd = bestFacts ? whatItDoes(bestFacts) : [];
    const line = bestLineCheck?.valid ? bestLineCheck.sans.slice(0, 6).join(' ') : m.bestSan;
    paragraphs.push(`Better was ${m.bestSan}${bd.length ? ` - it ${bd.join(', and ')}` : ''}. Engine line: ${line}.`);
  }
  paragraphs.push(`Lesson: ${CATEGORY_LESSON[category]}`);

  return {
    moveLabel: label,
    cls: m.cls,
    headline: `${label}${CLASS_GLYPH[m.cls]} - ${CATEGORY_LABEL[category].toLowerCase()}`,
    paragraphs,
    category,
    themes: [...themes],
    lesson: CATEGORY_LESSON[category],
    evidence: { ...evidenceBase, refutation: refCheck.sans, bestLine: bestLineCheck?.sans ?? [], materialPlayed: matPlayed, materialBest: matBest },
    verified,
  };
}
