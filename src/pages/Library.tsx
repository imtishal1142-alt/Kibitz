import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banner, ConfirmDialog, Empty, Field, PageHead, Segmented, downloadText } from '../components/ui';
import { Icon } from '../components/Icon';
import { splitPgn, validateFen } from '../lib/chess/rules';
import { gameFromPgn, isPersonal, resultLabel } from '../lib/games/records';
import { addGames, deleteGames } from '../lib/storage/repos';
import { TIME_CLASS_LABEL, gameDateText } from '../lib/ui/format';
import { useAnalyses, useGames } from '../hooks/data';
import { usePrefs } from '../hooks/usePrefs';
import { enqueueAnalysis } from '../services/analysisQueue';
import { toast } from '../services/toast';
import type { GameRecord, GameSource, TimeClass } from '../lib/types';

type SortKey = 'date' | 'opponent' | 'accuracy' | 'plies';
type Sort = { key: SortKey; dir: 1 | -1 };

const SOURCE_LABEL: Record<GameSource, string> = {
  chesscom: 'Chess.com',
  pgn: 'Imported PGN',
  played: 'Played here',
  'engine-match': 'Engine match',
  demo: 'Demo',
};

export default function Library() {
  const nav = useNavigate();
  const [prefs] = usePrefs();
  const games = useGames();
  const analyses = useAnalyses();

  const [text, setText] = useState('');
  const [source, setSource] = useState<'all' | GameSource>('all');
  const [tc, setTc] = useState<'all' | TimeClass>('all');
  const [outcome, setOutcome] = useState<'all' | 'win' | 'loss' | 'draw'>('all');
  const [state, setState] = useState<'all' | 'analysed' | 'pending'>('all');
  const [sort, setSort] = useState<Sort>({ key: 'date', dir: -1 });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [pgnText, setPgnText] = useState('');
  const [me, setMe] = useState(prefs.chesscomUser);
  const [fen, setFen] = useState('');
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const accuracy = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of games.data ?? []) {
      const a = analyses.data?.find((x) => x.gameId === g.id);
      if (a && g.userColor) m.set(g.id, a.summary[g.userColor].accuracy);
    }
    return m;
  }, [games.data, analyses.data]);

  const rows = useMemo(() => {
    const q = text.trim().toLowerCase();
    const list = (games.data ?? []).filter((g) => {
      if (source !== 'all' && g.source !== source) return false;
      if (tc !== 'all' && g.timeClass !== tc) return false;
      if (outcome !== 'all' && g.userOutcome !== outcome) return false;
      if (state === 'analysed' && !g.analyzed) return false;
      if (state === 'pending' && g.analyzed) return false;
      if (q && !`${g.white} ${g.black} ${g.opening ?? ''} ${g.eco ?? ''} ${g.date} ${g.tags.join(' ')} ${g.termination ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const val = (g: GameRecord): number | string => (sort.key === 'date' ? g.endTime : sort.key === 'plies' ? g.plies : sort.key === 'accuracy' ? (accuracy.get(g.id) ?? -1) : (g.opponent ?? g.black).toLowerCase());
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [games.data, text, source, tc, outcome, state, sort, accuracy]);

  const all = games.data ?? [];
  const sources = [...new Set(all.map((g) => g.source))];
  const timeClasses = [...new Set(all.map((g) => g.timeClass))];
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (-s.dir) as 1 | -1 } : { key, dir: key === 'opponent' ? 1 : -1 }));
  const sortMark = (key: SortKey) => (sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : '');
  const ariaSort = (key: SortKey): 'ascending' | 'descending' | 'none' => (sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none');

  const importPgn = async (raw: string) => {
    const chunks = splitPgn(raw);
    if (!chunks.length) {
      toast.error('No PGN games found in that text.');
      return;
    }
    const recs: GameRecord[] = [];
    const failed: string[] = [];
    chunks.forEach((c, i) => {
      const tag = (name: string) => new RegExp(`\\[${name} "([^"]*)"\\]`).exec(c)?.[1];
      const label = tag('White') && tag('Black') ? `${tag('White')} vs ${tag('Black')}` : `game ${i + 1}`;
      try {
        const g = gameFromPgn(c, { source: 'pgn', userName: me.trim() || undefined });
        if (g.plies === 0) failed.push(`${label} (no moves)`);
        else recs.push(g);
      } catch (e) {
        const raw = e instanceof Error ? e.message : '';
        const move = /^Invalid move in PGN:\s*(\S+)/.exec(raw)?.[1];
        failed.push(`${label} (${move ? `illegal move ${move}` : raw.replace(/^.*?:\s*/, '').slice(0, 60) || 'unreadable'})`);
      }
    });
    const bad = failed.length;
    const failedText = bad ? ` Could not read: ${failed.slice(0, 3).join('; ')}${bad > 3 ? `; and ${bad - 3} more` : ''}.` : '';
    if (!recs.length) {
      toast.error(`None of the ${chunks.length} game${chunks.length === 1 ? '' : 's'} could be read.${failedText}`);
      return;
    }
    const r = await addGames(recs);
    toast.success(`Added ${r.added} game${r.added === 1 ? '' : 's'}${r.duplicates ? `, skipped ${r.duplicates} already saved` : ''}.${failedText}`);
    setPgnText('');
    setImportOpen(false);
    if (r.added === 1 && r.addedIds[0]) nav(`/analysis/${r.addedIds[0]}`);
  };

  const readFiles = async (files: FileList | File[]) => {
    const parts: string[] = [];
    for (const f of Array.from(files)) {
      if (f.size > 40_000_000) {
        toast.error(`${f.name} is larger than 40 MB. Split it first.`);
        continue;
      }
      parts.push(await f.text());
    }
    if (parts.length) await importPgn(parts.join('\n\n'));
  };

  const openFen = () => {
    const f = fen.trim();
    const v = validateFen(f);
    if (!v.ok) {
      toast.error(v.error ?? 'That FEN is not a legal position.');
      return;
    }
    nav(`/analysis?fen=${encodeURIComponent(f)}`);
  };

  const ids = picked.size ? [...picked] : rows.map((r) => r.id);
  const toAnalyse = ids.filter((id) => all.find((g) => g.id === id && !g.analyzed));
  const selectAll = rows.length > 0 && rows.every((r) => picked.has(r.id));

  return (
    <div className="stack">
      <PageHead
        title="Games"
        sub="Everything you have imported or played, kept on this device."
        actions={
          <>
            <button className="btn" type="button" onClick={() => setImportOpen((v) => !v)} aria-expanded={importOpen}>
              <Icon name="upload" /> Add games or a position
            </button>
            <Link className="btn" to="/chesscom">
              <Icon name="cloud" /> Chess.com
            </Link>
          </>
        }
      />

      {importOpen ? (
        <section
          className={`sheet pad stack drop ${drag ? 'drop-active' : ''}`}
          aria-label="Add games"
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void readFiles(e.dataTransfer.files);
          }}
        >
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div className="stack-sm">
              <Field label="Paste PGN (one game or many)" htmlFor="pgn-in" hint="Or drop .pgn files here. Chess.com, Lichess and most databases export this format.">
                <textarea id="pgn-in" className="textarea textarea-mono" rows={7} value={pgnText} onChange={(e) => setPgnText(e.target.value)} placeholder={'[Event "Casual game"]\n[White "You"]\n[Black "Opponent"]\n\n1. e4 e5 2. Nf3 ...'} spellCheck={false} />
              </Field>
              <Field label="Your name in these games (optional)" htmlFor="pgn-me" hint="Lets Kibitz know which side is you, so statistics and puzzles are about your moves.">
                <input id="pgn-me" className="input" value={me} onChange={(e) => setMe(e.target.value)} autoComplete="off" />
              </Field>
              <div className="row">
                <button className="btn btn-primary" type="button" disabled={!pgnText.trim()} onClick={() => void importPgn(pgnText)}>
                  Import pasted PGN
                </button>
                <button className="btn" type="button" onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" /> Choose files
                </button>
                <input ref={fileRef} type="file" accept=".pgn,.txt,text/plain" multiple hidden onChange={(e) => e.target.files && void readFiles(e.target.files)} />
              </div>
            </div>
            <div className="stack-sm">
              <Field label="Open a position from FEN" htmlFor="fen-in" hint="Analyse any position, or set up a board to study. It is checked for legality first.">
                <input id="fen-in" className="input" value={fen} onChange={(e) => setFen(e.target.value)} placeholder="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" spellCheck={false} onKeyDown={(e) => e.key === 'Enter' && openFen()} />
              </Field>
              <div className="row">
                <button className="btn" type="button" disabled={!fen.trim()} onClick={openFen}>
                  Analyse this position
                </button>
              </div>
              <p className="hint">Duplicates are skipped automatically, even across sources: the same moves between the same players are the same game.</p>
            </div>
          </div>
        </section>
      ) : null}

      {games.loading ? null : all.length === 0 ? (
        <Empty
          title="No games yet"
          action={
            <div className="row">
              <button className="btn btn-primary" type="button" onClick={() => setImportOpen(true)}>
                Paste or upload a PGN
              </button>
              <Link className="btn" to="/chesscom">
                Import from Chess.com
              </Link>
              <Link className="btn" to="/play">
                Play a game
              </Link>
            </div>
          }
        >
          Games you import, play or run in the engine lab appear here, ready to analyse.
        </Empty>
      ) : (
        <>
          <section className="sheet pad-sm stack-sm" aria-label="Filters">
            <div className="row">
              <div className="grow" style={{ minWidth: 200 }}>
                <label className="sr-only" htmlFor="q">
                  Search games
                </label>
                <input id="q" className="input" type="search" placeholder="Search opponent, opening, ECO, tag" value={text} onChange={(e) => setText(e.target.value)} />
              </div>
              <label className="sr-only" htmlFor="f-src">
                Source
              </label>
              <select id="f-src" className="select" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
                <option value="all">All sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="f-tc">
                Time control
              </label>
              <select id="f-tc" className="select" value={tc} onChange={(e) => setTc(e.target.value as typeof tc)}>
                <option value="all">All time controls</option>
                {timeClasses.map((t) => (
                  <option key={t} value={t}>
                    {TIME_CLASS_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <Segmented
                label="Result for you"
                value={outcome}
                onChange={setOutcome}
                options={[
                  { value: 'all', label: 'Any result' },
                  { value: 'win', label: 'Wins' },
                  { value: 'draw', label: 'Draws' },
                  { value: 'loss', label: 'Losses' },
                ]}
              />
              <Segmented
                label="Analysis state"
                value={state}
                onChange={setState}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'analysed', label: 'Analysed' },
                  { value: 'pending', label: 'Not analysed' },
                ]}
              />
              <span className="grow" />
              <span className="small muted" aria-live="polite">
                {rows.length} of {all.length} games
              </span>
            </div>
          </section>

          <div className="row">
            <button className="btn btn-primary" type="button" disabled={!toAnalyse.length} onClick={() => enqueueAnalysis(toAnalyse)}>
              <Icon name="insights" /> Analyse {picked.size ? 'selected' : 'shown'}
              {toAnalyse.length ? ` (${toAnalyse.length})` : ''}
            </button>
            <button
              className="btn"
              type="button"
              disabled={!ids.length}
              onClick={() => {
                const chosen = all.filter((g) => ids.includes(g.id));
                downloadText(`kibitz-games-${new Date().toISOString().slice(0, 10)}.pgn`, chosen.map((g) => g.pgn.trim()).join('\n\n') + '\n', 'application/x-chess-pgn');
                toast.success(`Exported ${chosen.length} game${chosen.length === 1 ? '' : 's'} as PGN.`);
              }}
            >
              <Icon name="download" /> Export {picked.size ? 'selected' : 'shown'} PGN
            </button>
            <button className="btn btn-danger" type="button" disabled={!picked.size} onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" /> Delete selected{picked.size ? ` (${picked.size})` : ''}
            </button>
          </div>

          {rows.length === 0 ? (
            <Empty title="No games match these filters">
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setText('');
                  setSource('all');
                  setTc('all');
                  setOutcome('all');
                  setState('all');
                }}
              >
                Clear filters
              </button>
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Saved games. Column headers sort the table.</caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <input type="checkbox" aria-label="Select all shown games" checked={selectAll} onChange={() => setPicked(selectAll ? new Set() : new Set(rows.map((r) => r.id)))} />
                    </th>
                    <th scope="col" aria-sort={ariaSort('date')}>
                      <button type="button" onClick={() => toggleSort('date')}>
                        Date{sortMark('date')}
                      </button>
                    </th>
                    <th scope="col" aria-sort={ariaSort('opponent')}>
                      <button type="button" onClick={() => toggleSort('opponent')}>
                        Opponent{sortMark('opponent')}
                      </button>
                    </th>
                    <th scope="col">Result</th>
                    <th scope="col">Opening</th>
                    <th scope="col">Time</th>
                    <th scope="col" className="right" aria-sort={ariaSort('plies')}>
                      <button type="button" onClick={() => toggleSort('plies')}>
                        Moves{sortMark('plies')}
                      </button>
                    </th>
                    <th scope="col" className="right" aria-sort={ariaSort('accuracy')}>
                      <button type="button" onClick={() => toggleSort('accuracy')}>
                        Accuracy{sortMark('accuracy')}
                      </button>
                    </th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g) => {
                    const acc = accuracy.get(g.id);
                    const mine = g.userColor;
                    return (
                      <tr key={g.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Select ${g.white} vs ${g.black}`}
                            checked={picked.has(g.id)}
                            onChange={() =>
                              setPicked((p) => {
                                const n = new Set(p);
                                if (n.has(g.id)) n.delete(g.id);
                                else n.add(g.id);
                                return n;
                              })
                            }
                          />
                        </td>
                        <td className="nowrap">{gameDateText(g)}</td>
                        <td>
                          <Link to={`/analysis/${g.id}`}>{mine ? (g.opponent ?? (mine === 'w' ? g.black : g.white)) : `${g.white} – ${g.black}`}</Link>
                          {mine ? <span className="muted small"> · as {mine === 'w' ? 'White' : 'Black'}</span> : null}
                          {g.source === 'demo' ? <span className="chip chip-demo" style={{ marginLeft: 6 }}>Demo</span> : null}
                          {g.source !== 'chesscom' && g.source !== 'demo' ? <span className="chip" style={{ marginLeft: 6 }}>{SOURCE_LABEL[g.source]}</span> : null}
                        </td>
                        <td className="nowrap">
                          {g.userOutcome ? <span className={`chip ${g.userOutcome === 'win' ? 'chip-ok' : g.userOutcome === 'loss' ? 'chip-bad' : ''}`}>{g.userOutcome === 'win' ? 'Won' : g.userOutcome === 'loss' ? 'Lost' : 'Drew'}</span> : resultLabel(g)}
                        </td>
                        <td className="ellipsis" style={{ maxWidth: 220 }} title={g.opening}>
                          {g.opening ?? <span className="faint" title="Named once the game has been analysed">—</span>}
                        </td>
                        <td className="nowrap">{g.timeClass === 'unknown' && !g.timeControl ? <span className="faint">—</span> : g.timeControl ? `${TIME_CLASS_LABEL[g.timeClass]} ${g.timeControl}`.replace(/^Unknown /, '') : TIME_CLASS_LABEL[g.timeClass]}</td>
                        <td className="right num">{Math.ceil(g.plies / 2)}</td>
                        <td className="right num">{acc === undefined ? <span className="faint">{g.analyzed ? '—' : 'not analysed'}</span> : `${acc.toFixed(1)}%`}</td>
                        <td className="right nowrap">
                          <button className="btn btn-sm" type="button" onClick={() => (g.analyzed ? nav(`/analysis/${g.id}`) : enqueueAnalysis([g.id]))}>
                            {g.analyzed ? 'Review' : 'Analyse'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {all.some((g) => !isPersonal(g, prefs.includeDemoInStats)) ? <p className="hint">Demo games are shown here but left out of statistics, weaknesses and strength estimates unless you opt in under Settings.</p> : null}
        </>
      )}

      {games.error ? <Banner kind="bad">Could not read saved games: {games.error}</Banner> : null}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${picked.size} game${picked.size === 1 ? '' : 's'}?`}
        danger
        confirmLabel="Delete"
        body={<p>This also removes their analysis and the puzzles made from them. It cannot be undone. Export a backup in Settings first if unsure.</p>}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          const list = [...picked];
          setConfirmDelete(false);
          setPicked(new Set());
          void deleteGames(list).then(() => toast.success(`Deleted ${list.length} game${list.length === 1 ? '' : 's'}.`));
        }}
      />
    </div>
  );
}
