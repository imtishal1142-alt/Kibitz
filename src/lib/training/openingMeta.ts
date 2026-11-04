// Extra opening knowledge: each opening's character (how offensive or defensive it is, how much theory it needs, and
// which rating range it suits), its other well-known lines, and extra traps. The lines are replayed for legality in
// tests/openinglib.test.ts. The character and rating advice is common coaching guidance, not statistics from this app,
// and it is labelled that way where it is shown.
import type { Trap } from './openingLibrary';
import type { Color } from '../types';

export type Style = 'attacking' | 'positional' | 'solid' | 'counterattacking' | 'gambit' | 'system';
export type Band = 'beginner' | 'club' | 'advanced' | 'expert';
export const BAND_LABEL: Record<Band, string> = { beginner: 'Under 1000', club: '1000 to 1600', advanced: '1600 to 2000', expert: 'Over 2000' };
export const STYLE_LABEL: Record<Style, string> = { attacking: 'Attacking', positional: 'Positional', solid: 'Solid', counterattacking: 'Counter-attacking', gambit: 'Gambit', system: 'System' };
export const AGGRESSION_LABEL = ['', 'Very defensive', 'Defensive', 'Balanced', 'Offensive', 'Very offensive'];

export interface Profile {
  /** 1 = very defensive, 5 = very offensive. */
  aggression: 1 | 2 | 3 | 4 | 5;
  styles: Style[];
  /** 1 = few lines to remember, 3 = heavy theory. */
  theory: 1 | 2 | 3;
  bands: Band[];
  /** One sentence: when to choose it. */
  choose: string;
}

export interface Variation {
  name: string;
  /** Moves from the starting position. */
  line: string[];
  note: string;
}

const B = { b: 'beginner', c: 'club', a: 'advanced', e: 'expert' } as const;
const p = (aggression: Profile['aggression'], styles: Style[], theory: Profile['theory'], bands: string, choose: string): Profile => ({
  aggression, styles, theory, bands: bands.split('').map((x) => B[x as keyof typeof B]), choose,
});
const v = (name: string, line: string, note: string): Variation => ({ name, line: line.split(' '), note });

