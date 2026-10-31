import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Banner, Empty, PageHead, Progress, Spinner, TabPanel, Tabs, copyText, downloadText } from '../components/ui';
import { Board, ARROW_COLORS } from '../components/Board';
import type { BoardArrow, BoardMove, MarkKind } from '../components/Board';
import { EvalBar } from '../components/EvalBar';
import { EvalGraph } from '../components/EvalGraph';
import { Icon } from '../components/Icon';
import { NavControls } from '../components/NavControls';
import { PlayerStrip } from '../components/PlayerStrip';
import { Scoresheet } from '../components/Scoresheet';
import { CLASS_LABEL, isLesson } from '../lib/chess/classify';
import { capturedPieces } from '../lib/chess/captured';
import { cp } from '../lib/chess/eval';
import { loadOpenings, openingAt } from '../lib/chess/openings';
import { START_FEN, parsePgn, validateFen } from '../lib/chess/rules';
import { explainMove, moveLabel } from '../lib/analysis/explain';
import { evalSeries, idbEvalCache } from '../lib/analysis/gameAnalysis';
import { assessMove, findThreat } from '../lib/analysis/assess';
import { LineTree } from '../lib/analysis/lineTree';
import { bumpCalendar, getAnalysis, getGame, putNotebook } from '../lib/storage/repos';
import { RETEST_OK_LOSS, recordRetest } from '../lib/training/retest';
import { markReviewed } from '../lib/training/reviewed';
import { gameSubtitle, gameTitle } from '../lib/ui/format';
import { useLiveAnalysis } from '../hooks/useLiveAnalysis';
import { useHotkeys } from '../hooks/useHotkeys';
import { useQuery } from '../hooks/useQuery';
import { usePrefs } from '../hooks/usePrefs';
import { enqueueAnalysis, queueState } from '../services/analysisQueue';
import { getEngine } from '../services/engines';
import { playSound, soundForSan } from '../services/sound';
import { useStore } from '../services/store';
import { toast } from '../services/toast';
import { CoachPanel, LinesPanel, ReportPanel } from './analysis/panels';
import type { ThreatState } from './analysis/panels';
import { ReviewCard, ReviewSummary } from './analysis/Review';
import { reviewSteps } from '../lib/analysis/review';
import type { RetryState } from './analysis/Review';
import type { Color, GameAnalysis, GameRecord, MoveClass, Score } from '../lib/types';

type Tab = 'coach' | 'lines' | 'report';

export default function Analysis() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const game = useQuery(() => (id ? getGame(id) : Promise.resolve(undefined)), ['games'], [id]);
  const analysis = useQuery(() => (id ? getAnalysis(id) : Promise.resolve(undefined)), ['analyses'], [id]);

  const parsed = useMemo(() => {
    if (!game.data) return null;
    try {
      const p = parsePgn(game.data.pgn);
      return { startFen: p.startFen, ucis: p.moves.map((m) => m.uci), headers: p.headers };
    } catch {
      return 'error' as const;
    }
  }, [game.data]);

  if (id) {
    if (game.loading || analysis.loading) return <Spinner label="Opening the game…" />;
    if (!game.data) return <Empty title="That game is not in your library" action={<Link className="btn" to="/library">Go to Games</Link>}>It may have been deleted, or it was saved in another browser.</Empty>;
    if (parsed === 'error' || !parsed) return <Empty title="This game's moves could not be read" action={<Link className="btn" to="/library">Back to Games</Link>}>The saved PGN contains an illegal or unreadable move.</Empty>;
    return <Workspace key={id} game={game.data} analysis={analysis.data} startFen={parsed.startFen} ucis={parsed.ucis} headers={parsed.headers} initialPly={Number(sp.get('ply') ?? 0) || 0} autoReview={sp.get('review') === '1'} />;
  }
  const fenParam = sp.get('fen');
  const startFen = fenParam && validateFen(fenParam).ok ? fenParam : START_FEN;
  return (
    <>
      {fenParam && startFen === START_FEN ? <Banner kind="warn">The position in the link was not a legal FEN, so the standard start is shown.</Banner> : null}
      <Workspace key={`free-${startFen}`} startFen={startFen} ucis={[]} headers={{}} initialPly={0} />
    </>
  );
}

