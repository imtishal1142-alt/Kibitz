import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Banner, PageHead } from '../components/ui';
import { CLASS_THRESHOLDS } from '../lib/chess/classify';
import { GRADE_RULES } from '../lib/analysis/grades';
import { TIME_RULES } from '../lib/analysis/timeAnalysis';
import { WEAK_SPOT_RULES } from '../lib/training/weakspots';
import { PRESETS } from '../lib/storage/prefs';

const SECTIONS: { id: string; title: string }[] = [
  { id: 'start', title: 'What this app is' },
  { id: 'engine', title: 'The engine' },
  { id: 'classes', title: 'How moves are graded' },
  { id: 'coach', title: 'Explanations: verified and interpreted' },
  { id: 'training', title: 'Weaknesses, puzzles and review schedule' },
  { id: 'strength', title: 'Strength estimation' },
  { id: 'play', title: 'Playing the engine' },
  { id: 'practice', title: 'Daily session, progress and time use' },
  { id: 'chesscom', title: 'Chess.com data' },
  { id: 'desktop', title: 'Offline, install and backup' },
  { id: 'keys', title: 'Keyboard shortcuts' },
  { id: 'privacy', title: 'Privacy and your data' },
  { id: 'limits', title: 'Known limitations' },
];

const T = CLASS_THRESHOLDS;