export const PROFILES: Record<string, Profile> = {
  italian: p(4, ['attacking', 'positional'], 1, 'bca', 'Choose it for clear plans, quick development and little theory.'),
  'ruy-lopez': p(3, ['positional'], 3, 'cae', 'Choose it when you want a lasting, strategic fight and will study the theory.'),
  sicilian: p(4, ['counterattacking'], 3, 'cae', 'Choose it as Black to play for a win against 1.e4, and accept the theory.'),
  french: p(2, ['solid', 'counterattacking'], 2, 'bca', 'Choose it for a sturdy pawn structure and clear plans against 1.e4.'),
  'caro-kann': p(1, ['solid'], 2, 'bcae', 'Choose it for a safe, sound defence to 1.e4 with few weaknesses.'),
  qgd: p(2, ['solid', 'positional'], 2, 'cae', 'Choose it as Black for a classical, sound reply to 1.d4.'),
  kid: p(5, ['counterattacking', 'attacking'], 3, 'cae', 'Choose it as Black to attack White\'s king in a closed, complicated game.'),
  london: p(2, ['system', 'solid'], 1, 'bca', 'Choose it as White to play the same safe setup against almost anything.'),
  scandinavian: p(2, ['solid'], 1, 'bc', 'Choose it as Black for an early queen trade of tempo and a simple structure.'),
  english: p(3, ['positional', 'system'], 2, 'cae', 'Choose it as White for flexibility and a slow, strategic game.'),
  slav: p(1, ['solid'], 2, 'cae', 'Choose it as Black for a rock-solid answer to 1.d4 with an active bishop.'),
  nimzo: p(3, ['positional'], 2, 'cae', 'Choose it as Black to fight for the centre with pieces instead of pawns.'),
  scotch: p(4, ['attacking'], 2, 'bca', 'Choose it as White to open the game at once and avoid heavy Ruy Lopez theory.'),
  vienna: p(4, ['attacking'], 2, 'bca', 'Choose it as White for sharp play with an extra developing move.'),
  'kings-gambit': p(5, ['gambit', 'attacking'], 2, 'bca', 'Choose it for a romantic attack where you accept risk for fun and initiative.'),
  petrov: p(1, ['solid'], 2, 'cae', 'Choose it as Black for a safe, symmetrical reply to 1.e4 e5.'),
  philidor: p(1, ['solid'], 1, 'bc', 'Choose it as Black for a simple, sturdy setup that is a bit passive.'),
  'two-knights': p(4, ['attacking'], 2, 'bca', 'Choose it as Black for a lively reply, and know the Ng5 lines.'),
  pirc: p(3, ['counterattacking'], 2, 'bca', 'Choose it as Black to let White build a centre, then attack it.'),
  alekhine: p(3, ['counterattacking'], 2, 'ca', 'Choose it as Black to provoke White pawns forward and attack them.'),
  najdorf: p(5, ['counterattacking', 'attacking'], 3, 'ae', 'Choose it as Black for the most ambitious Sicilian, with a lot of theory.'),
  dragon: p(5, ['counterattacking', 'attacking'], 3, 'ae', 'Choose it as Black for a race of attacks, and be ready for heavy theory.'),
  alapin: p(2, ['positional', 'system'], 1, 'bca', 'Choose it as White to dodge the Open Sicilian theory and keep a sound centre.'),
  sveshnikov: p(4, ['counterattacking'], 3, 'ae', 'Choose it as Black for an active Sicilian with a strong centre and weak d5.'),
  'french-advance': p(3, ['positional'], 2, 'bca', 'Choose it as White against the French for a space edge and an easy plan.'),
  'caro-advance': p(3, ['positional'], 2, 'ca', 'Choose it as White against the Caro-Kann for space and a clear plan.'),
  qga: p(2, ['positional', 'solid'], 2, 'ca', 'Choose it as Black to take the pawn and then give it back for easy development.'),
  catalan: p(3, ['positional'], 3, 'ae', 'Choose it as White for long-term pressure on the long diagonal.'),
  grunfeld: p(4, ['counterattacking'], 3, 'ae', 'Choose it as Black to attack a big white centre from the side.'),
  dutch: p(4, ['counterattacking', 'attacking'], 2, 'ca', 'Choose it as Black to play for a win against 1.d4 and attack on the kingside.'),
  benoni: p(5, ['counterattacking'], 3, 'ae', 'Choose it as Black for an unbalanced game with queenside pawn play.'),
  reti: p(2, ['positional', 'system'], 2, 'ca', 'Choose it as White for a flexible, hypermodern start with no early commitments.'),
  trompowsky: p(3, ['attacking', 'system'], 1, 'bca', 'Choose it as White to dodge Indian theory with an early Bg5.'),
  colle: p(2, ['system', 'solid'], 1, 'bc', 'Choose it as White for a simple system you can play with little theory.'),
  budapest: p(5, ['gambit', 'counterattacking'], 2, 'ca', 'Choose it as Black for a surprise gambit against 1.d4.'),
  evans: p(5, ['gambit', 'attacking'], 2, 'bca', 'Choose it as White to sacrifice a pawn for a fast attack in the Italian.'),
  'queens-indian': p(2, ['solid', 'positional'], 2, 'cae', 'Choose it as Black for a solid fianchetto reply to 1.d4 2.c4 and 3.Nf3.'),
  'semi-slav': p(4, ['counterattacking'], 3, 'ae', 'Choose it as Black for a sharp, ambitious mix of the Slav and the QGD.'),
  berlin: p(1, ['solid'], 3, 'ae', 'Choose it as Black for a famously hard-to-beat reply to the Ruy Lopez.'),
  bishops: p(3, ['attacking', 'positional'], 1, 'bca', 'Choose it as White to develop quickly and keep options open.'),
  taimanov: p(3, ['counterattacking'], 2, 'cae', 'Choose it as Black for a flexible Sicilian with an early e6.'),
  scheveningen: p(2, ['solid', 'counterattacking'], 3, 'cae', 'Choose it as Black for a compact Sicilian setup, then strike back.'),
  'smith-morra': p(5, ['gambit', 'attacking'], 2, 'bca', 'Choose it as White to sacrifice a pawn for lead in development against the Sicilian.'),
  'closed-sicilian': p(3, ['positional', 'attacking'], 1, 'bca', 'Choose it as White to avoid the Open Sicilian and play on the kingside.'),
  rossolimo: p(3, ['positional'], 2, 'bcae', 'Choose it as White to avoid Open Sicilian theory and damage the black pawns.'),
  'accelerated-dragon': p(4, ['counterattacking'], 2, 'cae', 'Choose it as Black for a Dragon bishop with fewer move-order tricks.'),
  'ruy-exchange': p(2, ['positional'], 1, 'bca', 'Choose it as White for a simple plan and an endgame edge.'),
  'ruy-closed': p(3, ['positional'], 3, 'ae', 'Choose it as White for the main strategic battle in the Ruy Lopez.'),
  'giuoco-pianissimo': p(2, ['positional', 'solid'], 1, 'bcae', 'Choose it as White for a quiet, safe Italian with plenty of play.'),
  'four-knights': p(2, ['solid'], 1, 'bc', 'Choose it as White or Black for a safe, symmetrical game with little theory.'),
  danish: p(5, ['gambit', 'attacking'], 1, 'bc', 'Choose it as White for a fast attack for two pawns.'),
  winawer: p(4, ['counterattacking'], 3, 'ae', 'Choose it as Black for the sharpest French, with a lot of theory.'),
  'tarrasch-french': p(2, ['positional', 'solid'], 2, 'bcae', 'Choose it as White for a safe French line that avoids the Winawer.'),
  'french-classical': p(2, ['solid'], 2, 'ca', 'Choose it as Black for a standard French fight against e5.'),
  'caro-classical': p(1, ['solid'], 2, 'bcae', 'Choose it as Black for the soundest Caro-Kann.'),
  panov: p(4, ['attacking'], 2, 'bca', 'Choose it as White to fight for the initiative against the Caro-Kann.'),
  'qgd-exchange': p(2, ['positional'], 1, 'bca', 'Choose it as White for a clear plan (the minority attack).'),
  tarrasch: p(4, ['counterattacking'], 2, 'ca', 'Choose it as Black for active pieces in return for an isolated pawn.'),
  samisch: p(4, ['attacking'], 2, 'ca', 'Choose it as White to play for a kingside pawn storm against the King\'s Indian.'),
  'kid-fianchetto': p(2, ['positional', 'solid'], 2, 'ca', 'Choose it as White for a quiet, safe answer to the King\'s Indian.'),
  'bogo-indian': p(2, ['solid'], 1, 'cae', 'Choose it as Black for an easy, solid answer to 3.Nf3.'),
  benko: p(5, ['gambit', 'counterattacking'], 3, 'cae', 'Choose it as Black to give a pawn for long-term pressure.'),
  modern: p(2, ['counterattacking'], 1, 'bc', 'Choose it as Black for a flexible setup, but know the risks.'),
  nimzowitsch: p(2, ['solid'], 1, 'bc', 'Choose it as Black to dodge theory with an early Nc6.'),
  birds: p(3, ['system', 'attacking'], 1, 'bc', 'Choose it as White to control e5 with a Dutch-like setup.'),
  larsen: p(2, ['system', 'positional'], 1, 'bca', 'Choose it as White to fianchetto first and avoid theory.'),
  'english-symmetrical': p(2, ['positional'], 2, 'ca', 'Choose it as White for a slow, subtle game.'),
  'english-reversed': p(3, ['positional'], 2, 'ca', 'Choose it as White to play a Sicilian a tempo up.'),
  kia: p(3, ['system'], 1, 'bca', 'Choose it as White for one setup against almost everything.'),
  leningrad: p(4, ['counterattacking'], 2, 'ca', 'Choose it as Black for a King\'s Indian-style Dutch.'),
  stonewall: p(3, ['solid', 'attacking'], 1, 'bca', 'Choose it as Black for a solid pawn wall and a kingside plan.'),
  'grunfeld-exchange': p(4, ['attacking'], 3, 'ae', 'Choose it as White for the sharpest test of the Grünfeld.'),
  jobava: p(4, ['attacking', 'system'], 2, 'bca', 'Choose it as White for a London with real attacking chances.'),
  torre: p(2, ['system'], 1, 'bca', 'Choose it as White for a solid system with Bg5.'),
  'stonewall-attack': p(3, ['system', 'attacking'], 1, 'bc', 'Choose it as White for a simple system that attacks the kingside.'),
  'vienna-gambit': p(5, ['gambit', 'attacking'], 2, 'bca', 'Choose it as White for sharp play with f4.'),
  ponziani: p(3, ['positional'], 1, 'bc', 'Choose it as White for a simple centre with c3 and d4.'),
  latvian: p(5, ['gambit'], 2, 'bc', 'Choose it as Black for surprise value; it is risky against good play.'),
  'fried-liver': p(5, ['attacking', 'gambit'], 1, 'bc', 'Choose it as White for a famous attack, but know that Black has a safer reply.'),
  kan: p(2, ['counterattacking', 'solid'], 2, 'cae', 'Choose it as Black for a flexible Sicilian that avoids the sharpest theory.'),
  'blackmar-diemer': p(5, ['gambit', 'attacking'], 2, 'bc', 'Choose it as White for a quick attack for a pawn against d5 players.'),
  albin: p(5, ['gambit', 'counterattacking'], 2, 'bc', 'Choose it as Black for a surprise gambit with several traps.'),
  barnes: p(1, ['system'], 1, 'b', 'Mostly a lesson in why the f-pawn should wait.'),
  'sicilian-classical': p(3, ['counterattacking'], 3, 'cae', 'Choose it as Black for the most natural Sicilian setup.'),
};

