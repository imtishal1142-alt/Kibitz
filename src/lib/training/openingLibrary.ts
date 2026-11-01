// Opening library: a hand-written set of the main openings with the idea behind each, the plans for both sides,
// the usual mistakes, and a few classic traps. Every move line is replayed for legality in tests/openinglib.test.ts,
// every trap that claims a checkmate is checked to end in checkmate, and every trap that claims to win material is
// checked against the engine. The prose is general chess knowledge, not engine output.
import type { Color } from '../types';

export interface Trap {
  id: string;
  name: string;
  /** Who springs it. */
  by: Color;
  /** The line, ending at the moment the trap has worked. */
  line: string[];
  /** What the learner should notice. */
  lesson: string;
  /** 'mate' = the line ends in checkmate; 'material' = the side that springs it wins material (engine-checked). */
  claim: 'mate' | 'material';
}

export interface OpeningLesson {
  id: string;
  name: string;
  eco: string;
  /** The side most people play this opening as. */
  side: Color;
  line: string[];
  /** Beginner-friendly one-liner. */
  gist: string;
  idea: string;
  plans: { you: string[]; opponent: string[] };
  mistakes: string[];
  traps: Trap[];
}

export const OPENING_LIBRARY: OpeningLesson[] = [
  {
    id: 'italian',
    name: 'Italian Game',
    eco: 'C50-C54',
    side: 'w',
    line: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'],
    gist: 'Develop fast and aim at f7.',
    idea: 'The bishop on c4 eyes the weak f7 square while the knight and pawn fight for the centre. White wants a pawn on d4 supported by c3, castling early, and open lines for the pieces.',
    plans: {
      you: ['Play c3 and d4 to build a big centre.', 'Castle kingside by move 6 or 7.', 'Bring the rooks to the centre files and aim the pieces at the kingside.'],
      opponent: ['Break the centre with ...d5 when it is safe.', 'Develop ...Nf6 and castle; do not let White trap the king in the centre.', 'Avoid grabbing pawns early while the king is still on e8.'],
    },
    mistakes: ['Moving the same piece twice for no reason while the opponent develops.', 'Playing Ng5 early and attacking f7 with too few pieces.', 'Forgetting to castle and getting caught by a central break.'],
    traps: [
      { id: 'legal', name: "Légal's mate", by: 'w', line: ['e4', 'e5', 'Nf3', 'd6', 'Bc4', 'Bg4', 'Nc3', 'g6', 'Nxe5', 'Bxd1', 'Bxf7+', 'Ke7', 'Nd5#'], lesson: 'Black took the queen, but White\'s pieces were already aimed at the king. Before you win material, check what your opponent\'s last move allows.', claim: 'mate' },
      { id: 'scholar', name: "Scholar's mate", by: 'w', line: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'], lesson: 'The queen and bishop both hit f7. Answer 3.Qh5 with ...g6 or ...Qe7 and the idea disappears.', claim: 'mate' },
      { id: 'blackburne', name: 'Blackburne Shilling Gambit', by: 'b', line: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4', 'Nxe5', 'Qg5', 'Nxf7', 'Qxg2', 'Rf1', 'Qxe4+', 'Be2', 'Nf3#'], lesson: 'Greedy captures lose here: after 4.Nxe5? Black attacks g2 and f2 at once. White should simply play 4.Nxd4.', claim: 'mate' },
    ],
  },
  {
    id: 'ruy-lopez',
    name: 'Ruy Lopez',
    eco: 'C60-C99',
    side: 'w',
    line: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'],
    gist: 'Pressure the defender of e5.',
    idea: 'The bishop attacks the knight that guards e5. White is not threatening to win a pawn at once, but keeps building pressure: a pawn on d4 and the option of Bxc6 to damage Black\'s structure for the endgame.',
    plans: {
      you: ['Castle, then play c3 and d4.', 'Keep the bishop on the a2-g8 diagonal after ...a6 with Ba4.', 'Use the extra space for a slow kingside attack.'],
      opponent: ['Build a solid centre with ...b5 and ...d6.', 'Challenge with ...d5 at the right moment.', 'Keep pieces protected: the pin on c6 is only annoying, not deadly.'],
    },
    mistakes: ['Taking on c6 too early without a plan.', 'Ignoring the centre and letting the pawn tension on e5 decide the game.', 'Rushing ...Nxe4 without checking the tactics along the e-file.'],
    traps: [],
  },
  {
    id: 'sicilian',
    name: 'Sicilian Defence (Open)',
    eco: 'B20-B99',
    side: 'b',
    line: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3'],
    gist: 'Trade a wing pawn for a centre pawn and fight for the win.',
    idea: 'Black unbalances the game at once. White gets the centre and the kingside attack; Black gets the half-open c-file and queenside play. Both kings are often attacked: whoever is faster usually wins.',
    plans: {
      you: ['Develop quickly and castle, then use the c-file and the d-file against the centre.', 'Break with ...d5 or ...b5 when White\'s pieces are not ready.', 'Counter-attack on the queenside while White attacks the king.'],
      opponent: ['Develop with Be3 and Qd2 and attack the king with f3, g4 or h4.', 'Keep an eye on d5: if Black gets ...d5 for free the position is equal.', 'Do not neglect the centre while attacking.'],
    },
    mistakes: ['Playing both ...d6 and ...e5 without a plan and leaving a weak d5 square.', 'Capturing pawns on the queenside while the king is still in the centre.', 'Copying a long theoretical line without understanding the plan.'],
    traps: [],
  },
  {
    id: 'french',
    name: 'French Defence',
    eco: 'C00-C19',
    side: 'b',
    line: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6'],
    gist: 'A sturdy pawn chain and a counter-attack on the centre.',
    idea: 'Black builds a solid pawn wall and accepts a cramped but safe position. The usual aim is to strike at the base of White\'s chain with ...c5 and ...f6.',
    plans: {
      you: ['Attack d4 with ...c5.', 'Bring the "bad" light-squared bishop out (often to d7 or via ...b6 and ...Ba6).', 'Use the c-file and the queenside for counterplay.'],
      opponent: ['Gain space with e5 and attack on the kingside.', 'Support d4 and avoid exchanging the pieces that help Black.', 'Use the extra space to build an attack.'],
    },
    mistakes: ['Leaving the light-squared bishop locked behind the pawns for the whole game.', 'Waiting passively instead of challenging the centre.', 'Allowing White\'s pawn to reach e5 and f6 without any counter-play.'],
    traps: [],
  },
  {
    id: 'caro-kann',
    name: 'Caro-Kann Defence',
    eco: 'B10-B19',
    side: 'b',
    line: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'],
    gist: 'Solid like the French, but the bishop gets out first.',
    idea: 'Black prepares ...d5 with ...c6 so the light bishop can develop to f5 or g4 before ...e6. The structure is healthy and Black\'s endgames are usually fine.',
    plans: {
      you: ['Develop the bishop outside the pawn chain, then play ...e6.', 'Castle, then challenge with ...c5 or ...e5 at the right moment.', 'Trade pieces: the structure is hard to attack.'],
      opponent: ['Play Ng3 to harass the bishop and gain a lead in development.', 'Use the space for a kingside attack.', 'Avoid early queen moves that waste time.'],
    },
    mistakes: ['Pushing a pawn without developing the pieces.', 'Going for ...Nd7 and ...Ngf6 without checking Qe2 and Nd6#.', 'Trading the good bishop and keeping the bad one.'],
    traps: [
      { id: 'caro-smothered', name: 'Caro-Kann smothered mate', by: 'w', line: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Nd7', 'Qe2', 'Ngf6', 'Nd6#'], lesson: 'After 5.Qe2 the knight on d7 must not be moved from its post: ...Ngf6?? lets Nd6 mate, because the king is boxed in by its own pieces. Play ...e6 or ...Ngf6 only after you check the Nd6 trick.', claim: 'mate' },
    ],
  },
  {
    id: 'qgd',
    name: "Queen's Gambit Declined",
    eco: 'D30-D69',
    side: 'b',
    line: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5'],
    gist: 'A classical fight for the centre.',
    idea: 'White offers a pawn to deflect Black\'s centre pawn; Black declines and keeps the centre solid. Typical plans: White\'s minority attack on the queenside, Black\'s ...c5 break or ...Ne4.',
    plans: {
      you: ['Develop pieces to natural squares and castle.', 'Challenge the centre with ...c5 or ...Ne4.', 'Solve the "bad bishop" problem on c8 by ...b6 or ...Nbd7.'],
      opponent: ['Increase pressure on d5 with Bg5 and Nc3.', 'Play for a minority attack with b4-b5.', 'Do not release the tension with cxd5 too early.'],
    },
    mistakes: ['Taking on d5 with a knight at the wrong time.', 'Neglecting the c8 bishop.', 'Letting White play e4 for free.'],
    traps: [
      { id: 'elephant', name: 'Elephant trap', by: 'b', line: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Nbd7', 'cxd5', 'exd5', 'Nxd5', 'Nxd5', 'Bxd8', 'Bb4+', 'Qd2', 'Bxd2+', 'Kxd2', 'Kxd8'], lesson: 'The pawn on d5 looks free, but the pinned queen is protected by tactics. Count the whole sequence before capturing.', claim: 'material' },
    ],
  },
  {
    id: 'kid',
    name: "King's Indian Defence",
    eco: 'E60-E99',
    side: 'b',
    line: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O'],
    gist: 'Let White take the centre, then attack it.',
    idea: 'Black allows a big pawn centre and strikes at it with ...e5 or ...c5. The fianchettoed bishop and the kingside attack with ...f5 give Black real winning chances.',
    plans: {
      you: ['Castle, then play ...e5 and ...Nc6/...Nbd7.', 'After the centre closes, attack with ...f5 and ...g5.', 'Use the bishop on g7 as an attacking piece.'],
      opponent: ['Expand on the queenside with c5 and b4.', 'Keep the centre protected and hit back on the wing the pawns are pointing to.', 'Exchange pieces to blunt the attack.'],
    },
    mistakes: ['Attacking on the kingside too slowly.', 'Playing ...exd4 early and giving White a free centre.', 'Ignoring the queenside break c5.'],
    traps: [],
  },
  {
    id: 'london',
    name: 'London System',
    eco: 'D00-D02',
    side: 'w',
    line: ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'e6', 'Nf3', 'c5', 'c3', 'Nc6', 'Nbd2'],
    gist: 'A solid setup you can play against anything.',
    idea: 'White develops the dark-squared bishop before closing the pawns with e3, then builds a compact setup with Nf3, Nbd2, c3 and Bd3. The plan is simple; the position is hard to break.',
    plans: {
      you: ['Play Bf4, e3, Nf3, c3, Nbd2, Bd3 and castle.', 'Break with e4 or c4 when your pieces are ready.', 'Keep the bishop outside the pawn chain.'],
      opponent: ['Challenge with ...c5 and ...Qb6, hitting b2.', 'Trade the dark bishops with ...Bd6.', 'Prepare ...e5 to seize the centre.'],
    },
    mistakes: ['Forgetting about the b2 pawn after ...Qb6.', 'Playing the exact same moves in every position.', 'Letting Black play ...e5 for free.'],
    traps: [],
  },
  {
    id: 'scandinavian',
    name: 'Scandinavian Defence',
    eco: 'B01',
    side: 'b',
    line: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5'],
    gist: 'Take back at once and accept a lead in development for White.',
    idea: 'Black trades a wing pawn for the centre pawn, but the queen comes out early and White can gain time by attacking it. In return Black gets an open position and a solid structure.',
    plans: {
      you: ['Develop quickly: ...c6, ...Bf5 or ...Bg4, ...e6.', 'Castle and complete development before the queen is chased again.', 'Keep your pawn structure healthy.'],
      opponent: ['Develop with tempo against the queen.', 'Gain space with d4 and Bc4.', 'Avoid unnecessary trades that let the queen escape.'],
    },
    mistakes: ['Moving the queen again and again.', 'Neglecting the development.', 'Grabbing the b2 pawn with the queen.'],
    traps: [],
  },
  {
    id: 'english',
    name: 'English Opening',
    eco: 'A10-A39',
    side: 'w',
    line: ['c4', 'e5', 'Nc3', 'Nf6', 'Nf3', 'Nc6'],
    gist: 'A flexible, positional way to control d5.',
    idea: 'White fights for the centre from the flank. Against ...e5 the position is like a Sicilian with colours reversed: White has an extra tempo, a strong d5 square and a choice of plans.',
    plans: {
      you: ['Control d5 and the centre; fianchetto with g3 and Bg2.', 'Choose between d4 and a slow build-up.', 'Use the extra tempo for a safe space advantage.'],
      opponent: ['Take space with ...e5 and ...d5.', 'Counter-attack in the centre once White has committed.', 'Do not allow a bind on d5.'],
    },
    mistakes: ['Treating it as a random "flank" opening without a centre plan.', 'Leaving d4 under-protected.', 'Fianchettoing before the centre is clear.'],
    traps: [],
  },
  {
    id: 'slav',
    name: 'Slav Defence',
    eco: 'D10-D19',
    side: 'b',
    line: ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'dxc4'],
    gist: 'Support d5 with a pawn and keep the bishop free.',
    idea: 'Black supports the d5 pawn with ...c6 so the light-squared bishop can develop outside the pawn chain. It is a solid reply to the Queen\'s Gambit, with counter-chances on the queenside.',
    plans: {
      you: ['Develop the bishop to f5 or g4.', 'Hold or return the pawn with ...b5 or ...e6.', 'Challenge the centre with ...c5 or ...e5 when it is time.'],
      opponent: ['Win back the pawn with e3 and Bxc4 or a4.', 'Gain space with e4.', 'Be careful about the c-file.'],
    },
    mistakes: ['Pushing ...b5 without a plan for the weakened squares.', 'Playing ...e6 too early and blocking the bishop.', 'Giving up the centre without a fight.'],
    traps: [],
  },
  {
    id: 'nimzo',
    name: 'Nimzo-Indian Defence',
    eco: 'E20-E59',
    side: 'b',
    line: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'],
    gist: 'Pin the knight, control e4.',
    idea: 'Black pins the knight on c3 so White cannot easily build a pawn centre with e4. In return Black is ready to double White\'s pawns by taking on c3, giving up the bishop pair.',
    plans: {
      you: ['Play ...O-O and ...d5 or ...c5.', 'Trade on c3 when it damages White\'s structure.', 'Use the e4 square for a knight.'],
      opponent: ['Gain the bishop pair and build a centre.', 'Avoid weak pawns on the c-file.', 'Develop quickly and challenge the pin.'],
    },
    mistakes: ['Taking on c3 when the structure does not benefit.', 'Forgetting the bishop pair.', 'Letting White play e4 without a fight.'],
    traps: [],
  },
];

export const openingById = (id: string): OpeningLesson | undefined => OPENING_LIBRARY.find((o) => o.id === id);
