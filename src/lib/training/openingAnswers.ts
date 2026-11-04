// "What do I play against...?" Answers to the most common first moves and second moves, and a plan for each rating
// range. The suggestions are common coaching guidance (what experienced players and coaches usually recommend), not
// statistics from this app. Every line is replayed for legality in tests/openinglib.test.ts.
import type { Color } from '../types';
import type { Band } from './openingMeta';

export interface Reply {
  name: string;
  /** Complete line from the first move, ending with the reply and a natural follow-up. */
  line: string[];
  why: string;
  /** Library opening this leads to, if any. */
  opening?: string;
  /** Rating ranges where it is a good practical choice. */
  bands: Band[];
}

export interface Answer {
  id: string;
  /** Plain description of the position, e.g. "White plays 1.e4". */
  when: string;
  /** The side that is choosing. */
  chooser: Color;
  replies: Reply[];
}

const r = (name: string, line: string, why: string, bands: string, opening?: string): Reply => ({
  name, line: line.split(' '), why, opening,
  bands: bands.split('').map((x) => ({ b: 'beginner', c: 'club', a: 'advanced', e: 'expert' }[x] as Band)),
});

export const ANSWERS: Answer[] = [
  { id: 'e4', when: 'White plays 1.e4', chooser: 'b', replies: [
    r('1...e5: the open game', 'e4 e5 Nf3 Nc6', 'The most natural reply: fight for the centre, develop, castle. You learn classical chess and every piece gets active.', 'bcae'),
    r('1...c5: the Sicilian', 'e4 c5 Nf3 d6', 'The most ambitious reply: you play for a win and unbalance the game. Heavy theory, so it pays off later.', 'cae', 'sicilian'),
    r('1...e6: the French', 'e4 e6 d4 d5', 'A solid structure with a clear plan: attack the white centre with ...c5. A bit cramped but safe.', 'bca', 'french'),
    r('1...c6: the Caro-Kann', 'e4 c6 d4 d5', 'The soundest reply: no weaknesses, the bishop comes out before the pawn chain, and you reach good endgames.', 'bcae', 'caro-kann'),
    r('1...d5: the Scandinavian', 'e4 d5 exd5 Qxd5', 'The queen comes out early, but the structure is simple and there is little theory. Good for beginners and club players.', 'bc', 'scandinavian'),
    r('1...d6: the Pirc / Philidor family', 'e4 d6 d4 Nf6', 'Let White take the centre, then attack it. Flexible but you must know how to counter.', 'bca', 'pirc'),
    r('1...Nf6: the Alekhine', 'e4 Nf6 e5 Nd5', 'Provoke White pawn moves and attack the centre later. Unusual, so many opponents are unprepared.', 'ca', 'alekhine'),
  ] },
  { id: 'd4', when: 'White plays 1.d4', chooser: 'b', replies: [
    r('1...d5: the Queen\'s Gambit family', 'd4 d5 c4 e6', 'The classical reply: take the centre and keep a sound structure (QGD, Slav, Semi-Slav).', 'bcae', 'qgd'),
    r('1...Nf6: the Indian defences', 'd4 Nf6 c4 e6', 'Flexible: transposes to the Nimzo, Queen\'s Indian or Queen\'s Gambit, with no commitment yet.', 'cae', 'nimzo'),
    r('1...f5: the Dutch', 'd4 f5 g3 Nf6', 'Play for a win with an attack on the kingside; the structure weakens the king a bit.', 'ca', 'dutch'),
    r('1...c5: the Benoni family', 'd4 c5 d5 e6', 'Unbalanced and dynamic. Requires knowledge of pawn structures.', 'ae', 'benoni'),
    r('1...e6: the flexible start', 'd4 e6 c4 Nf6', 'You keep every option open and can choose between the QGD, Nimzo or Queen\'s Indian later.', 'ca', 'qgd'),
  ] },
  { id: 'c4', when: 'White plays 1.c4 (the English)', chooser: 'b', replies: [
    r('1...e5: the Reversed Sicilian', 'c4 e5 Nc3 Nf6', 'Take the centre at once and play a classical game with colours reversed.', 'bcae', 'english-reversed'),
    r('1...c5: the symmetrical English', 'c4 c5 Nf3 Nf6', 'Mirror White and keep the position balanced; subtle and strategic.', 'ca', 'english-symmetrical'),
    r('1...Nf6: the flexible reply', 'c4 Nf6 Nc3 e6', 'Keep options open; it can transpose to a Queen\'s Gambit or Indian setup.', 'ca'),
  ] },
  { id: 'nf3', when: 'White plays 1.Nf3', chooser: 'b', replies: [
    r('1...d5: take the centre', 'Nf3 d5 g3 Nf6', 'Occupy the centre and develop; the game usually transposes to a Reti or King\'s Indian Attack.', 'bcae', 'reti'),
    r('1...Nf6: stay flexible', 'Nf3 Nf6 c4 g6', 'Keep options open and aim for a King\'s Indian or a Grünfeld setup.', 'ca'),
    r('1...c5: the English-Sicilian', 'Nf3 c5 c4 Nc6', 'Go for an active, asymmetrical game.', 'cae'),
  ] },
  { id: 'e4e5nf3', when: 'After 1.e4 e5 2.Nf3 (White attacks e5)', chooser: 'b', replies: [
    r('2...Nc6: defend naturally', 'e4 e5 Nf3 Nc6 Bb5 a6', 'The main move: it defends the pawn and develops. You face the Ruy Lopez, Italian or Scotch.', 'bcae', 'ruy-lopez'),
    r('2...Nf6: the Petrov', 'e4 e5 Nf3 Nf6 Nxe5 d6', 'Counterattack at once. Very solid and drawish; good against 1.e4 players who like to attack.', 'cae', 'petrov'),
    r('2...d6: the Philidor', 'e4 e5 Nf3 d6 d4 Nf6', 'A compact structure that is easy to learn but a bit passive.', 'bc', 'philidor'),
  ] },
  { id: 'italian', when: 'After 1.e4 e5 2.Nf3 Nc6 3.Bc4 (the Italian)', chooser: 'b', replies: [
    r('3...Bc5: the Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6', 'Mirror White and develop; aim for ...d5. The classic reply.', 'bcae', 'italian'),
    r('3...Nf6: the Two Knights', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5', 'Counterattack. Know the 4.Ng5 lines, then you get a lively game.', 'ca', 'two-knights'),
    r('3...Be7: the Hungarian', 'e4 e5 Nf3 Nc6 Bc4 Be7 d4 exd4', 'A solid but passive setup that avoids sharp lines.', 'bc'),
  ] },
  { id: 'ruy', when: 'After 1.e4 e5 2.Nf3 Nc6 3.Bb5 (the Ruy Lopez)', chooser: 'b', replies: [
    r('3...a6: the Morphy Defence', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6', 'Ask the bishop what it wants. The main road to the Closed and Open Spanish.', 'bcae', 'ruy-lopez'),
    r('3...Nf6: the Berlin', 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6', 'Very solid and hard to beat; you reach a sound endgame.', 'cae', 'berlin'),
    r('3...f5: the Schliemann', 'e4 e5 Nf3 Nc6 Bb5 f5 Nc3 fxe4 Nxe4 d5', 'A sharp gambit that tries to surprise White.', 'ca'),
    r('3...Nge7: the Cozio', 'e4 e5 Nf3 Nc6 Bb5 Nge7 c3 g6', 'A flexible setup that avoids the main lines.', 'bc'),
  ] },
  { id: 'kg', when: 'After 1.e4 e5 2.f4 (the King\'s Gambit)', chooser: 'b', replies: [
    r('2...exf4: accept the gambit', 'e4 e5 f4 exf4 Nf3 g5', 'Take the pawn and try to keep it. You must know your lines.', 'cae', 'kings-gambit'),
    r('2...Bc5: decline', 'e4 e5 f4 Bc5 Nf3 d6', 'Refuse the pawn and develop; White loses time with the weak king.', 'bca', 'kings-gambit'),
    r('2...d5: the Falkbeer', 'e4 e5 f4 d5 exd5 e4', 'Counterattack in the centre. A well-regarded safe reply.', 'ca', 'kings-gambit'),
  ] },
  { id: 'sicilian-open', when: 'After 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 (the Open Sicilian)', chooser: 'b', replies: [
    r('5...a6: the Najdorf', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', 'The most ambitious choice. Huge theory, but one of the best ways to play for a win.', 'ae', 'najdorf'),
    r('5...g6: the Dragon', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6', 'A fianchettoed bishop and a sharp race. Know the Yugoslav Attack.', 'ae', 'dragon'),
    r('5...Nc6: the Classical', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6', 'The natural setup, flexible and sound.', 'cae', 'sicilian-classical'),
    r('5...e6: the Scheveningen', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6', 'A compact, solid pawn structure that gives a lasting game.', 'cae', 'scheveningen'),
  ] },
  { id: 'antisic', when: 'After 1.e4 c5 and White avoids the main lines', chooser: 'b', replies: [
    r('Against 2.c3 (the Alapin): ...Nf6', 'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4', 'Hit the centre at once. ...d5 is also good and simple.', 'bcae', 'alapin'),
    r('Against 2.Nc3: ...Nc6 then ...g6', 'e4 c5 Nc3 Nc6 g3 g6', 'Mirror the fianchetto and aim for ...d6 and ...Nf6.', 'bca', 'closed-sicilian'),
    r('Against the Rossolimo (3.Bb5): ...g6', 'e4 c5 Nf3 Nc6 Bb5 g6 Bxc6 dxc6', 'Accept the doubled pawns: you get the bishop pair and open lines.', 'bca', 'rossolimo'),
    r('Against the Smith-Morra: accept and play ...d6, ...Nf6, ...e6', 'e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6', 'Take the pawn, return it at the right moment, and trade pieces.', 'bca', 'smith-morra'),
  ] },
  { id: 'qg', when: 'After 1.d4 d5 2.c4 (the Queen\'s Gambit)', chooser: 'b', replies: [
    r('2...e6: the Queen\'s Gambit Declined', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7', 'Solid and classical: you reach a sound structure and learn the typical plans.', 'bcae', 'qgd'),
    r('2...c6: the Slav', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4', 'Solid and active: the bishop can come out to f5 or g4 before ...e6.', 'bcae', 'slav'),
    r('2...dxc4: the Accepted', 'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6', 'Take the pawn and give it back for easy development.', 'bca', 'qga'),
    r('2...e5: the Albin Countergambit', 'd4 d5 c4 e5 dxe5 d4 Nf3 Nc6', 'A surprise gambit that can trap unprepared players.', 'bc'),
  ] },
  { id: 'indian', when: 'After 1.d4 Nf6 2.c4', chooser: 'b', replies: [
    r('2...e6: Nimzo or Queen\'s Indian', 'd4 Nf6 c4 e6 Nc3 Bb4', 'Flexible and sound. The Nimzo pins the knight and fights for e4.', 'cae', 'nimzo'),
    r('2...g6: King\'s Indian or Grünfeld', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6', 'Let White take the centre, then attack it. Rich in tactics.', 'cae', 'kid'),
    r('2...c5: Benoni or Benko', 'd4 Nf6 c4 c5 d5 b5', 'Sharp and unbalanced.', 'ae', 'benko'),
  ] },
  { id: 'london', when: 'After 1.d4 d5 2.Bf4 (the London)', chooser: 'b', replies: [
    r('2...c5: strike at the centre', 'd4 d5 Bf4 c5 e3 Nc6', 'The best practical answer: hit d4 before White finishes development.', 'bcae', 'london'),
    r('2...Nf6 3.e3 then ...c5', 'd4 d5 Bf4 Nf6 e3 c5 c3 Nc6', 'Same idea: always aim for ...c5.', 'bcae', 'london'),
    r('2...Bf5: mirror the bishop', 'd4 d5 Bf4 Bf5 e3 e6', 'Solid and symmetrical.', 'bc', 'london'),
  ] },
  { id: 'tromp', when: 'After 1.d4 Nf6 2.Bg5 (the Trompowsky)', chooser: 'b', replies: [
    r('2...Ne4: hit the bishop', 'd4 Nf6 Bg5 Ne4 Bf4 c5 f3 Qa5+', 'Ask the bishop to move again and play for ...c5 and ...Qb6.', 'bca', 'trompowsky'),
    r('2...d5: stay solid', 'd4 Nf6 Bg5 d5 Bxf6 exf6 e3 Bd6', 'Accept doubled pawns for the bishop pair and an open e-file.', 'bc', 'trompowsky'),
  ] },
  { id: 'white-first', when: 'Choosing your first move as White', chooser: 'w', replies: [
    r('1.e4: open, direct chess', 'e4 e5 Nf3 Nc6', 'The classical choice: quick development, tactics, and a clear plan. Best for learning.', 'bcae', 'italian'),
    r('1.d4: strategic and solid', 'd4 d5 c4 e6', 'More positional; pawn structure matters. Can transpose to a London or Queen\'s Gambit.', 'bcae', 'london'),
    r('1.c4 or 1.Nf3: flexible', 'c4 e5 Nc3 Nf6', 'Keeps options open and needs less theory; hard for opponents to prepare against.', 'cae', 'english'),
  ] },
  { id: 'vs-french', when: 'White against the French (1.e4 e6 2.d4 d5)', chooser: 'w', replies: [
    r('3.Nc3: the main line', 'e4 e6 d4 d5 Nc3 Bb4', 'Develop the knight and fight for e4; the Winawer is the sharpest reply.', 'cae', 'winawer'),
    r('3.Nd2: the Tarrasch', 'e4 e6 d4 d5 Nd2 Nf6', 'Avoids the pin and keeps the structure healthy; a safe option.', 'bcae', 'tarrasch-french'),
    r('3.e5: the Advance', 'e4 e6 d4 d5 e5 c5 c3 Nc6', 'Gain space and aim for a kingside attack; a clear plan.', 'bca', 'french-advance'),
  ] },
  { id: 'vs-caro', when: 'White against the Caro-Kann (1.e4 c6 2.d4 d5)', chooser: 'w', replies: [
    r('3.Nc3: the main line', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5', 'Develop and take the pawn back; leads to the Classical.', 'cae', 'caro-classical'),
    r('3.e5: the Advance', 'e4 c6 d4 d5 e5 Bf5 Nf3 e6', 'Space and a clear structure.', 'bca', 'caro-advance'),
    r('3.exd5: the Exchange or Panov', 'e4 c6 d4 d5 exd5 cxd5 c4 Nf6', 'Open the position; the Panov gives an active game.', 'bca', 'panov'),
  ] },
];

/** Practical plan for each rating range. */
export interface BandPlan {
  band: Band;
  advice: string;
  white: string[];
  vsE4: string[];
  vsD4: string[];
}
export const BAND_PLANS: BandPlan[] = [
  { band: 'beginner', advice: 'Pick openings with simple ideas and little theory: develop pieces, castle, fight for the centre. Do not memorise long lines; learn why the moves are played. Pick one opening for White and one reply to 1.e4 and 1.d4, and stick to them for months.', white: ['italian', 'london', 'scotch', 'vienna'], vsE4: ['caro-kann', 'scandinavian', 'two-knights'], vsD4: ['qgd', 'slav', 'stonewall'] },
  { band: 'club', advice: 'You can now handle a bit more theory. Start to learn the typical pawn structures and plans of your openings. Keep your repertoire small but know the first 8 to 10 moves and the main traps.', white: ['italian', 'giuoco-pianissimo', 'london', 'scotch', 'english', 'ruy-exchange'], vsE4: ['caro-kann', 'french', 'petrov', 'sicilian-classical', 'two-knights'], vsD4: ['slav', 'qgd', 'kid', 'dutch'] },
  { band: 'advanced', advice: 'Now preparation matters. Choose an opening that suits your style and learn its middlegame plans, not just the moves. Prepare against the most common replies and know a safe alternative.', white: ['ruy-lopez', 'english', 'catalan', 'reti', 'scotch'], vsE4: ['najdorf', 'sveshnikov', 'berlin', 'caro-kann', 'taimanov'], vsD4: ['nimzo', 'queens-indian', 'grunfeld', 'semi-slav', 'kid'] },
  { band: 'expert', advice: 'Opening theory is deep. Build a repertoire that you understand structurally, keep it updated with an engine, and prepare specific lines for important opponents. Keep a sideline in reserve.', white: ['ruy-closed', 'catalan', 'english', 'ruy-lopez', 'grunfeld-exchange'], vsE4: ['najdorf', 'berlin', 'sveshnikov', 'caro-classical', 'petrov'], vsD4: ['grunfeld', 'nimzo', 'semi-slav', 'qgd', 'benoni'] },
];