function sq(uci: string): { from: string; to: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

function Workspace({ game, analysis, startFen, ucis, headers, initialPly, autoReview = false }: { game?: GameRecord; analysis?: GameAnalysis; startFen: string; ucis: string[]; headers: Record<string, string>; initialPly: number; autoReview?: boolean }) {
  const [prefs] = usePrefs();
  const tree = useMemo(() => new LineTree(startFen, ucis), [startFen, ucis]);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const main = tree.mainlineIds();
  const [cur, setCur] = useState<number>(() => main[Math.min(initialPly, main.length - 1)] ?? 0);
  const [orientation, setOrientation] = useState<Color>(game?.userColor ?? 'w');
  const [tab, setTab] = useState<Tab>(analysis ? 'coach' : 'lines');
  const [engineOn, setEngineOn] = useState(true);
  const [showArrows, setShowArrows] = useState(true);
  const [extraArrow, setExtraArrow] = useState<BoardArrow | null>(null);
  const [threatState, setThreatState] = useState<ThreatState | null>(null);
  const [openingsReady, setOpeningsReady] = useState(false);
  const queue = useStore(queueState);
  const autoStarted = useRef(false);
  const threatToken = useRef(0);
  const retryToken = useRef(0);
  const [review, setReview] = useState<{ steps: number[]; i: number } | null>(null);
  const [retry, setRetry] = useState<RetryState | null>(null);

  useEffect(() => {
    void loadOpenings()
      .then(() => setOpeningsReady(true))
      .catch(() => undefined);
  }, []);

  // A game that has never been analysed is analysed as soon as it is opened.
  useEffect(() => {
    if (game && !game.analyzed && !analysis && !autoStarted.current) {
      autoStarted.current = true;
      enqueueAnalysis([game.id]);
    }
  }, [game, analysis]);

  // When a running analysis finishes, bring the coach forward once.
  const hadAnalysis = useRef(!!analysis);
  useEffect(() => {
    if (analysis && !hadAnalysis.current) setTab('coach');
    hadAnalysis.current = !!analysis;
  }, [analysis]);

  const node = tree.node(cur);
  const mainPlyOf = (nid: number): number => {
    let n = tree.node(nid);
    while (!n.main && n.parent !== null) n = tree.node(n.parent);
    return n.ply;
  };
  const mainPly = mainPlyOf(cur);
  const onMain = node.main;
  const moveAn = analysis && onMain && node.ply >= 1 ? analysis.moves[node.ply - 1] : undefined;
  const nextAn = analysis && onMain ? analysis.moves[node.ply] : undefined;
  const storedScore: Score | null = analysis && onMain ? (analysis.positions[node.ply]?.lines[0]?.score ?? null) : null;

  const live = useLiveAnalysis(node.fen, { enabled: engineOn && !threatState?.busy && retry?.phase !== 'busy', depth: prefs.liveDepth, multipv: prefs.multipv });
  const score: Score | null = live.lines[0] && live.depth >= 8 ? live.lines[0].score : storedScore ?? (live.lines[0] ? live.lines[0].score : null);

  const explanation = useMemo(() => (moveAn && analysis ? explainMove(moveAn, analysis) : null), [moveAn, analysis]);

  // Reset one-off board decorations whenever the position changes.
  useEffect(() => {
    setExtraArrow(null);
    threatToken.current++;
  }, [cur]);

  const go = useCallback(
    (nid: number) => {
      if (tree.has(nid)) setCur(nid);
    },
    [tree],
  );
  const prev = () => {
    const p = tree.prev(cur);
    if (p !== null) go(p);
  };
  const next = () => {
    const n = tree.next(cur);
    if (n !== null) go(n);
  };
  const first = () => go(0);
  const last = () => {
    let c = cur;
    for (let n = tree.next(c); n !== null; n = tree.next(c)) c = n;
    go(c);
  };

  const critical = useMemo(() => new Set(analysis ? analysis.moves.filter((m) => m.flags.includes('critical') || m.flags.includes('turning-point')).map((m) => m.ply) : []), [analysis]);
  const sortedKey = useMemo(() => [...(analysis?.keyMoments ?? [])].sort((a, b) => a - b), [analysis]);
  const jumpKey = (dir: 1 | -1) => {
    const t = dir === 1 ? sortedKey.find((p) => p > mainPly) : [...sortedKey].reverse().find((p) => p < mainPly);
    const target = t === undefined ? undefined : tree.mainlineIds()[t];
    if (target !== undefined) go(target);
    else toast.info(dir === 1 ? 'No later critical moment.' : 'No earlier critical moment.');
  };

  useHotkeys({
    ArrowLeft: prev,
    ArrowRight: next,
    Home: first,
    End: last,
    f: () => setOrientation((o) => (o === 'w' ? 'b' : 'w')),
    e: () => setEngineOn((v) => !v),
    '[': () => jumpKey(-1),
    ']': () => jumpKey(1),
  });

  const playUcis = useCallback(
    (from: number, list: string[]) => {
      let c = from;
      for (const u of list) {
        const n = tree.add(c, u);
        if (n === null) break;
        c = n;
      }
      if (c !== from) {
        setCur(c);
        bump();
      }
    },
    [tree, bump],
  );

  const retrying = !!retry && retry.phase === 'try' && !!analysis && onMain && node.ply === retry.ply - 1;
  const onMove = (m: BoardMove): boolean => {
    const gameMove = retrying && analysis ? analysis.moves[retry!.ply - 1] : undefined;
    if (gameMove && m.uci === gameMove.uci) {
      toast.info('That is the move you played in the game. Find a different one.');
      return false;
    }
    const n = tree.add(cur, m.uci);
    if (n === null) return false;
    playSound(soundForSan(m.san));
    setCur(n);
    bump();
    if (gameMove) {
      const my = ++retryToken.current;
      const ply = gameMove.ply;
      setRetry({ ply, phase: 'busy' });
      void (async () => {
        try {
          const engine = await getEngine('live');
          const a = await assessMove(engine, gameMove.fenBefore, m.uci, { depth: 14, cache: idbEvalCache });
          if (!a || my !== retryToken.current) return;
          setRetry({ ply, phase: 'result', result: a });
          const ok = a.winLoss <= RETEST_OK_LOSS;
          playSound(ok ? 'correct' : 'wrong');
          if (game?.userColor === gameMove.color) {
            void recordRetest(game.id, ply, ok, 0);
            void bumpCalendar({ reviews: 1, retests: 1 });
          } else void bumpCalendar({ reviews: 1 });
        } catch (e) {
          if (my === retryToken.current) setRetry({ ply, phase: 'error', error: e instanceof Error ? e.message : 'The engine failed.' });
        }
      })();
    }
    return true;
  };

  const goPly = (ply: number) => {
    const t = tree.mainlineIds()[ply];
    if (t !== undefined) go(t);
  };
  const startReview = () => {
    if (!analysis) return;
    const steps = reviewSteps(analysis, game?.userColor);
    if (!steps.length) return;
    retryToken.current++;
    setRetry(null);
    setReview({ steps, i: 0 });
    goPly(steps[0]!);
    setTab('coach');
  };
  const stepReview = (i: number) => {
    if (!review) return;
    retryToken.current++;
    setRetry(null);
    if (i >= review.steps.length) {
      setReview(null);
      if (game) {
        void markReviewed(game.id);
        void bumpCalendar({ gamesReviewed: 1 });
      }
      toast.success('Review finished. Well done for going through it.');
      return;
    }
    const k = Math.max(0, i);
    setReview({ ...review, i: k });
    goPly(review.steps[k]!);
  };
  const exitReview = () => {
    retryToken.current++;
    setReview(null);
    setRetry(null);
  };
  const autoStartedReview = useRef(false);
  useEffect(() => {
    if (autoReview && analysis && !autoStartedReview.current) {
      autoStartedReview.current = true;
      startReview();
    }
  });
  const reviewMove = analysis && review ? analysis.moves[(review.steps[review.i] ?? 0) - 1] : undefined;
  const retryMove = () => {
    if (!reviewMove) return;
    retryToken.current++;
    goPly(reviewMove.ply - 1);
    setRetry({ ply: reviewMove.ply, phase: 'try' });
  };
  const showBestMove = () => {
    if (!reviewMove?.bestUci) return;
    retryToken.current++;
    const parent = tree.mainlineIds()[reviewMove.ply - 1];
    if (parent !== undefined) playUcis(parent, [reviewMove.bestUci]);
    setRetry(null);
  };

  const findThreatNow = async () => {
    const my = ++threatToken.current;
    const fen = node.fen;
    setThreatState({ fen, busy: true, report: null });
    try {
      const engine = await getEngine('live');
      const report = await findThreat(engine, fen, { depth: 14 });
      if (my !== threatToken.current) return;
      setThreatState({ fen, busy: false, report, error: report ? undefined : 'The engine was interrupted before it finished. Try again.' });
    } catch (e) {
      if (my !== threatToken.current) return;
      setThreatState({ fen, busy: false, report: null, error: e instanceof Error ? e.message : 'The threat check failed.' });
    }
  };

  const classes = useMemo(() => {
    const out: Record<number, MoveClass> = {};
    for (const m of analysis?.moves ?? []) out[m.ply] = m.cls;
    return out;
  }, [analysis]);

  const values = useMemo(() => (analysis ? evalSeries(analysis) : []), [analysis]);
  const marks = useMemo(() => (analysis ? analysis.moves.filter((m) => m.cls === 'mistake' || m.cls === 'blunder' || m.cls === 'miss' || m.cls === 'brilliant' || m.cls === 'great').map((m) => ({ ply: m.ply, cls: m.cls })) : []), [analysis]);

  const arrows: BoardArrow[] = [];
  if (showArrows) {
    const best = live.lines[0]?.pv[0] ?? nextAn?.bestUci ?? null;
    if (best) arrows.push({ ...sq(best), color: ARROW_COLORS.best });
    if (nextAn && nextAn.uci !== best) arrows.push({ ...sq(nextAn.uci), color: isLesson(nextAn.cls) ? ARROW_COLORS.bad : ARROW_COLORS.info });
  }
  if (extraArrow) arrows.push(extraArrow);

  const marksMap: Record<string, MarkKind> = {};
  if (moveAn && node.uci) marksMap[node.uci.slice(2, 4)] = isLesson(moveAn.cls) ? 'bad' : moveAn.cls === 'best' || moveAn.cls === 'excellent' || moveAn.cls === 'brilliant' || moveAn.cls === 'great' ? 'good' : 'info';
  const badgeCls = moveAn && node.uci && moveAn.cls !== 'excellent' && moveAn.cls !== 'good' && moveAn.cls !== 'forced' ? moveAn.cls : null;

  const cap = capturedPieces(node.fen);
  const strip = (c: Color) => ({
    name: c === 'w' ? (game?.white ?? 'White') : (game?.black ?? 'Black'),
    rating: c === 'w' ? game?.whiteElo : game?.blackElo,
    captured: c === 'w' ? cap.byWhite : cap.byBlack,
    balance: c === 'w' ? Math.max(0, cap.balance) : Math.max(0, -cap.balance),
    note: game?.userColor === c ? 'You' : undefined,
  });
  const top: Color = orientation === 'w' ? 'b' : 'w';
  const bottom: Color = orientation;

  const opening = analysis?.opening && onMain && node.ply >= analysis.opening.plies ? `${analysis.opening.name} (${analysis.opening.eco})` : openingsReady ? (openingAt(node.fen)?.name ?? null) : null;

  const pgn = () => {
    const h: Record<string, string> = { ...headers };
    delete h['FEN'];
    delete h['SetUp'];
    if (!h['Event']) h['Event'] = 'Kibitz analysis';
    return tree.toPgn(h, game?.result ?? headers['Result'] ?? '*');
  };

  const saveToNotebook = () => {
    const now = Date.now();
    void putNotebook({ id: `nb-${now.toString(36)}`, fen: node.fen, title: node.san ? `After ${tree.label(cur)}` : 'Starting position', note: '', tags: game ? [game.id] : [], variations: [], createdAt: now, updatedAt: now })
      .then(() => toast.success('Saved to your Position Notebook.'))
      .catch(() => toast.error('Could not save the position.'));
  };

  const running = queue.running && game && queue.current?.gameId === game.id;
  const queuedErr = game ? queue.errors.find((e) => e.gameId === game.id) : undefined;
  const lastLabel = node.san ? `after ${tree.label(cur)}` : 'at the start';
  const depthShown = prefs.liveDepth;

  return (
    <div className="stack">
      <PageHead
        title={game ? gameTitle(game) : 'Analysis board'}
        sub={game ? gameSubtitle(game) : 'A free board: play moves, try ideas and let the engine check them.'}
        actions={
          <>
            {game?.url ? (
              <a className="btn" href={game.url} target="_blank" rel="noreferrer noopener">
                <Icon name="link" /> Original game
              </a>
            ) : null}
            <Link className="btn" to={`/play?fen=${encodeURIComponent(node.fen)}`}>
              <Icon name="play" /> Play from here
            </Link>
          </>
        }
      />
      {game?.source === 'demo' ? <Banner kind="info">This is a built-in demo game (Morphy&apos;s Opera Game, 1858), not one of yours. It is left out of your statistics.</Banner> : null}
      {game && !analysis ? (
        running ? (
          <Banner kind="info" role="status">
            <div className="stack-sm" style={{ width: '100%' }}>
              <div>
                Analysing this game: position {queue.current?.positions ?? 0} of {queue.current?.positionsTotal ?? '…'} at depth {queue.depth}. You can already move around and play variations.
              </div>
              <Progress value={queue.current && queue.current.positionsTotal ? queue.current.positions / queue.current.positionsTotal : 0} label="Game analysis progress" />
            </div>
          </Banner>
        ) : queuedErr ? (
          <Banner kind="bad" role="alert">
            <div>
              Analysis stopped: {queuedErr.message}{' '}
              <button className="btn btn-sm" type="button" onClick={() => enqueueAnalysis([game.id])}>
                Try again
              </button>
            </div>
          </Banner>
        ) : (
          <Banner kind="info">
            <div className="row">
              <span>This game has not been analysed yet.</span>
              <button className="btn btn-sm btn-primary" type="button" onClick={() => enqueueAnalysis([game.id])}>
                Analyse now
              </button>
            </div>
          </Banner>
        )
      ) : null}

      <div className="analysis">
        <div className="stack-sm">
          <PlayerStrip {...strip(top)} color={top} />
          <div className="board-shell">
            <EvalBar score={score ?? (analysis ? null : cp(0))} orientation={orientation} depth={live.depth || analysis?.depth} />
            <div className="board-col">
              <div className="board-wrap">
                <Board resizable fen={node.fen} orientation={orientation} movable="both" onMove={onMove} lastMove={node.uci ? sq(node.uci) : null} arrows={arrows} marks={marksMap} badge={badgeCls && node.uci ? { square: node.uci.slice(2, 4), cls: badgeCls } : null} ariaLabel={`Analysis board, position ${lastLabel}. ${node.fen.split(' ')[1] === 'w' ? 'White' : 'Black'} to move.`} />
              </div>
            </div>
          </div>
          <PlayerStrip {...strip(bottom)} color={bottom} />
          <NavControls onFirst={first} onPrev={prev} onNext={next} onLast={last} onFlip={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} canPrev={tree.prev(cur) !== null} canNext={tree.next(cur) !== null} />
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn btn-sm" type="button" aria-pressed={showArrows} onClick={() => setShowArrows((v) => !v)}>
              <Icon name="target" /> Arrows {showArrows ? 'on' : 'off'}
            </button>
            {analysis ? (
              <>
                <button className="btn btn-sm" type="button" onClick={() => jumpKey(-1)} title="Previous critical moment ([)">
                  <Icon name="left" /> Critical
                </button>
                <button className="btn btn-sm" type="button" onClick={() => jumpKey(1)} title="Next critical moment (])">
                  Critical <Icon name="right" />
                </button>
              </>
            ) : null}
            <button
              className="btn btn-sm"
              type="button"
              onClick={() =>
                void copyText(node.fen).then((ok) => (ok ? toast.success('FEN copied.') : toast.error('Could not copy. Select the FEN in the Lines tab instead.')))
              }
            >
              <Icon name="copy" /> FEN
            </button>
            <button className="btn btn-sm" type="button" onClick={() => void copyText(pgn()).then((ok) => (ok ? toast.success('PGN copied, including your variations.') : toast.error('Could not copy the PGN.')))}>
              <Icon name="copy" /> PGN
            </button>
            <button className="btn btn-sm" type="button" onClick={() => downloadText(`${(game ? gameTitle(game) : 'analysis').replace(/[^\w-]+/g, '_')}.pgn`, pgn() + '\n', 'application/x-chess-pgn')}>
              <Icon name="download" /> Save PGN
            </button>
            <button className="btn btn-sm" type="button" onClick={saveToNotebook}>
              <Icon name="note" /> Notebook
            </button>
          </div>
          {analysis ? (
            <EvalGraph
              values={values}
              current={mainPly}
              marks={marks}
              onSelect={(p) => {
                const t = tree.mainlineIds()[p];
                if (t !== undefined) go(t);
              }}
              describe={(p) => {
                const m = analysis.moves[p - 1];
                return m ? `${moveLabel(m)}: ${CLASS_LABEL[m.cls]}` : 'Start';
              }}
            />
          ) : null}
          <p className="hint" style={{ textAlign: 'center' }}>
            Keys: <span className="kbd">←</span> <span className="kbd">→</span> step, <span className="kbd">Home</span> <span className="kbd">End</span> ends, <span className="kbd">F</span> flip, <span className="kbd">E</span> engine, <span className="kbd">[</span> <span className="kbd">]</span> critical moments.
          </p>
        </div>

        <div className="stack-sm">
          {analysis ? (
            review && reviewMove ? (
              <ReviewCard
                index={review.i}
                total={review.steps.length}
                move={reviewMove}
                explanation={explainMove(reviewMove, analysis)}
                retry={retry}
                mine={!game?.userColor || reviewMove.color === game.userColor}
                onRetry={retryMove}
                onShowBest={showBestMove}
                onPrev={() => stepReview(review.i - 1)}
                onNext={() => stepReview(review.i + 1)}
                onExit={exitReview}
              />
            ) : (
              <ReviewSummary analysis={analysis} game={game} userColor={game?.userColor} compact={!(onMain && node.ply === 0)} steps={reviewSteps(analysis, game?.userColor).length} onStart={startReview} onOpenReport={() => setTab('report')} />
            )
          ) : null}
          <section className="sheet" aria-label="Moves">
            <Scoresheet
              tree={tree}
              version={version}
              current={cur}
              onSelect={go}
              classes={classes}
              critical={critical}
              onDeleteVariation={(vid) => {
                const parent = tree.node(vid).parent;
                const inside = tree.pathTo(cur).includes(vid);
                if (tree.remove(vid)) {
                  if (inside && parent !== null) setCur(parent);
                  bump();
                }
              }}
            />
          </section>
          <section className="sheet">
            <Tabs
              label="Analysis panels"
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'coach', label: 'Coach' },
                { id: 'lines', label: 'Engine lines' },
                { id: 'report', label: 'Game report' },
              ]}
            />
            <TabPanel id="coach" active={tab === 'coach'}>
              <CoachPanel
                explanation={explanation}
                move={moveAn}
                hasAnalysis={!!analysis}
                opening={opening}
                fen={node.fen}
                threatState={threatState}
                onFindThreat={() => void findThreatNow()}
                onShowThreat={(u) => setExtraArrow({ ...sq(u), color: ARROW_COLORS.info })}
                onPlayBest={() => {
                  if (!moveAn?.bestUci || node.parent === null) return;
                  playUcis(node.parent, [moveAn.bestUci]);
                }}
                onPlayBestLine={(i) => {
                  if (!moveAn || node.parent === null || !analysis) return;
                  playUcis(node.parent, (analysis.positions[moveAn.ply - 1]?.lines[0]?.pv ?? []).slice(0, i + 1));
                }}
                onPlayRefutation={(i) => {
                  if (!moveAn || !analysis) return;
                  playUcis(cur, (analysis.positions[moveAn.ply]?.lines[0]?.pv ?? []).slice(0, i + 1));
                }}
              />
            </TabPanel>
            <TabPanel id="lines" active={tab === 'lines'}>
              <LinesPanel live={live} fen={node.fen} enabled={engineOn} onToggle={() => setEngineOn((v) => !v)} onPlay={(list) => playUcis(cur, list)} depthTarget={depthShown} />
            </TabPanel>
            <TabPanel id="report" active={tab === 'report'}>
              {analysis ? (
                <ReportPanel
                  analysis={analysis}
                  game={game}
                  userColor={game?.userColor}
                  busy={!!running}
                  onJump={(p) => {
                    const t = tree.mainlineIds()[p];
                    if (t !== undefined) go(t);
                    setTab('coach');
                  }}
                  onReanalyse={() => game && enqueueAnalysis([game.id], { preset: 'deep', force: true })}
                />
              ) : (
                <p className="pad muted" style={{ margin: 0 }}>
                  {game ? 'The report appears when the analysis finishes.' : 'Open a saved game to get a report. The free board has none.'}
                </p>
              )}
            </TabPanel>
          </section>
        </div>
      </div>
    </div>
  );
}
