// Small PGNs where "Me" (Black) makes clear mistakes, used to exercise analysis, weaknesses and puzzles.
const head = (n, result, w, b) => `[Event "Practice ${n}"]\n[Site "?"]\n[Date "2026.10.0${n}"]\n[Round "-"]\n[White "${w}"]\n[Black "${b}"]\n[Result "${result}"]\n[WhiteElo "1400"]\n[BlackElo "1450"]\n[TimeControl "600"]`;

export const MY_NAME = 'Me';

export const BLACK_BLUNDERS = [
  `${head(1, '1-0', 'Rival A', 'Me')}\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`,
  `${head(2, '1-0', 'Rival B', 'Me')}\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Qh4 4. Nxh4 Bc5 5. O-O Nf6 6. d3 d6 7. Be3 Bxe3 8. fxe3 O-O 9. Nc3 Ng4 10. Qd2 Nxe3 11. Qxe3 Nd4 12. Qxd4 1-0`,
  `${head(3, '1-0', 'Rival C', 'Me')}\n\n1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0`,
  `${head(4, '1-0', 'Rival D', 'Me')}\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Nb4 9. O-O c6 10. d4 Kd7 11. Re1 1-0`,
];

// A longer game (36 plies) so the tools that need 24+ plies have something to work with. It is legal chess
// (checked with chess.js), played quietly; it is not meant to be a model game.
export const LONG_GAME = `${head(5, '1-0', 'Rival E', 'Me')}\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O 7. Bb3 a6 8. Nbd2 Ba7 9. h3 h6 10. Re1 Re8 11. Nf1 Be6 12. Bxe6 Rxe6 13. Ng3 Qd7 14. Be3 Bc5 15. a4 Ba3 16. Rb1 Nb8 17. Re2 h5 18. d4 Bc5 1-0`;
