# Strength estimation: methodology

The source is `src/lib/strength/estimate.ts`; the numbers below are the ones in that file.

## The principle

Playing strength cannot be read off a handful of games with certainty, and **move quality alone does not determine a rating**. So the app keeps four things apart, shows them side by side, and never merges them into one number:

1. **Official rating.** What Chess.com reports for each time class, with the date and source of that data. Nothing in the app changes it.
2. **Results-based estimate.** A statistical estimate, with a range, of the rating at which your *actual results against your actual opponents* are most likely.
3. **Performance rating.** The classic arithmetic summary of the same games. Context, not an estimate.
4. **Move-quality statistics.** What the engine measured about your moves: accuracy, average centipawn loss, rates of mistakes and blunders, best-move rate. An *experimental* move-quality-implied rating appears only when strict conditions are met (below).

**There is no formula that turns average centipawn loss or accuracy into Elo.** Published conversions exist, but they come from other populations, other engines and other depths, and no dataset of players with known ratings and engine-analysed games was available here to check any of them. Using one would give a precise-looking number with no defensible basis, so the app does not.

## 1. Results-based estimate

**Input.** Games with a result and a known opponent rating, in one time class (bullet, blitz, rapid or daily are estimated separately; "all" is offered but flagged as a blend). The demo game and games against the built-in engine are excluded (the latter have no opponent rating). Chess960 games are excluded.

**Model.** The Elo logistic model: a player rated *r* is expected to score `1 / (1 + 10^((opponent − r) / 400))` against an opponent. A win counts 1, a draw ½, a loss 0.

**Fit.** The app finds the **maximum a posteriori** rating: the *r* that maximises the likelihood of the observed results, weighted by recency, multiplied by a weak Gaussian prior. Newton iteration, step-limited to 150 points, up to 60 iterations.

- *Prior:* centred on the (recency-weighted) average opponent rating, standard deviation 400. People are usually matched against similar opponents, so this is a reasonable starting guess. It exists so that a perfect or hopeless run of results does not send the estimate to infinity, and its influence fades as games accumulate.
- *Recency:* each game's weight halves every 120 days.

**Range.** The Laplace (normal) approximation to the posterior: the standard deviation is `1/√(information)`, and the range is the estimate ± *z* × that value for the confidence level you choose: 50% (z = 0.674), 80% (1.2816, the default), 90% (1.6449) or 95% (1.96). The range is **never narrowed** by the interface: it is what the data supports.

**Minimum data.** At least **5** rated games in the class; fewer and the app says there is not enough data, and gives no number. The **effective games** (the sum of the recency weights) is reported, and below **20** the range is flagged as wide and provisional. A note says that about 30 or more games are needed for a reasonably narrow range.

**Confidence label.** From the standard deviation: 60 points or less is *good*, up to 110 is *moderate*, anything wider is *low*.

**What it assumes.** That your strength was roughly constant (the recency weighting softens this), that the opponents' ratings are accurate, that results are independent, and that the Elo curve describes outcomes. None of these is exactly true, so the stated range understates the real uncertainty somewhat.

## 2. Performance rating

`average opponent rating + 400 × log10(score / (1 − score))`, with the adjustment capped at ±800 points (the FIDE convention for a 100% or 0% score; the interface says when the cap applied, because then the real figure is not identifiable). It has no prior, no recency weighting and no range, which is why it swings on small samples. It is shown next to the estimate for context only.

## 3. Backtest

With at least **15** rated games (the first 10 are used only as history), the app replays your games in time order. Each game is predicted from the games *before* it only, and the predictions are scored with the **Brier score** (mean squared error of the predicted score; lower is better). Three predictors are compared: this model, your official rating as recorded in each game (when every game has one), and a coin flip (always 0.5). The comparison is printed whichever way it comes out.

This tests how well the method predicted **your own** results. It is not a test against an outside rating list, and a good backtest does not make the move-quality-implied rating any more reliable.

## 4. Move-quality statistics and the experimental implied rating

Statistics are computed over your moves in your analysed games, excluding forced moves: **accuracy** (the Lichess per-move curve `103.1668·e^(−0.04354·loss) − 3.1669`, loss in win-percentage points, clamped to 0 to 100, then averaged), **average centipawn loss** (mate scores capped at ±1000 cp), the rates of blunders and mistakes per 100 moves, and the best-move rate.

**Move-quality-implied rating (experimental).** Instead of an imported formula, the app uses your own games as a small calibration set:

1. For each analysed game, compute the accuracy of *your opponent's* moves (at least 8 non-forced moves per side are needed). Their rating is known and independent of you.
2. Fit a straight line, opponent accuracy against opponent rating, by least squares.
3. Read off which opponent rating would produce *your* average accuracy.

It is shown only if **all** of these hold: at least 25 analysed games; the opponents' ratings span at least 100 points; the fitted slope is clearly positive (more than 0.004 accuracy points per rating point); and enough of 400 bootstrap resamples (at least 200) also give a usable slope. The range is the percentile interval of the 400 bootstrap resamples at your chosen confidence level. Otherwise the interface says which condition failed.

Known weaknesses, all inherited by the number: accuracy depends on position type, on who is winning (the side ahead tends to play more accurately), on game length and on the analysis depth; a sample of 25 to 50 games is small; and the opponents in your history may not span the range that matters. Treat it as a curiosity that may be well off, not a measurement. No test shows that it is accurate.

## What cannot be done

- Predict an over-the-board or FIDE rating. Rating pools differ and the app has no data to bridge them.
- Reconstruct a rating history. Chess.com's public API offers current ratings only, so the sparkline on the Chess.com page is built from the rating recorded after each game you imported, which is the only history the data supports.
- Estimate from engine games, or from very few games.

## Where it is tested

All of the statistics are tested on **synthetic** players whose true rating is known. That checks the mathematics, not accuracy on real people.

- `tests/training.test.ts`: the estimator recovers a known rating, and its 80% range has roughly nominal coverage over repeated simulations; fewer games give wider ranges and the app does not invent precision; perfect and hopeless streaks give finite answers; recent games weigh more; the backtest runs out of sample and reports its baselines; the implied rating is refused without enough data and recovers a *planted* accuracy-rating relationship when there is enough; and the full report keeps the official rating separate and carries its uncertainty notes.
- `tests/data.test.ts`: the performance rating, including the ±800 cap, the all-draws case and the empty case.
- Browser test "from imported games to training": with four games the page shows "Needs 5+ rated games" instead of an estimate, shows the performance rating (0 points against opponents rated 1400 gives 600, flagged as capped), and marks weaknesses from so few games as tentative.

The model has **not** been validated against any real-world rating data.
