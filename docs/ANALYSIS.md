# Game analysis, explanations, weaknesses and puzzles

Everything here is computed in your browser from engine searches and the rules of chess. There is no external AI service.

**Measured versus inferred.** The engine *measures*: evaluations, best moves, lines, depths. The rules library *verifies* things about the board. The app *infers* categories, lessons and patterns by fixed rules. The interface labels these differently ("Verified by the engine" against interpretation), and so does this document.

## Pipeline for one game

1. The PGN is replayed with chess.js. Every position gets a search at the chosen preset: Quick (depth 10, 2 lines), Standard (depth 14, 2 lines, default), Deep (depth 18, 3 lines). Finished positions (checkmate, stalemate) are decided by the rules and are not searched. Results are cached ([ENGINE.md](ENGINE.md)).
2. For each move: the evaluation of the position *before* it (the engine's best line) is compared with the evaluation *after* the move that was played. Scores are White-relative; each is converted to the mover's view.
3. The comparison is turned into a grade, flags and an explanation, and stored with the engine name and depth it came from.
4. Opening: the position after each move is looked up in a bundled list of ECO openings (lichess-org/chess-openings, CC0), by position rather than move order, so transpositions are recognised.

Analysis runs in a background queue with progress and cancel; cancelling leaves the engine usable and keeps finished games.

## Win chance, not centipawns

Centipawns mean different things in different positions: a one-pawn slip when already winning by five pawns costs almost nothing, the same slip in an equal position can decide the game. So scores are converted to **win chance** with the logistic curve fitted by Lichess to a large set of games:

```
win% = 50 + 50 × (2 / (1 + e^(−0.00368208 × cp)) − 1)      (cp clamped to ±1500)
```

A forced mate counts as 100% or 0%. This curve models *human* outcomes; it is not a property of the engine.

## Move grades

`win loss = max(0, win% before − win% after)`, in percentage points, for the side that moved.

| Grade | Win chance lost |
| --- | --- |
| Best | the engine's first choice, or 0.5 points or less |
| Excellent | 2 or less |
| Good | 5 or less |
| Inaccuracy | 10 or less |
| Mistake | 20 or less |
| Blunder | more than 20 |
| Forced | the position had a single legal move, so nothing is graded |

The cut-offs are this app's own. Other tools use other numbers and will grade some moves differently. A move that would be an inaccuracy but allows or misses a forced mate is promoted to a mistake.

### Context grades: brilliant, great, book, miss

The table above is the **loss grade**; it is stored in `lossCls` and is what statistics, puzzles and training use. Four labels are layered on top in `src/lib/analysis/grades.ts` and stored in `cls`. They are what you see on the board and in the review. The numbers below are the `GRADE_RULES` constants:

| Label | Rule (checked in this order: book, brilliant, great, miss) |
| --- | --- |
| **Book** | The move is at or before the deepest position of the game that is in the bundled opening list, and its loss grade is best, excellent or good. |
| **Brilliant** | Loss grade best or excellent; at most 2 points lost; the played move is the engine's first or second choice; at least 45% win chance afterwards; and along the engine's line (up to 6 plies) the mover is at least 2 pawns of material down once the exchanges have settled. A line cut off in the middle of an exchange gives no verdict. Not given when the mover already had more than 90%, unless at least 5 pawns are given up to force mate. |
| **Great** | Loss grade best; the *critical* flag is set (second-best move at least 15 points worse); the mover had under 97%; and it is not a capture back on the square of the opponent's last capture. |
| **Miss** | Loss grade inaccuracy or mistake; the opponent's previous move lost 10 points or more; the mover stood at 60% or better. Blunders stay blunders. |

Accuracy is computed from the win loss alone, so none of these labels changes it. These are this app's definitions. Chess.com's own rules for the same words are not public, so the labels will not match theirs one for one, and the numbers will differ even where the same word appears. The brilliant rule is conservative: it looks only at material along one engine line, so a quiet but deep idea is never called brilliant, and a sacrifice whose compensation is not material (for example a mating attack that the engine sees only late) can be missed.

The engine's own first choice is never charged a loss: a deeper search of the same position can score it slightly below the shallow search of the previous position, and that noise is removed (`classifyMove`).

**Flags**, which can accompany any grade:

- *Missed mate*: you had a forced mate and played something that no longer mates.
- *Allowed mate*: the move lets the opponent force mate.
- *Missed win*: you were at 80% or better and dropped below 60%.
- *Turning point*: a loss of 15 points or more that takes you from at least even (50%) to worse than even.
- *Critical*: the best move was at least 15 points better than the second-best, so only one move held the position (needs at least two lines).

**Accuracy** per move is `103.1668 × e^(−0.04354 × loss) − 3.1669`, limited to 0 to 100 (a curve published by Lichess). Game accuracy is the mean over your non-forced moves. It summarises move quality; it is not a rating. **Average centipawn loss** is shown for reference, with mate scores capped at ±1000.

**Critical moments** are ranked by a score built from the win loss plus bonuses for missed wins, mates and turning points; `[` and `]` on the analysis board jump between them.

**Game phase** (used in the report and in Insights): endgame when the non-pawn material on the board is low, opening for the first ten moves while most material is still present, otherwise middlegame.

## Tactics facts

For any move the app can read these straight from the board (`src/lib/analysis/tactics.ts`): the piece moved and any capture with whether the captured piece was defended and the net material; check and mate; promotion; castling; pieces newly attacked, forks, pins, skewers and discovered attacks the move creates; own pieces left *en prise* that were not before, that were already, or that the move rescued; whether the moved piece lands on an unsafe square; development and centralisation; back-rank mates. "En prise" uses a simple count of attackers and defenders by piece value; it does not play out full exchange sequences, so it can miss tactics that depend on a deeper sequence (those are caught by the engine's line, not by this pattern list).

## Explanations

For a mistake or blunder the app assembles:

- **Verified by the engine.** The engine's best line, and the refutation of the move played, are replayed move by move on a chess-rules board. Claims such as "it captures an undefended knight", "it forks the king and rook", "the move allows Qh5#" or "the evaluation drops from +1.4 to −0.8" are checked against the position and the engine's lines before they are shown. The text prints the depth the engine used.
- **Interpretation.** A category, a short lesson and a suggested exercise, chosen by fixed rules from the verified facts. Categories: hanging piece, fork, pin or skewer, discovered attack, missed mating threat, back-rank weakness, overlooked opponent threat, poor exchange, missed tactic, squandered advantage, king safety, pawn structure, development, endgame technique, positional understanding, calculation, time pressure. These are *interpretation, not engine output*, and the interface says so.

**Threat check.** "What is the opponent threatening?" passes the turn in a copy of the position (a null move, sent to the engine as a modified FEN; the board itself is never changed) and lets the engine search it. If the opponent's winning chances would rise by 10 points or more, it reports a real threat and shows the engine's line. It is unavailable when you are in check, because passing is illegal then.

## Weaknesses

Only *your* moves graded mistake or blunder, or that missed a mate, are examined, and the demo game never counts unless you switch that on in Settings. Each is assigned the category its explanation produced ("sound" moves are skipped). For each category the app reports the count, the number of games, the rate per 100 of your moves, the share of all the win chance you gave away, an example list that links to the real moves, a trend, and a suggested exercise.

- **Established** needs at least 4 occurrences across at least 3 games. Otherwise the pattern is **tentative** and says so. The words are chosen to match the evidence.
- **Trend** compares your earlier and later games and needs at least 9 analysed games; otherwise it is "unknown".
- **Severity**: the pattern's share of all win chance lost to mistakes and blunders. 10% or more is moderate, 25% or more is major.

## Puzzles

Puzzles come from positions in your own games where you lost at least 15 points of win chance, or missed a mate. For each candidate the app:

1. Replays the game to the position (through chess.js).
2. Searches it again at depth **16** with three lines.
3. **Rejects** it unless the engine agrees the move you played was worse, the position was not already lost, and the solution is clear: the best move must be at least 10 points ahead of the runner-up (a unique answer), or at least 25 points better than the move you played.
4. Replays any mating solution to confirm that it really ends in checkmate.
5. Keeps the other first moves that are about as good as accepted alternatives.

The rejection reason is recorded, and a failed candidate is simply not offered.

In the trainer, your first move is accepted if it is a stored answer, or the engine rates it within 5 points of the best (for a mating puzzle it must still mate as quickly). Later moves in a longer sequence must follow the stored line. Hints reveal progressively (theme, piece, square) and using them is recorded. A wrong move gets an engine-based explanation of what it gives up.

**Scheduling.** Leitner boxes: a correct answer moves a puzzle up, and the next review is 1, 3, 7, 14, then 30 days later; a wrong answer sends it back to the start and it returns in 10 minutes. **Difficulty.** Your puzzle rating (starting at 1200) and each puzzle's rating move together after every attempt with an Elo-style update, and new puzzles are chosen near your current rating. The puzzle rating is a private practice number, not a chess rating.

## Where it is tested

`tests/analysis.test.ts` (grades, flags, win chance and accuracy maths, tactics, whole-game analysis with the real engine, mate detection, cancellation, cache rules), `tests/training.test.ts` (weaknesses with the real engine, puzzle generation and answer checking, scheduling), and `tests/library.test.ts` (opening detection, the Endgame Lab's claims against the engine at depth 22). The browser tests check that the report, the coach tab, the threat check and the training tools work end to end.

## Time use

`src/lib/analysis/timeAnalysis.ts` reads the clock times stored with each move (`[%clk h:mm:ss]` in the PGN, which Chess.com games carry and games played in the app with a clock produce). Time spent on a move is the previous clock reading of that side, plus the increment, minus the new reading, so the first move of each side has no time spent. A move is *low clock* with under 30 s left, *fast* with under 3 s spent (and not low clock), and a *long think* with at least 20 s spent and at least 3 times your median. A serious error is a mistake or a blunder by loss grade. Notes are written only with at least 10 timed moves in a game and 5 moves in each group being compared, and always carry the counts. These are descriptions of what happened, not diagnoses: a fast mistake may be a move you did not see.

## Theory and opponent notes

`src/lib/analysis/opponentNotes.ts`. *Theory*: the first move after the deepest named position of the opening list, who played it, the named continuations the list has from that point, and what Stockfish preferred. The list does not contain how often strong players choose a line, so the app never calls a move rare or popular. *Opponent*: accuracy against yours, their count of mistakes and blunders, the biggest, how often you kept the advantage after one, and their clock use when the game has clocks.