/** Other well-known lines of the library openings. Each is a complete line from the starting position. */
export const VARIATIONS: Record<string, Variation[]> = {
  italian: [
    v('Giuoco Pianissimo', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O', 'The quiet main line: White builds slowly with c3, d3 and Re1, then plays in the centre.'),
    v('Greco attack (c3 and d4)', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+', 'White opens the centre at once. Bd2 or Nc3 answers the check; Nc3 is sharper.'),
    v('Moller attack', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 e5 d5 Bb5 Ne4 cxd4 Bb6', 'A sharp line where White gives up a pawn for activity and Black has to defend carefully.'),
    v('Two Knights: 4.Ng5 d5 5.exd5 Na5', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Be2 h6 Nf3 e4 Ne5 Bd6', 'Black returns the pawn but gets a lead in development. The safe and best-known answer to Ng5.'),
    v('Hungarian Defence', 'e4 e5 Nf3 Nc6 Bc4 Be7 d4 exd4 Nxd4 Nf6 Nc3', 'A solid but passive reply: Black keeps the bishop safe and waits.'),
    v('Wilkes-Barre (Traxler)', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 Bc5', 'A wild gambit that Black plays for surprise; White can take on f7 or simply defend.'),
  ],
  'ruy-lopez': [
    v('Berlin Defence', 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8', 'The "Berlin wall": queens come off at once and Black gets a very solid endgame.'),
    v('Marshall Attack', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5 exd5 Nxd5 Nxe5 Nxe5 Rxe5 c6', 'Black sacrifices a pawn for a dangerous attack on the kingside.'),
    v('Open Spanish', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4 d4 b5 Bb3 d5 dxe5 Be6', 'Black grabs the e4 pawn and fights for the centre with active pieces.'),
    v('Exchange Variation', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4 exd4 Nxd4 c5 Nb3 Qxd1 Rxd1', 'White wants a good endgame with the kingside pawn majority.'),
    v('Schliemann Defence', 'e4 e5 Nf3 Nc6 Bb5 f5 Nc3 fxe4 Nxe4 d5 Nxe5 dxe4 Nxc6 Qg5', 'A sharp gambit: Black attacks at once; careful White play keeps an edge.'),
    v('Steinitz Deferred', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 d6 c3 Bd7 d4 Nge7', 'A solid setup: Black keeps d6 and plays ...Nge7 and ...g6.'),
    v('Cozio Defence', 'e4 e5 Nf3 Nc6 Bb5 Nge7 c3 g6 d4 exd4 cxd4 d5', 'Black develops the knight to e7 so the bishop on g7 can come out.'),
  ],
  sicilian: [
    v('Open Sicilian', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3', 'The main road: White opens the centre, Black gets queenside counterplay.'),
    v('Alapin (2.c3)', 'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 Bc4 Nb6 Bb3 d5', 'White builds a centre with c3 and d4. Black\'s best answers are ...Nf6 and ...d5.'),
    v('Grand Prix Attack', 'e4 c5 Nc3 Nc6 f4 g6 Nf3 Bg7 Bc4 e6 f5', 'White attacks the kingside with f4 and f5 at once.'),
    v('Closed Sicilian', 'e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6 Be3', 'A slower, strategic line with a fianchettoed bishop.'),
    v('Rossolimo', 'e4 c5 Nf3 Nc6 Bb5 g6 Bxc6 dxc6 d3 Bg7 h3 Nf6 Nc3 O-O', 'White wrecks Black\'s pawns and plays a long positional game.'),
    v('Smith-Morra Gambit', 'e4 c5 d4 cxd4 c3 dxc3 Nxc3 Nc6 Nf3 d6 Bc4 e6 O-O Nf6', 'White gives a pawn for a lead in development.'),
  ],
  najdorf: [
    v('English Attack', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7 g4', 'White castles long and pushes pawns at Black\'s king; Black counterattacks on the queenside.'),
    v('6.Bg5 main line', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Be7 Qf3 Qc7 O-O-O Nbd7 g4', 'The sharpest classical line, with pawn storms and tactics.'),
    v('Poisoned Pawn', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Qb6 Qd2 Qxb2 Rb1 Qa3', 'Black takes the b2 pawn and survives huge threats; heavy theory.'),
    v('6.Be2 (Opocensky)', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5 Nb3 Be7 O-O O-O', 'A calm line: Black gets a solid centre and White keeps a small edge.'),
    v('6.Be3 e5', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e6 g4 Nc6', 'The Be3 system with an early g4 and Black\'s ...e6 response.'),
  ],
  dragon: [
    v('Yugoslav Attack', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4 Bd7 O-O-O Rc8 Bb3 Ne5 h4 h5 Bh6 Nc4 Bxg7 Kxg7 Bxc4 Rxc4', 'White attacks with h4-h5 and Bh6; Black counterattacks on the c-file. Both kings are in danger.'),
    v('Classical (Be2)', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be2 Bg7 O-O O-O Nb3 Be6 f4 Qc8', 'A calmer way: White does not attack the king at once.'),
    v('Levenfish (f4)', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 f4 Nc6 Nxc6 bxc6 e5 Nd7', 'White grabs space, Black hits back with ...d5 or ...Nd7.'),
  ],
  sveshnikov: [
    v('Main line (Nd5)', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5 Nd5 Be7 Bxf6 Bxf6 c3 O-O', 'The famous structure: Black gets the bishop pair and a hole on d5; White gets a strong knight on d5.'),
    v('Chelyabinsk line', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Nd5 Nxd5 exd5 Ne7 c4 Ng6', 'White avoids Bg5; the knight on g6 and pawn play on the queenside decide.'),
  ],
  french: [
    v('Winawer', 'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4 Qc7 Qxg7 Rg8 Qxh7 cxd4 Ne2 Nbc6 f4 Bd7', 'Black wrecks White\'s pawns, White gets a kingside attack and the bishop pair.'),
    v('Tarrasch', 'e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6 Ne2 cxd4 cxd4 f6 exf6 Nxf6 Nf3 Bd6 O-O O-O', 'A solid line for White that avoids the Winawer pin.'),
    v('Advance', 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 Be2 cxd4 cxd4 Nh6', 'White gains space; Black attacks the d4 pawn and aims for ...f6.'),
    v('Classical (Burn)', 'e4 e6 d4 d5 Nc3 Nf6 Bg5 dxe4 Nxe4 Be7 Bxf6 gxf6 Nf3 f5 Ng3 Nc6', 'Black gets doubled f-pawns but active pieces and the bishop pair.'),
    v('Exchange', 'e4 e6 d4 d5 exd5 exd5 Nf3 Nf6 Bd3 Bd6 O-O O-O Bg5 Bg4', 'A symmetrical, drawish structure that is easy to play.'),
  ],
  'caro-kann': [
    v('Classical', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6 Bf4 Qa5+', 'Black develops the bishop first and gets a solid, safe position.'),
    v('Advance', 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 Nd7', 'White gains space; Black hits the base of the chain with ...c5.'),
    v('Exchange', 'e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 Qb3 Qd7 Nd2 e6 Ngf3 Bd6', 'A symmetrical structure where White can try a minority attack.'),
    v('Panov Attack', 'e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Be7 cxd5 Nxd5 Bd3 Nc6 O-O O-O', 'White fights for the initiative; Black gets a healthy isolated-pawn game.'),
    v('Fantasy Variation', 'e4 c6 d4 d5 f3 dxe4 fxe4 e5 Nf3 exd4 Bc4 Bb4+', 'White attacks with f3 and Bc4; a sharp, less-known choice.'),
    v('Two Knights', 'e4 c6 Nc3 d5 Nf3 Bg4 h3 Bxf3 Qxf3 e6 d4 Nf6 Bd3 Bd6 O-O O-O', 'White develops quickly and aims for a space edge; sound and simple.'),
  ],
  qgd: [
    v('Orthodox (Bg5)', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5 Rc1 Be6', 'The classic main line. Black gets a solid game after trades.'),
    v('Ragozin Defence', 'd4 d5 c4 e6 Nc3 Nf6 Nf3 Bb4 Bg5 h6 Bh4 dxc4 e4 g5 Bg3 b5', 'Black pins the knight and takes space; a sharp theoretical line.'),
    v('Exchange Variation', 'd4 d5 c4 e6 cxd5 exd5 Nc3 Nf6 Bg5 Be7 e3 O-O Qc2 Nbd7 Bd3 Re8 Nge2 Nf8', 'White uses the minority attack against Black\'s queenside.'),
    v('Tartakower', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 Bd3 Bb7 O-O Nbd7', 'Black fianchettoes and aims for ...c5 or ...dxc4 and ...c5.'),
    v('Anti-Moscow Gambit', 'd4 d5 c4 e6 Nc3 Nf6 Nf3 c6 Bg5 h6 Bh4 dxc4 e4 g5 Bg3 b5 Be2 Bb7 O-O Nbd7', 'A sharp Semi-Slav line with a lot of theory.'),
  ],
  'semi-slav': [
    v('Meran', 'd4 d5 c4 e6 Nc3 Nf6 Nf3 c6 e3 Nbd7 Bd3 dxc4 Bxc4 b5 Bd3 a6 e4 c5 e5 cxd4 Nxb5 axb5 Bxb5 Bb7', 'Black grabs space on the queenside; White gets the centre. Very sharp.'),
    v('Botvinnik System', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6 Bg5 dxc4 e4 b5 e5 h6 Bh4 g5 Nxg5 hxg5 Bxg5 Nbd7', 'A razor-sharp line where both sides sacrifice material for activity.'),
    v('Moscow Variation', 'd4 d5 c4 e6 Nc3 Nf6 Nf3 c6 Bg5 h6 Bxf6 Qxf6 e3 Nd7 Bd3 dxc4 Bxc4 g6', 'White trades the bishop for the knight and Black plays calmly.'),
  ],
  slav: [
    v('Main line (a4)', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O Nbd7 Qe2 Bg6 e4 O-O Bd3 Bh5', 'Black takes c4 and keeps the bishop outside the pawn chain.'),
    v('Exchange Variation', 'd4 d5 c4 c6 cxd5 cxd5 Nc3 Nf6 Bf4 Nc6 e3 e6 Nf3 Bd6 Bg3 O-O', 'A symmetrical, drawish line where White aims for a small edge.'),
    v('Chebanenko', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 a6 e3 b5 c5 Bf5 Nh4 Bc8', 'Black plays ...a6 first to gain queenside space.'),
  ],
  nimzo: [
    v('Rubinstein (4.e3)', 'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3 bxc3 dxc4 Bxc4 Qc7', 'The most popular line: White builds, Black fights for the centre.'),
    v('Classical (4.Qc2)', 'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6 Bg5 Bb7 e3 d6 f3 Nbd7', 'White avoids doubled pawns, Black takes the bishop pair.'),
    v('Sämisch (4.a3)', 'd4 Nf6 c4 e6 Nc3 Bb4 a3 Bxc3+ bxc3 c5 e3 Nc6 Bd3 O-O Ne2 b6 e4 Ne8', 'White accepts doubled pawns for the bishop pair and a big centre.'),
    v('Leningrad (4.Bg5)', 'd4 Nf6 c4 e6 Nc3 Bb4 Bg5 h6 Bh4 c5 d5 d6 e3 exd5 cxd5 Bxc3+ bxc3 Qa5', 'A sharp line with early pins and tactics.'),
  ],
  kid: [
    v('Classical main line', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7 Be3 f5', 'The classic race: White attacks on the queenside, Black on the kingside.'),
    v('Sämisch', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 e5 d5 Nh5 Qd2 f5', 'White builds a big centre and plans O-O-O and a kingside pawn storm.'),
    v('Four Pawns Attack', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f4 O-O Nf3 c5 d5 e6 Be2 exd5 cxd5 Bg4', 'White takes huge space; Black must strike with ...c5 and ...e6.'),
    v('Averbakh', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Be2 O-O Bg5 c5 d5 e6 Qd2 exd5 exd5 Re8', 'White pins the knight and keeps the centre; a strategic, sound line.'),
    v('Petrosian', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 d5 a5 Bg5 h6 Bh4 Na6', 'White closes the centre and Black plays on the kingside.'),
  ],
  grunfeld: [
    v('Exchange Variation', 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Be3 Qa5 Qd2 O-O', 'White builds a big centre; Black attacks it with ...c5 and ...Bg7.'),
    v('Russian System', 'd4 Nf6 c4 g6 Nc3 d5 Nf3 Bg7 Qb3 dxc4 Qxc4 O-O e4 Bg4 Be3 Nfd7 Qb3 Nb6', 'White takes space quickly; Black hits the centre with pieces.'),
    v('Bf4 system', 'd4 Nf6 c4 g6 Nc3 d5 Bf4 Bg7 e3 c5 dxc5 Qa5 Rc1 dxc4 Bxc4 Qxc5', 'A quieter line where White develops the bishop first.'),
  ],
  london: [
    v('Main London', 'd4 d5 Bf4 Nf6 e3 e6 Nf3 Bd6 Bg3 O-O Nbd2 c5 c3 Nc6', 'The standard setup. Break with Ne5, Qb3 or c4 at a good moment.'),
    v('Versus ...c5', 'd4 d5 Bf4 c5 e3 Nc6 c3 Nf6 Nd2 e6 Ngf3 Bd6 Bg3 O-O', 'Black hits d4 at once; White supports it with c3 and Nd2.'),
    v('Versus the King\'s Indian setup', 'd4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O h3 d6 Be2 Nbd7 O-O Qe8', 'White plays a quiet London and aims for a slight space edge.'),
  ],
  'kings-gambit': [
    v('Accepted: Kieseritzky', 'e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5 Nf6 Bc4 d5 exd5 Bd6', 'The wildest line: a huge race where both sides take risks.'),
    v('Accepted: Bishop\'s Gambit', 'e4 e5 f4 exf4 Bc4 Nf6 Nc3 c6 Nf3 d5 exd5 cxd5 Bb3 Nc6', 'White develops the bishop; the bishop on b3 aims at f7 and the knight on c3 helps.'),
    v('Declined: Falkbeer Counter-Gambit', 'e4 e5 f4 d5 exd5 e4 d3 Nf6 dxe4 Nxe4 Nf3 Bc5', 'Black counterattacks in the centre; a sharp line with equal chances.'),
    v('Declined: Classical (3...Bc5)', 'e4 e5 f4 Bc5 Nf3 d6 c3 Nf6 d4 exd4 cxd4 Bb4+', 'Black refuses the pawn and develops a piece; White gets a big centre.'),
  ],
  scotch: [
    v('Classical (4...Bc5)', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7 Bc4 Ne5', 'Black develops fast and pressures d4.'),
    v('Mieses (4...Nf6)', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Ba6', 'White gains space, Black gets a dynamic game.'),
    v('Scotch Gambit', 'e4 e5 Nf3 Nc6 d4 exd4 Bc4 Nf6 e5 d5 Bb5 Ne4 Nxd4 Bd7', 'White does not recapture on d4 at once and aims for quick development.'),
  ],
  petrov: [
    v('Main line (3.Nxe5)', 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Nc6 O-O Be7 c4 Nb4', 'Black recaptures and fights for equality in a symmetrical position.'),
    v('Three Knights (3.Nc3)', 'e4 e5 Nf3 Nf6 Nc3 Nc6 Bb5 Bb4 O-O O-O d3 Bxc3 bxc3 d6', 'White develops instead of capturing; a solid, quiet line.'),
    v('Cochrane Gambit', 'e4 e5 Nf3 Nf6 Nxe5 d6 Nxf7 Kxf7 d4 Nc6 Nc3 Kg8 Bc4 Be6', 'White sacrifices a knight for the king in the open; objectively unsound but tricky.'),
  ],
  evans: [
    v('Main line', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O Nge7 cxd4 d5', 'White sacrifices a pawn for a big centre and quick development; Black returns it with ...d5.'),
    v('Evans Gambit Declined', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bb6 a4 a6 Nc3 Nf6', 'Black retreats the bishop; White gets a free gain of space on the queenside.'),
  ],
  alapin: [
    v('2...Nf6 line', 'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6 Bc4 Nb6 Bb3 dxe5 Nxe5 Nxe5 dxe5 Qxd1+ Kxd1', 'Black hits the centre; the queens come off and White has the better structure.'),
    v('2...d5 line', 'e4 c5 c3 d5 exd5 Qxd5 d4 Nf6 Nf3 Bg4 Be2 e6 O-O Nc6', 'Black takes the centre at once; the game is balanced and clear.'),
  ],
  'french-advance': [
    v('Main line', 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 c4 Nbd2 Na5 Be2 Bd7 O-O Ne7', 'Black closes the queenside and White prepares a kingside play with b4 or g4.'),
    v('Milner-Barry Gambit', 'e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 Bd3 cxd4 O-O Bd7 Nxd4 Nxd4 cxd4 Qxd4 Nc3 Qb6', 'White gives a pawn for lead in development. Black must be careful with the king.'),
  ],
  'caro-advance': [
    v('Short variation', 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 Nd7 O-O Ne7 c4', 'White builds a centre and hits the c5 pawn; Black plays ...Nc6.'),
    v('Short with ...Qb6', 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 Ne7 O-O h6 Nbd2 Nd7', 'A calm line: Black develops and waits for the right time for ...c5.'),
  ],
  qga: [
    v('Main line', 'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6 Qe2 b5 Bb3 Bb7', 'Black takes the pawn and returns it, getting a comfortable game.'),
    v('3.e4 line', 'd4 d5 c4 dxc4 e4 Nf6 e5 Nd5 Bxc4 Nb6 Bd3 Nc6', 'White grabs the centre with e4 at once; Black attacks the centre.'),
  ],
  benko: [
    v('Fully accepted', 'd4 Nf6 c4 c5 d5 b5 cxb5 a6 bxa6 Bxa6 Nc3 d6 e4 Bxf1 Kxf1 g6', 'Black gives a pawn and gets open files and a long diagonal for the bishop.'),
    v('Declined (Nd2 and Nf3)', 'd4 Nf6 c4 c5 d5 b5 Nf3 g6 Nc3 bxc4 e4 Bg7 Bxc4 O-O', 'White does not take the pawn and goes for a safe development.'),
  ],
  modern: [
    v('Classical Modern', 'e4 g6 d4 Bg7 Nc3 d6 Nf3 Nf6 Be2 O-O O-O c6 a4 Nbd7', 'A Pirc by another route: Black delays and counterattacks the centre.'),
    v('Austrian Attack', 'e4 g6 d4 Bg7 Nc3 d6 f4 Nf6 Nf3 O-O Bd3 Na6 O-O c5', 'White takes the centre with f4; Black strikes back with ...c5.'),
  ],
  bishops: [
    v('Bishop\'s Opening main', 'e4 e5 Bc4 Nf6 d3 c6 Nf3 d5 Bb3 Bd6 O-O O-O', 'A flexible bishop that lets White choose the setup later. Safe for beginners.'),
    v('Berlin Defence', 'e4 e5 Bc4 Nf6 d4 exd4 Nf3 Nc6 O-O Nxe4 Re1 d5 Bxd5 Qxd5 Nc3 Qa5', 'White sacrifices material for activity; accurate play keeps the extra pawn.'),
  ],
  trompowsky: [
    v('2...Ne4 3.Bf4', 'd4 Nf6 Bg5 Ne4 Bf4 c5 f3 Qa5+ c3 Nf6 d5 Qb6 Qd2 d6', 'The most common line: White keeps the bishop and gets a big centre.'),
    v('2...d5 3.Bxf6', 'd4 Nf6 Bg5 d5 Bxf6 exf6 e3 Bd6 Bd3 O-O Nd2 c5', 'Black accepts doubled f-pawns for the bishop pair.'),
  ],
  colle: [
    v('Colle-Zukertort', 'd4 d5 Nf3 Nf6 e3 e6 Bd3 c5 b3 Nc6 O-O Bd6 Bb2 O-O Nbd2 Qe7', 'White builds with b3 and Bb2, then pushes e4 for a kingside attack.'),
  ],
  'bogo-indian': [
    v('4.Bd2 main line', 'd4 Nf6 c4 e6 Nf3 Bb4+ Bd2 Qe7 g3 Nc6 Nc3 Bxc3 Bxc3 Ne4', 'White blocks with the bishop; Black trades and gets an easy game.'),
    v('4.Nbd2', 'd4 Nf6 c4 e6 Nf3 Bb4+ Nbd2 O-O a3 Be7 e4 d5 e5 Nfd7', 'White keeps the bishop pair and takes space; Black strikes at the centre.'),
  ],
  'english-symmetrical': [
    v('Hedgehog setup', 'c4 c5 Nf3 Nf6 Nc3 e6 g3 b6 Bg2 Bb7 O-O Be7 d4 cxd4 Qxd4 d6', 'Black sets up a compact structure (a "hedgehog") and strikes later with ...b5 or ...d5.'),
    v('Botvinnik System', 'c4 e5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6 e4 Nge7 Nge2 O-O O-O', 'A white wall: pawns on c4, d3 and e4, and a knight on e2.'),
  ],
  philidor: [
    v('Hanham', 'e4 d6 d4 Nf6 Nc3 Nbd7 Nf3 e5 Bc4 Be7 O-O O-O Qe2 c6', 'A solid structure that is hard to break; Black waits for a chance.'),
    v('Philidor with ...exd4', 'e4 e5 Nf3 d6 d4 exd4 Nxd4 Nf6 Nc3 Be7 Be2 O-O O-O Re8', 'Black trades the centre pawn and gets a compact position.'),
  ],
  pirc: [
    v('Classical', 'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6 a4 Nbd7', 'White develops calmly; Black prepares ...e5 or ...c5.'),
    v('Austrian Attack', 'e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 c5 dxc5 Qa5 Bd3 Qxc5 Qe2 O-O', 'White grabs a huge centre and attacks; Black counter-attacks with ...c5.'),
    v('150 Attack', 'e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3 b5 Bd3 Nbd7', 'White builds an Yugoslav-style attack; Black strikes on the queenside.'),
  ],
  alekhine: [
    v('Four Pawns Attack', 'e4 Nf6 e5 Nd5 d4 d6 c4 Nb6 f4 dxe5 fxe5 Nc6 Be3 Bf5', 'White takes a lot of space; Black attacks the centre with pieces.'),
    v('Modern (Nf3)', 'e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6 O-O Be7 h3 Bh5 c4 Nb6', 'White develops calmly; Black fights for a safe, flexible position.'),
    v('Exchange', 'e4 Nf6 e5 Nd5 d4 d6 c4 Nb6 exd6 exd6 Nc3 Be7 Bd3 O-O', 'White trades pawns and gets a space advantage.'),
  ],
  catalan: [
    v('Open Catalan', 'd4 Nf6 c4 e6 g3 d5 Bg2 dxc4 Nf3 Be7 O-O O-O Qc2 a6 Qxc4 b5', 'Black takes the c4 pawn and gives it back later for activity.'),
    v('Closed Catalan', 'd4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4 Qc2 a6 a4 Bd7', 'White keeps the long diagonal and aims for pressure on the queenside.'),
  ],
  dutch: [
    v('Leningrad', 'd4 f5 g3 Nf6 Bg2 g6 Nf3 Bg7 O-O O-O c4 d6 Nc3 Qe8', 'A King\'s Indian with ...f5: Black fianchettoes and attacks the kingside.'),
    v('Stonewall', 'd4 f5 c4 e6 g3 Nf6 Bg2 d5 Nf3 c6 O-O Bd6 Nc3 O-O', 'A solid wall of pawns; Black gets e4 control and a kingside attack.'),
    v('Classical', 'd4 f5 g3 Nf6 Bg2 e6 Nf3 Be7 O-O O-O c4 d6 Nc3 Qe8', 'A flexible Dutch with ...d6 and ...Qe8-h5.'),
  ],
  'queens-indian': [
    v('Main line (Nc3 Bb7)', 'd4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Be7 O-O O-O Nc3 Ne4 Qc2 Nxc3 Qxc3 c5', 'The classic setup: Black fianchettoes and trades pieces.'),
    v('Petrosian System', 'd4 Nf6 c4 e6 Nf3 b6 a3 Bb7 Nc3 d5 cxd5 Nxd5 Qc2 Nxc3 bxc3 Be7', 'White plays a3 to stop ...Bb4 and keeps a flexible centre.'),
  ],
  benoni: [
    v('Modern Benoni', 'd4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3 Bg7 Be2 O-O O-O', 'White gets a centre, Black gets queenside play and the long diagonal.'),
    v('Czech Benoni', 'd4 Nf6 c4 c5 d5 e5 Nc3 d6 e4 Be7 Nf3 O-O Be2 Nbd7', 'Black locks the centre and plays ...Ne8-g6 and ...f5 on the kingside.'),
  ],
  budapest: [
    v('Adler Variation', 'd4 Nf6 c4 e5 dxe5 Ng4 Nf3 Nc6 Bf4 Bb4+ Nbd2 Qe7 e3 Ngxe5', 'White develops and holds the extra pawn; Black gets active pieces.'),
    v('Rubinstein Variation', 'd4 Nf6 c4 e5 dxe5 Ng4 Bf4 Nc6 Nf3 Bb4+ Nbd2 Qe7 a3 Ngxe5 axb4 Nd3#', 'A famous mating trap: if White grabs the bishop, the knight gives checkmate on d3.'),
  ],
  'two-knights': [
    v('4.Ng5 d5 5.exd5 Na5', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Be2 h6 Nf3 e4 Ne5 Bd6', 'The main line: Black gives the pawn back and gets a good game.'),
    v('4.d4 (Max Lange style)', 'e4 e5 Nf3 Nc6 Bc4 Nf6 d4 exd4 O-O Nxe4 Re1 d5 Bxd5 Qxd5 Nc3 Qa5', 'White gives a pawn for a lead in development; tactically rich.'),
  ],
  reti: [
    v('Reti main line', 'Nf3 d5 c4 d4 b4 c5 bxc5 e6 e3 Bxc5 exd4 Bxd4', 'White accepts a pawn exchange in the centre; Black gets space.'),
    v('Reti with Bg2', 'Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d3 O-O Nbd2 c5 e4', 'A flexible setup: White plays e4 at the right moment.'),
  ],
  scandinavian: [
    v('Main line (Qa5)', 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6 Nd5', 'Black keeps the queen on a5 and develops freely.'),
    v('Modern (Nf6)', 'e4 d5 exd5 Nf6 d4 Nxd5 Nf3 g6 Be2 Bg7 O-O O-O c4 Nb6', 'Black plays ...Nf6 first and gets a fianchetto setup.'),
    v('Qd6 line', 'e4 d5 exd5 Qxd5 Nc3 Qd6 d4 Nf6 Nf3 a6 Bf4 Qb4', 'Black puts the queen on d6 to avoid tempo losses.'),
  ],
  english: [
    v('Symmetrical', 'c4 c5 Nf3 Nf6 Nc3 Nc6 g3 g6 Bg2 Bg7 O-O O-O d4 cxd4 Nxd4', 'A classic: White aims for d4 and queenside pressure.'),
    v('Reversed Sicilian', 'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7', 'White plays a Sicilian with an extra tempo.'),
    v('Four Knights English', 'c4 e5 Nc3 Nf6 Nf3 Nc6 e3 Bb4 Qc2 O-O Nd5 Re8', 'White develops calmly and aims for a quiet edge.'),
  ],
  'vienna': [
    v('Vienna Gambit', 'e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7 Qe2 Bg4', 'A sharp line with f4 where Black hits back in the centre.'),
    v('Frankenstein-Dracula', 'e4 e5 Nc3 Nf6 Bc4 Nxe4 Qh5 Nd6 Bb3 Nc6 Nb5 g6 Qf3 f5 Qd5 Qe7', 'A wild line where both sides sacrifice material; for fans of tactics.'),
  ],
};

/** Extra hand-picked traps. Each is checked: lines are legal, mate claims end in checkmate, and material claims are confirmed by the engine. */
const t = (id: string, name: string, by: Color, line: string, lesson: string, claim: Trap['claim']): Trap => ({ id, name, by, line: line.split(' '), lesson, claim });

export const EXTRA_TRAPS: Record<string, Trap[]> = {
  'ruy-lopez': [
    t('noah', 'Noah\'s Ark trap', 'b', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 d6 d4 b5 Bb3 Nxd4 Nxd4 exd4 Qxd4 c5 Qd5 Be6 Qc6+ Bd7 Qd5 c4', 'White grabbed a pawn with the queen and Black traps the bishop on b3 with ...c5-c4. A quick pawn move wins a piece.', 'material'),
  ],
  budapest: [
    t('bud-d3', 'Budapest Knight mate', 'b', 'd4 Nf6 c4 e5 dxe5 Ng4 Bf4 Nc6 Nf3 Bb4+ Nbd2 Qe7 a3 Ngxe5 axb4 Nd3#', 'White grabbed the bishop, and the knight on d3 gave checkmate. Always check where the king can go before you take.', 'mate'),
  ],
  barnes: [
    t('fool', 'Fool\'s mate', 'b', 'f3 e5 g4 Qh4#', 'The two fastest-possible pawn moves open the long diagonal to the king. A single check ends the game.', 'mate'),
  ],
};