export default function Help() {
  const { hash } = useLocation();
  useEffect(() => {
    const id = hash.replace(/^#/, '');
    if (!id) return;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ block: 'start' });
      el.focus({ preventScroll: true });
    }
  }, [hash]);

  return (
    <div className="stack">
      <PageHead title="Help and methods" sub="How the numbers are produced, and where they stop being reliable." />
      <nav className="sheet pad-sm" aria-label="On this page">
        <ul className="list-plain row" style={{ gap: '6px 16px' }}>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <Link to={`/help#${s.id}`}>{s.title}</Link>
            </li>
          ))}
        </ul>
      </nav>

      <article className="sheet pad prose" aria-label="Help">
        <section aria-labelledby="start">
          <h2 id="start" tabIndex={-1}>What this app is</h2>
          <p>
            Kibitz is a local-first chess analysis and coaching tool. It imports your games, has Stockfish check every move, and turns the results into explanations, puzzles and practice from your own mistakes. It runs entirely in your browser: there is no account and no server of ours.
          </p>
          <p>
            Throughout the app, things the engine <em>measured</em> are kept apart from things the app <em>infers</em>. When a statement could be wrong, it says so and says why.
          </p>
        </section>

        <section aria-labelledby="engine">
          <h2 id="engine" tabIndex={-1}>The engine</h2>
          <ul>
            <li>
              <strong>Stockfish 19</strong> compiled to WebAssembly, running in a Web Worker. The default build is the small single-threaded &quot;Lite&quot; network. Larger builds can be added at build time (see the README) and then appear in Settings.
            </li>
            <li>It speaks the standard UCI protocol: positions go in as FEN plus moves, and results come back as score, depth and principal variation per line (MultiPV).</li>
            <li>
              <strong>Scores are always stored from White&apos;s point of view</strong> (positive means better for White), whoever is to move. The interface converts to the side you care about when it shows a result.
            </li>
            <li>A search can be cancelled and replaced at any time. If the engine stops answering, a watchdog restarts it and the app says so.</li>
            <li>Evaluations are cached in this browser, keyed by the position and the engine build (name and selected flavour). A stored result is reused only if it was searched at least as deep and with at least as many lines as the new request needs, and switching the Stockfish build never reuses another build&apos;s results. The cache can be cleared in Settings.</li>
            <li>
              Depth presets for full-game analysis: {Object.values(PRESETS).map((p) => `${p.label} (depth ${p.depth})`).join(', ')}. A deeper search is more reliable but slower. Every saved analysis records the depth used.
            </li>
          </ul>
          <Banner kind="warn">
            Opponent strength settings use Stockfish&apos;s own <code>UCI_Elo</code> (1320 to 3190) and <code>Skill Level</code> (0 to 20). The Elo number is on the engine developers&apos; scale for engine rating lists at fast time controls. It is <strong>not</strong> a Chess.com, Lichess or FIDE rating, and a person rated 1500 online will not necessarily score 50% against &quot;1500&quot;.
          </Banner>
        </section>

        <section aria-labelledby="classes">
          <h2 id="classes" tabIndex={-1}>How moves are graded</h2>
          <p>
            For every move the engine evaluates the position before it (its best line) and after the move you actually played. Both scores are turned into the mover&apos;s <strong>winning chances</strong> with the logistic curve published by Lichess:
          </p>
          <p>
            <code>win% = 50 + 50 × (2 / (1 + e<sup>−0.00368208 × cp</sup>) − 1)</code>
          </p>
          <p>
            The grade depends on how many percentage points of winning chances the move gave away (<em>win loss</em>). Using winning chances rather than raw centipawns means a one-pawn slip in an already decided game costs little, while the same slip in an equal position costs a lot.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Grade</th>
                  <th>Win chances lost</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Best</td><td>the engine&apos;s first choice, or ≤ {T.best} points</td></tr>
                <tr><td>Excellent</td><td>≤ {T.excellent} points</td></tr>
                <tr><td>Good</td><td>≤ {T.good} points</td></tr>
                <tr><td>Inaccuracy</td><td>≤ {T.inaccuracy} points</td></tr>
                <tr><td>Mistake</td><td>≤ {T.mistake} points</td></tr>
                <tr><td>Blunder</td><td>more than {T.mistake} points</td></tr>
                <tr><td>Forced</td><td>the position had a single legal move, so nothing is graded</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            Four more labels need context that the loss alone does not carry. They are shown on the board and in the review, but they never change accuracy, which is computed from the loss only:
          </p>
          <ul>
            <li><strong>Brilliant</strong>: a sacrifice the engine approves. The move is the engine&apos;s first or second choice, loses at most {GRADE_RULES.brilliantMaxLoss} points, leaves you with at least {GRADE_RULES.brilliantMinAfter}% winning chances, and along the engine&apos;s own line you are at least {GRADE_RULES.brilliantMinSacrifice} pawns of material down once the exchanges have settled. Not given when you already had more than {GRADE_RULES.brilliantMaxBefore}% (unless you give up {GRADE_RULES.brilliantMatingSacrifice}+ pawns to force mate), and not given when the line is cut off in the middle of an exchange.</li>
            <li><strong>Great</strong>: the only move that held the position (every alternative at least {GRADE_RULES.greatMinGap} points worse), when you were not already above {GRADE_RULES.greatMaxBefore}% and it was not simply taking back a piece.</li>
            <li><strong>Book</strong>: a move inside the bundled opening list that the engine also approves. The list says a line has a name; it does not say how often strong players choose it.</li>
            <li><strong>Miss</strong>: an inaccuracy or mistake that let slip the chance the opponent&apos;s previous error ({GRADE_RULES.missOpponentLoss}+ points) had offered, when you stood at {GRADE_RULES.missMinBefore}% or better. Blunders stay blunders.</li>
          </ul>
          <p>These are this app&apos;s own definitions. Chess.com and other sites use their own, undisclosed or different rules, so the labels, and the accuracy numbers, will not match theirs move for move.</p>
          <p>These cut-offs are this app&apos;s own choice, in the same spirit as other analysis sites. Other tools use different numbers and will grade some moves differently. Extra flags are added where they apply:</p>
          <ul>
            <li><strong>Missed mate</strong>: you had a forced mate and played something that no longer mates.</li>
            <li><strong>Allowed mate</strong>: the move lets the opponent force mate.</li>
            <li><strong>Missed win</strong>: you stood at 80% or better and dropped below 60%.</li>
            <li><strong>Turning point</strong>: a loss of 15 points or more that takes you from at least even to worse than even.</li>
            <li><strong>Critical</strong>: the best move was at least 15 points better than the second-best, so only one move held the position.</li>
          </ul>
          <p>
            <strong>Accuracy</strong> per move is <code>103.1668 × e<sup>−0.04354 × loss</sup> − 3.1669</code>, limited to 0–100, again a published Lichess curve. Game accuracy is the average over your moves. It is a summary of move quality, not a rating. <strong>Average centipawn loss</strong> is shown for reference only, with mate scores capped at ±1000 centipawns.
          </p>
          <p>
            Opening names come from a bundled public-domain list of ECO openings (lichess-org/chess-openings, CC0), matched by position, so transpositions are recognised.
          </p>
        </section>

        <section aria-labelledby="coach">
          <h2 id="coach" tabIndex={-1}>Explanations: verified and interpreted</h2>
          <p>No external AI service is used. Every explanation is assembled by the app from two kinds of material, labelled differently on screen:</p>
          <ul>
            <li>
              <strong>Verified by the engine.</strong> The engine&apos;s line is replayed move by move with a chess rules library. Facts such as &quot;the move captures a knight that was undefended&quot;, &quot;it forks the king and rook&quot;, &quot;the played move allows Qh5#&quot; or &quot;the evaluation drops from +1.4 to −0.8&quot; come from the engine&apos;s lines or from the rules of the game, and are checked against the position.
            </li>
            <li>
              <strong>Interpretation, not engine output.</strong> The category (for example &quot;missed threat&quot; or &quot;king safety&quot;), the lesson and the suggested exercise are heuristic and written in advance. They are sensible reading of the verified facts, not proof.
            </li>
          </ul>
          <p>
            The <strong>threat check</strong> asks what the opponent would do if it were their turn again. The app passes the move in a copy of the position and lets the engine search it; if the opponent&apos;s winning chances would jump by 10 points or more, it reports a real threat and shows the engine&apos;s line. It is unavailable when you are in check, because passing is illegal then.
          </p>
        </section>

        <section aria-labelledby="training">
          <h2 id="training" tabIndex={-1}>Weaknesses, puzzles and review schedule</h2>
          <h3>Weaknesses</h3>
          <p>
            Only <em>your</em> moves graded mistake or blunder (or that missed a mate) are considered, and the demo game never counts unless you switch that on in Settings. Each pattern shows how many times it happened, in how many games, the rate per 100 of your moves, the share of all points lost and a trend. A pattern is called <strong>established</strong> only with at least 4 occurrences across at least 3 games; otherwise it is <strong>tentative</strong>. A trend compares your earlier games with your latest ones and needs at least 9 analysed games, otherwise it is marked unknown. Severity is the pattern&apos;s share of all the winning chances you lost to mistakes and blunders (10% or more is moderate, 25% or more major).
          </p>
          <h3>Puzzles</h3>
          <p>
            Puzzles are made from positions in your own games where you lost at least 15 points of winning chances (or missed a mate). Each candidate is searched again at depth 16 with three lines. It is rejected unless the engine&apos;s move is clearly better than what you played and either unique (at least 10 points ahead of the runner-up) or at least 25 points better than your move. Mate puzzles are replayed to confirm they really end in checkmate. Candidates that fail any of these checks are simply not turned into puzzles.
          </p>
          <p>
            In the trainer, your first move is accepted if it is a stored answer, or if the engine rates it within 5 points of winning chances of its best move (and, for a mating puzzle, it still mates just as fast). A different but equally good move therefore counts. Later moves in a longer sequence must follow the stored engine line. Hints reveal progressively (theme, piece, square) and using them is recorded.
          </p>
          <h3>Review schedule and difficulty</h3>
          <p>
            Puzzles use simple Leitner boxes: a correct answer moves a puzzle up and the next review is 1, 3, 7, 14 and then 30 days away; a wrong answer sends it back and it returns after 10 minutes. Your puzzle rating and each puzzle&apos;s difficulty move together after every attempt with an Elo-style update, and new puzzles are chosen near your current puzzle rating. The puzzle rating is a private practice number: <strong>it is not a chess rating</strong>.
          </p>
        </section>

        <section aria-labelledby="strength">
          <h2 id="strength" tabIndex={-1}>Strength estimation</h2>
          <Banner kind="info">
            Short version: the app can estimate the rating that <em>your results</em> best support, with an honest range. It cannot reliably turn move quality into a rating, and it will not pretend to.
          </Banner>
          <p>These are always shown separately and never blended into one number:</p>
          <ol>
            <li><strong>Official rating.</strong> What Chess.com reports, per time class, with the date it was fetched. Nothing here changes it.</li>
            <li>
              <strong>Results-based estimate.</strong> A statistical estimate of the rating at which your actual results against your actual opponents are most likely, using only games with rated opponents in that time class. The method is a maximum-a-posteriori fit of the Elo logistic model, where a game is worth 1, ½ or 0 and the expected score is <code>1 / (1 + 10<sup>(opponent − you)/400</sup>)</code>.
            </li>
            <li><strong>Performance rating.</strong> What the same games add up to on their own: the average opponent rating plus <code>400 × log<sub>10</sub>(score / (1 − score))</code>, with the adjustment capped at ±800 (the FIDE convention for a 100% or 0% score, flagged as capped on screen). It has no prior, no recency weighting and no range, so it jumps around on small samples. It is context, not an estimate.</li>
            <li><strong>Move-quality statistics.</strong> Accuracy, average centipawn loss, blunder and mistake rates, best-move rate, measured by the engine on your analysed games.</li>
          </ol>
          <h3>How the results-based estimate works</h3>
          <ul>
            <li>It needs at least 5 rated games in a time class. Fewer than that, the app says there is not enough data instead of guessing.</li>
            <li>A weak prior centred on your opponents&apos; average rating (standard deviation 400) stops perfect or hopeless streaks from sending the estimate to infinity. Its influence fades as games accumulate.</li>
            <li>Recent games count more: a game loses half its weight every 120 days.</li>
            <li>The range is the normal approximation to the posterior at the confidence level you choose (50, 80, 90 or 95%; 80% by default). The number of effective games is reported, and the range is flagged as wide and provisional below 20 of them. Wide ranges are shown as wide.</li>
            <li>Bullet, blitz, rapid and daily are estimated separately, because ratings in different time classes are not interchangeable.</li>
          </ul>
          <h3>Backtest</h3>
          <p>
            With at least 15 rated games the app replays your history: each game is predicted using only the games before it, and the predictions are scored with the Brier score, a standard measure of probabilistic forecasts (lower is better). It is compared with your official rating and with a coin flip. The comparison is shown whichever way it comes out. It tests how well the estimate predicted your own results; it is <em>not</em> a test against an outside rating list.
          </p>
          <h3>The move-quality-implied rating (experimental)</h3>
          <p>
            No dataset of players with known ratings and engine-analysed games was available to calibrate a formula that converts accuracy or centipawn loss into Elo, so <strong>no such formula is used</strong>. Instead, the app uses your own analysed games as a mini calibration set: it fits how accurate your <em>opponents&apos;</em> moves were against their known ratings, then asks which rating that line gives for your own average accuracy. It is shown only with at least 25 analysed games, an opponent spread of at least 100 rating points and a clearly rising line, with a range from 400 bootstrap resamples of your games. Otherwise it says why it is unavailable. It inherits every limit of the model and can be well off; treat it as a curiosity, not a measurement.
          </p>
          <h3>What it cannot do</h3>
          <ul>
            <li>It cannot predict an over-the-board or FIDE rating. Rating pools differ.</li>
            <li>Engine accuracy depends on the position type, the length of the game and the engine depth, so accuracy is only loosely tied to strength.</li>
            <li>Chess.com&apos;s public API gives current ratings but <strong>no rating history</strong>. The sparkline on the Chess.com page is built from the rating after each imported game, which is the only history the data supports.</li>
            <li>Played-against-engine games have no opponent rating, so they do not feed the results-based estimate.</li>
          </ul>
        </section>

        <section aria-labelledby="play">
          <h2 id="play" tabIndex={-1}>Playing the engine</h2>
          <ul>
            <li>Clocks run from timestamps, so a background tab cannot make them drift. Untimed games are available.</li>
            <li>Threefold repetition and the fifty-move rule can be <strong>claimed</strong>. Fivefold repetition and the seventy-five-move rule end the game automatically. A player who runs out of time against an opponent who cannot possibly checkmate gets a draw, as in the FIDE rules.</li>
            <li>
              <strong>Draw offers.</strong> The engine accepts when its own evaluation of the position (depth 12) is at most +0.20 pawns for it and it does not see a mating win. It never offers or claims draws on its own.
            </li>
            <li>Takeback removes your last move and the engine&apos;s reply. Resigning asks for confirmation. Closing or reloading the tab mid-game asks you first; leaving the page any other way ends the game without saving. Finished games are saved automatically.</li>
            <li><strong>Human-like opponent.</strong> A full-strength engine looks at its best five moves and picks one at random, preferring the better ones; the lower the carefulness setting, the more often it takes a slightly worse one, and it never takes a move that loses far more than the best. It plays plausible mistakes rather than random blunders. The setting is not a rating.</li>
            <li>Engine matches (Match Lab) give each side its own settings and run a series with optional alternating colours. Pausing takes effect after the current move; stopping discards the game in progress. Every finished game is saved and can be replayed in the analysis board.</li>
          </ul>
        </section>

        <section aria-labelledby="practice">
          <h2 id="practice" tabIndex={-1}>Daily session, progress and time use</h2>
          <ul>
            <li><strong>Today&apos;s session</strong> is built from your own data: due puzzles, mistakes of yours that are due for a retest, one game to review, the weakness to work on, and a short reflection. Steps you have nothing for are left out. The streak counts a day when you did at least one piece of practice (puzzles, reviews, lessons, a game played, a retest or a review). Running an analysis does not count.</li>
            <li><strong>Retests</strong>: each mistake you answer in Mistake replay comes back after 1, 3, 7, 14 and 30 days if you solved it (a move that loses at most 3 points counts), and in a few minutes if you did not.</li>
            <li><strong>Progress</strong> charts your accuracy and mistakes per game over time. <strong>Is your practice working?</strong> compares your recent games with earlier ones for a weakness you have been practising, and only gives a verdict when there are at least 6 games and 150 moves in each period, at least 10 puzzle attempts on that theme, and at least 4 earlier occurrences. Otherwise it says it lacks evidence. Even then it is a comparison of two groups of games, not proof that the practice caused the change.</li>
            <li><strong>Time use</strong> reads the clock times saved in a game. A move counts as played in time trouble with under {TIME_RULES.lowClockMs / 1000} s left, and as fast when it took under {TIME_RULES.fastMs / 1000} s. Notes appear only with at least {TIME_RULES.minMoves} timed moves and {TIME_RULES.minBucket} moves in a group, and always give the counts. A fast mistake may simply be a move you did not see.</li>
            <li><strong>Theory and opponent notes</strong> in the game report say who first left the named openings, what the list continues with, and what Stockfish preferred; and how the opponent&apos;s accuracy, mistakes and clock compared with yours. They are facts from the analysis, not a profile of the player.</li>
            <li><strong>Play from your mistakes</strong> starts a game against the engine from a position where you made a mistake, when that position was still balanced (between {WEAK_SPOT_RULES.minWinBefore}% and {WEAK_SPOT_RULES.maxWinBefore}% for you). In Endgame lab each ending keeps a record of attempts and successes.</li>
          </ul>
        </section>

        <section aria-labelledby="chesscom">
          <h2 id="chesscom" tabIndex={-1}>Chess.com data</h2>
          <ul>
            <li>Only the official <strong>Published-Data API</strong> is used: public profile, stats and monthly game archives. No password, no login and no scraping. A username is all it needs, and only public data can be fetched.</li>
            <li>Archives are fetched one month at a time with a polite delay, retried with backoff when the service is busy, and can be cancelled. Finished months are remembered so later syncs fetch only what is new.</li>
            <li>Games are de-duplicated by their Chess.com id, and by a content fingerprint so the same game imported by PGN is not stored twice.</li>
            <li>Profile ratings show the date and source of the data. There is no rating-history endpoint in the public API.</li>
            <li>
              The API is called straight from your browser. If your network or an extension blocks <code>api.chess.com</code>, or the service is down, the import fails with a plain message and nothing is lost; you can paste or upload a PGN instead.
            </li>
          </ul>
          <Banner kind="warn">
            The Chess.com client was tested against recorded and scripted responses. The sandbox this app was built in could not reach <code>api.chess.com</code>, so a live import has not been verified by the author. If a live import fails for a reason that is not your network, please treat it as a bug.
          </Banner>
        </section>

        <section aria-labelledby="desktop">
          <h2 id="desktop" tabIndex={-1}>Offline, install and backup</h2>
          <ul>
            <li><strong>Offline.</strong> After the first visit over https (or from localhost), the browser stores the whole app, the engine included, and it opens and runs with no connection. Importing from Chess.com still needs one. A new version is installed in the background and takes over after every Kibitz tab has been closed.</li>
            <li><strong>Install.</strong> Chrome and Edge offer to install the site as an app. There is also a desktop app for Windows, macOS and Linux that bundles everything; see the README.</li>
            <li><strong>Automatic backup.</strong> In Settings you can choose a folder. About once a day, when the app opens, a backup file named kibitz-backup-DATE.json is written there and only the newest 7 of those files are kept; other files in the folder are never touched. This works in the desktop app and in Chromium browsers (which may ask permission again after a restart). Firefox and Safari cannot write files in the background, so there the app only reminds you when no backup has been made for two weeks.</li>
          </ul>
        </section>

        <section aria-labelledby="keys">
          <h2 id="keys" tabIndex={-1}>Keyboard shortcuts</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Where</th>
                  <th>Keys</th>
                  <th>Does</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Analysis</td><td><kbd className="kbd">←</kbd> <kbd className="kbd">→</kbd></td><td>Previous or next move</td></tr>
                <tr><td>Analysis</td><td><kbd className="kbd">Home</kbd> <kbd className="kbd">End</kbd></td><td>First or last position</td></tr>
                <tr><td>Analysis</td><td><kbd className="kbd">[</kbd> <kbd className="kbd">]</kbd></td><td>Previous or next critical moment</td></tr>
                <tr><td>Analysis, Play</td><td><kbd className="kbd">F</kbd></td><td>Flip the board</td></tr>
                <tr><td>Analysis</td><td><kbd className="kbd">E</kbd></td><td>Turn live engine analysis on or off</td></tr>
                <tr><td>Play, trainers</td><td>Move box, then <kbd className="kbd">Enter</kbd></td><td>Play a move by typing it (<code>Nf3</code>, <code>e4</code>, <code>e2e4</code>, <code>O-O</code>): the keyboard-only way to play</td></tr>
                <tr><td>Everywhere</td><td><kbd className="kbd">Tab</kbd></td><td>Move between controls; dialogs trap focus and close with <kbd className="kbd">Esc</kbd></td></tr>
              </tbody>
            </table>
          </div>
          <p>Shortcuts are ignored while you are typing in a text box.</p>
        </section>

        <section aria-labelledby="privacy">
          <h2 id="privacy" tabIndex={-1}>Privacy and your data</h2>
          <ul>
            <li>Games, analyses, puzzles, notes and settings live in this browser&apos;s IndexedDB and localStorage (in the desktop app, in the app&apos;s own data folder). They are not uploaded anywhere.</li>
            <li>The only network traffic the app starts is the Chess.com import you request (including your avatar image, which comes from Chess.com&apos;s image server), and the loading of the app&apos;s own files (the engine included). There is no analytics and no tracking.</li>
            <li>No secrets are stored or needed. The Chess.com username is public.</li>
            <li>Clearing site data in the browser, or private browsing, erases everything. <Link to="/settings">Settings</Link> can download a backup file, restore it, clear the evaluation cache, or delete all data.</li>
          </ul>
        </section>

        <section aria-labelledby="limits">
          <h2 id="limits" tabIndex={-1}>Known limitations</h2>
          <ul>
            <li>The default engine is single-threaded and uses the Lite network, so analysis is slower and slightly weaker than desktop Stockfish. It is still far stronger than any human player.</li>
            <li>Move grades depend on the analysis depth. A move graded &quot;best&quot; at depth 14 may be revised at depth 30.</li>
            <li>Endgame lessons are checked by engine search, not by an endgame tablebase, so a verdict of &quot;won&quot; or &quot;drawn&quot; is engine-verified rather than proven.</li>
            <li>Puzzle answers after the first move must follow the stored engine line.</li>
            <li>The strength model has not been calibrated against an outside dataset; see above.</li>
            <li>Leaving the Play page mid-game (by navigating inside the app) abandons the game without saving. Closing or reloading the tab asks for confirmation first.</li>
            <li>Storage is per browser and per site address. A different browser, device or URL has its own empty copy until you restore a backup.</li>
          </ul>
        </section>
      </article>
    </div>
  );
}
