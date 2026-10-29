import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Banner, ConfirmDialog, Dialog, Field, PageHead, Segmented, Spinner, downloadText } from '../components/ui';
import { Icon } from '../components/Icon';
import { cores, loadManifest, workerCount } from '../lib/engine/transport';
import type { EngineManifest } from '../lib/engine/transport';
import { PRESETS, BOARD_THEMES, DEFAULT_PREFS, resetPrefs } from '../lib/storage/prefs';
import type { PresetId, ThemeChoice } from '../lib/storage/prefs';
import { BackupError, clearAllData, exportBackup, importBackup, parseBackup, storageUsage } from '../lib/storage/backup';
import type { BackupFile } from '../lib/storage/backup';
import { AutoBackup } from '../components/AutoBackup';
import { noteManualBackup } from '../lib/storage/autoBackup';
import { clearEvalCache } from '../lib/storage/repos';
import { formatDateTime } from '../lib/ui/format';
import { useQuery } from '../hooks/useQuery';
import { usePrefs } from '../hooks/usePrefs';
import { engineStates, restartEngine, SLOT_IDS } from '../services/engines';
import type { SlotId } from '../services/engines';
import { playSound } from '../services/sound';
import { useStore } from '../services/store';
import { toast } from '../services/toast';

const SLOT_LABEL: Record<SlotId, string> = {
  live: 'Analysis board, hints and move grading',
  batch: 'Game analysis queue',
  batch2: 'Game analysis queue, second engine',
  batch3: 'Game analysis queue, third engine',
  batch4: 'Game analysis queue, fourth engine',
  a: 'Opponent A (playing the engine, Endgame Lab)',
  b: 'Opponent B (engine matches)',
};

const STORE_LABEL: Record<string, string> = {
  games: 'Games',
  analyses: 'Game analyses',
  evalCache: 'Cached engine evaluations',
  puzzles: 'Puzzles',
  puzzleSrs: 'Puzzle review schedule',
  attempts: 'Puzzle attempts',
  notebook: 'Notebook entries',
  repertoire: 'Repertoire lines',
  strength: 'Strength snapshots',
  reflections: 'Reflections',
  profiles: 'Chess.com profiles',
  archives: 'Chess.com archive records',
  calendar: 'Training calendar days',
  kv: 'Other settings and match series',
};

const HASH_CHOICES = [16, 32, 64, 128, 256];
const bytes = (n?: number): string => (n === undefined ? 'unknown' : n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} kB`);

export default function Settings() {
  const [prefs, set] = usePrefs();
  const engines = useStore(engineStates);
  const [manifest, setManifest] = useState<EngineManifest | null>(null);
  const usage = useQuery(storageUsage, ['games', 'analyses', 'evalCache', 'puzzles', 'puzzleSrs', 'attempts', 'notebook', 'repertoire', 'strength', 'reflections', 'profiles', 'archives', 'calendar', 'kv']);
  const [busy, setBusy] = useState('');
  const [includeCache, setIncludeCache] = useState(false);
  const [pending, setPending] = useState<{ file: BackupFile; name: string } | null>(null);
  const [importError, setImportError] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmCache, setConfirmCache] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [typed, setTyped] = useState('');
  const [keepPrefs, setKeepPrefs] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    void loadManifest().then((m) => live && setManifest(m));
    return () => {
      live = false;
    };
  }, []);

  const doExport = async () => {
    setBusy('export');
    try {
      const data = await exportBackup({ includeEvalCache: includeCache });
      downloadText(`kibitz-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json');
      void noteManualBackup();
      toast.success('Backup downloaded. Keep it somewhere safe: it holds all your games and notes.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The backup failed.');
    } finally {
      setBusy('');
    }
  };

  const onPick = async (file: File | undefined) => {
    setImportError('');
    setPending(null);
    if (!file) return;
    try {
      setPending({ file: parseBackup(await file.text()), name: file.name });
    } catch (e) {
      setImportError(e instanceof BackupError ? e.message : 'The file could not be read.');
    }
  };

  const doImport = async (mode: 'merge' | 'replace') => {
    if (!pending) return;
    setBusy('import');
    try {
      const counts = await importBackup(pending.file, mode);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      toast.success(mode === 'merge' ? `Merged ${total} new records. Anything already here was left alone.` : `Restored ${total} records.`);
      setPending(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      toast.error(e instanceof Error ? `Restore failed: ${e.message}` : 'Restore failed.');
    } finally {
      setBusy('');
    }
  };

  const doClear = async () => {
    setBusy('clear');
    try {
      await clearAllData({ keepPrefs });
      toast.success('All data removed from this browser.');
      setConfirmClear(false);
      setTyped('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not clear the data.');
    } finally {
      setBusy('');
    }
  };

  const flavorNote = manifest?.flavors.find((f) => f.id === prefs.flavor);
  const preset = PRESETS[prefs.analysisPreset];
  const used = usage.data;

  return (
    <div className="stack">
      <PageHead title="Settings" sub="Everything here is saved in this browser only." actions={<Link className="btn" to="/help">Help and methods</Link>} />

      <section className="sheet pad stack" aria-labelledby="set-look">
        <h2 id="set-look" style={{ fontSize: '1.15rem' }}>Appearance</h2>
        <div className="grid-2">
          <div className="stack-sm">
            <div className="label" id="set-theme-l">Theme</div>
            <Segmented<ThemeChoice> label="Theme" value={prefs.theme} onChange={(theme) => set({ theme })} options={[{ value: 'system', label: 'Match system' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </div>
          <div className="stack-sm">
            <div className="label">Animation</div>
            <Segmented<'system' | 'on' | 'off'>
              label="Reduce motion"
              value={prefs.reducedMotion}
              onChange={(reducedMotion) => set({ reducedMotion })}
              options={[{ value: 'system', label: 'Follow system' }, { value: 'on', label: 'Reduce' }, { value: 'off', label: 'Full' }]}
            />
          </div>
        </div>
        <div className="stack-sm">
          <div className="label" id="set-board-l">Board colours</div>
          <div className="row" role="group" aria-labelledby="set-board-l">
            {Object.entries(BOARD_THEMES).map(([id, t]) => (
              <button key={id} type="button" className="btn btn-sm" aria-pressed={prefs.boardTheme === id} onClick={() => set({ boardTheme: id })} style={prefs.boardTheme === id ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 2px var(--accent-tint)' } : undefined}>
                <span aria-hidden style={{ display: 'inline-grid', gridTemplateColumns: '10px 10px', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--line)' }}>
                  <i style={{ background: t.light, height: 10 }} />
                  <i style={{ background: t.dark, height: 10 }} />
                  <i style={{ background: t.dark, height: 10 }} />
                  <i style={{ background: t.light, height: 10 }} />
                </span>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="stack-sm">
          <div className="label">Pieces</div>
          <Segmented<'classic' | 'glyph'> label="Piece set" value={prefs.pieceSet} onChange={(pieceSet) => set({ pieceSet })} options={[{ value: 'classic', label: 'Classic' }, { value: 'glyph', label: 'Letter glyphs' }]} />
          <p className="hint" style={{ margin: 0 }}>Letter glyphs are plain text symbols. They stay legible on very small screens and when colours are hard to tell apart.</p>
        </div>
        <div className="grid-2">
          <label className="check"><input type="checkbox" checked={prefs.coordinates} onChange={(e) => set({ coordinates: e.target.checked })} /> <span>Show file and rank letters on the board</span></label>
          <label className="check"><input type="checkbox" checked={prefs.highlightMoves} onChange={(e) => set({ highlightMoves: e.target.checked })} /> <span>Highlight the last move</span></label>
          <label className="check"><input type="checkbox" checked={prefs.legalMoveDots} onChange={(e) => set({ legalMoveDots: e.target.checked })} /> <span>Show legal-move dots when a piece is picked up</span></label>
          <label className="check"><input type="checkbox" checked={prefs.animations} onChange={(e) => set({ animations: e.target.checked })} /> <span>Animate piece movement</span></label>
          <label className="check"><input type="checkbox" checked={prefs.autoQueen} onChange={(e) => set({ autoQueen: e.target.checked })} /> <span>Promote to a queen automatically (otherwise you choose)</span></label>
        </div>
        <div className="row">
          <label className="check"><input type="checkbox" checked={prefs.sounds} onChange={(e) => (set({ sounds: e.target.checked }), e.target.checked && window.setTimeout(() => playSound('move'), 50))} /> <span>Sounds</span></label>
          <label htmlFor="set-vol" className="small muted" style={{ marginLeft: 8 }}>Volume</label>
          <input id="set-vol" type="range" min={0} max={1} step={0.05} value={prefs.soundVolume} disabled={!prefs.sounds} onChange={(e) => set({ soundVolume: Number(e.target.value) })} style={{ accentColor: 'var(--accent)', maxWidth: 160 }} />
          <button className="btn btn-sm" type="button" disabled={!prefs.sounds} onClick={() => playSound('capture')}>Test</button>
        </div>
      </section>

      <section className="sheet pad stack" aria-labelledby="set-engine">
        <h2 id="set-engine" style={{ fontSize: '1.15rem' }}>Engine</h2>
        <p className="muted" style={{ margin: 0 }}>
          Stockfish runs inside your browser in a background worker. Nothing is sent to a server. Changing the build or memory restarts the engines the next time they are needed.
        </p>
        <div className="grid-2">
          <Field label="Stockfish build" htmlFor="set-flavor" hint={flavorNote ? `${flavorNote.note} Download about ${bytes(flavorNote.bytes)}.` : undefined}>
            <select id="set-flavor" className="select" value={prefs.flavor} onChange={(e) => set({ flavor: e.target.value, flavorChosen: true })}>
              <option value="auto">Automatic (recommended)</option>
              {(manifest?.flavors ?? [{ id: 'lite-wasm', label: 'Stockfish 19 Lite (WebAssembly)' }]).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Engine for game review" htmlFor="set-review-flavor" hint="Used when analysing games and generating puzzles. New analyses record which engine made them. Only Stockfish builds are bundled; other engines (Lc0, Maia) are not available in this app.">
            <select id="set-review-flavor" className="select" value={prefs.reviewFlavor} onChange={(e) => set({ reviewFlavor: e.target.value })}>
              <option value="same">Same as the build above</option>
              {(manifest?.flavors ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hash memory" htmlFor="set-hash" hint="The engine's transposition table. More helps deep analysis a little; it costs RAM per running engine.">
            <select id="set-hash" className="select" value={prefs.hashMb} onChange={(e) => set({ hashMb: Number(e.target.value) })}>
              {(HASH_CHOICES.includes(prefs.hashMb) ? HASH_CHOICES : [...HASH_CHOICES, prefs.hashMb].sort((a, b) => a - b)).map((h) => (
                <option key={h} value={h}>
                  {h} MB
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="stack-sm">
          <div className="label">Game analysis depth</div>
          <Segmented<PresetId> label="Analysis depth" value={prefs.analysisPreset} onChange={(analysisPreset) => set({ analysisPreset })} options={(Object.keys(PRESETS) as PresetId[]).map((id) => ({ value: id, label: PRESETS[id].label }))} />
          <p className="hint" style={{ margin: 0 }}>{preset.hint} Saved analyses record the depth they used. Changing it does not alter old results; re-analyse a game to apply it.</p>
        </div>
        <div className="stack-sm">
          <div className="label">Speed and background analysis</div>
          <label className="row-nowrap">
            <input type="checkbox" checked={prefs.autoAnalyse} onChange={(e) => set({ autoAnalyse: e.target.checked })} />
            <span>Analyse my games automatically in the background</span>
          </label>
          <p className="hint" style={{ margin: 0 }}>
            When the app opens, or after you import games, games of yours that have no analysis are queued, newest first. Results are saved one game at a time, so closing the tab loses nothing. It uses processor time while it runs; turn it off on a slow computer or on battery. It stays off when your browser asks for data saving or the battery is low.
          </p>
          <div className="grid-2">
            <Field label="Games queued automatically" htmlFor="set-auto-limit" hint="Only your newest games are queued, which is where most of the value is. You can still analyse any game by hand from Games.">
              <select id="set-auto-limit" className="select" value={prefs.autoAnalyseLimit} onChange={(e) => set({ autoAnalyseLimit: Number(e.target.value) })}>
                {[50, 100, 200, 500, 0].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? 'All of them' : `Newest ${n}`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Games analysed at once" htmlFor="set-workers" hint={`Each uses its own engine. Automatic picks ${workerCount(0)} for this computer (${cores()} cores reported). More is faster until the cores run out, and it uses more memory.`}>
              <select id="set-workers" className="select" value={prefs.analysisWorkers} onChange={(e) => set({ analysisWorkers: Number(e.target.value) })}>
                <option value={0}>Automatic</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            Positions the engine has already analysed, in any game, are reused instead of analysed again, as long as the saved result is at least as deep as needed. Opening positions repeat a lot, so this helps most early in games. Clear this in Storage below if you ever want a fresh start.
          </p>
        </div>
        <div className="grid-2">
          <Field label={`Live analysis depth: ${prefs.liveDepth}`} htmlFor="set-ldepth" hint="How deep the analysis board searches before it stops.">
            <input id="set-ldepth" type="range" min={8} max={30} step={1} value={prefs.liveDepth} onChange={(e) => set({ liveDepth: Number(e.target.value) })} style={{ accentColor: 'var(--accent)' }} />
          </Field>
          <Field label={`Lines shown on the analysis board: ${prefs.multipv}`} htmlFor="set-mpv" hint="Each extra line slows the search a little.">
            <input id="set-mpv" type="range" min={1} max={5} step={1} value={prefs.multipv} onChange={(e) => set({ multipv: Number(e.target.value) })} style={{ accentColor: 'var(--accent)' }} />
          </Field>
        </div>
        <div>
          <div className="label">Engine status</div>
          <ul className="list-plain list-rows" aria-label="Engine status">
            {SLOT_IDS.filter((id) => !/^batch[234]$/.test(id) || engines[id].status !== 'idle').map((id) => {
              const s = engines[id];
              return (
                <li key={id} className="row-nowrap" style={{ alignItems: 'flex-start' }}>
                  <span className="grow">
                    <strong>{SLOT_LABEL[id]}</strong>
                    <div className="small muted">
                      {s.status === 'idle' ? 'Not started yet. It starts when something needs it.' : null}
                      {s.status === 'loading' ? 'Starting…' : null}
                      {s.status === 'ready' ? `${s.name ?? 'Stockfish'} · ${s.flavor?.label ?? ''}` : null}
                      {s.status === 'error' ? <span style={{ color: 'var(--c-blunder)' }}>Failed: {s.error}</span> : null}
                    </div>
                    {s.note ? <div className="small" style={{ color: 'var(--c-inaccuracy)' }}>{s.note}</div> : null}
                  </span>
                  {s.status !== 'idle' ? (
                    <button className="btn btn-sm" type="button" onClick={() => void restartEngine(id).then(() => toast.info('Engine restarted.')).catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Restart failed.'))}>
                      <Icon name="refresh" /> Restart
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="hint">
            Engine: Stockfish {manifest?.stockfishVersion ?? '19'} ({manifest?.license ?? 'GPL-3.0'}), single-threaded. This app is released under the GPL-3.0-or-later for that reason.
          </p>
        </div>
      </section>

      <section className="sheet pad stack" aria-labelledby="set-train">
        <h2 id="set-train" style={{ fontSize: '1.15rem' }}>Training and statistics</h2>
        <div className="grid-2">
          <Field label="Daily puzzle goal" htmlFor="set-goal" hint="Used by the Home plan and the training calendar.">
            <input id="set-goal" className="input" type="number" min={1} max={200} value={prefs.dailyGoal} onChange={(e) => set({ dailyGoal: Math.max(1, Math.min(200, Math.round(Number(e.target.value)) || DEFAULT_PREFS.dailyGoal)) })} />
          </Field>
          <Field label="Chess.com username" htmlFor="set-user" hint="Used to know which side is you in games you import and play. It is a public username, not a login.">
            <input id="set-user" className="input" value={prefs.chesscomUser} autoComplete="off" spellCheck={false} onChange={(e) => set({ chesscomUser: e.target.value.trim() })} placeholder="e.g. magnuscarlsen" />
          </Field>
        </div>
        <label className="check">
          <input type="checkbox" checked={prefs.includeDemoInStats} onChange={(e) => set({ includeDemoInStats: e.target.checked })} />
          <span>Count the demo game in my statistics (normally it is left out because it is not your game)</span>
        </label>
      </section>

      <section className="sheet pad stack" aria-labelledby="set-data">
        <h2 id="set-data" style={{ fontSize: '1.15rem' }}>Privacy and your data</h2>
        <Banner kind="info" icon="shield">
          Your games, analyses, notes and settings are stored in this browser (IndexedDB and localStorage). There is no account and no server of ours. The only network request the app makes on its own is to Chess.com&apos;s public data API, and only when you ask it to import. Clearing site data in the browser, or using a private window, removes everything unless you have a backup.
        </Banner>
        <div>
          <div className="label">What is stored</div>
          {usage.loading ? (
            <Spinner label="Counting…" />
          ) : used ? (
            <>
              <table className="table" aria-label="Stored data">
                <tbody>
                  {Object.entries(STORE_LABEL).map(([k, label]) => (
                    <tr key={k}>
                      <th scope="row" style={{ fontWeight: 400 }}>{label}</th>
                      <td style={{ textAlign: 'right' }}>{used.counts[k] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {used.usage !== undefined ? <p className="hint">Browser reports about {bytes(used.usage)} used{used.quota ? ` of roughly ${bytes(used.quota)} available to this site` : ''}. These are estimates.</p> : null}
            </>
          ) : (
            <p className="muted">Storage could not be read. {usage.error}</p>
          )}
        </div>

        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="stack-sm">
            <h3 style={{ fontSize: '1rem' }}>Back up</h3>
            <p className="muted small" style={{ margin: 0 }}>Downloads one JSON file with your games, analyses, puzzles, notes, repertoire, calendar and settings.</p>
            <label className="check"><input type="checkbox" checked={includeCache} onChange={(e) => setIncludeCache(e.target.checked)} /> <span>Also include cached engine evaluations (large; they can be recomputed)</span></label>
            <div>
              <button className="btn btn-primary" type="button" disabled={busy !== ''} onClick={() => void doExport()}>
                <Icon name="download" /> Download backup
              </button>
            </div>
          </div>
          <div className="stack-sm">
            <h3 style={{ fontSize: '1rem' }}>Restore</h3>
            <label className="sr-only" htmlFor="set-restore">Choose a backup file</label>
            <input ref={fileRef} id="set-restore" className="input" type="file" accept="application/json,.json" onChange={(e) => void onPick(e.target.files?.[0])} />
            {importError ? <p role="alert" className="small" style={{ margin: 0, color: 'var(--c-blunder)' }}>{importError}</p> : null}
            {pending ? (
              <div className="stack-sm">
                <p className="small" style={{ margin: 0 }}>
                  <strong>{pending.name}</strong>: exported {formatDateTime(Date.parse(pending.file.exportedAt) || Date.now())}, {Object.values(pending.file.stores).reduce((n, rows) => n + (rows?.length ?? 0), 0)} records.
                </p>
                <div className="row">
                  <button className="btn" type="button" disabled={busy !== ''} onClick={() => void doImport('merge')}>Merge into my data</button>
                  <button className="btn btn-danger" type="button" disabled={busy !== ''} onClick={() => setConfirmReplace(true)}>Replace my data</button>
                </div>
                <p className="hint" style={{ margin: 0 }}>Merge adds what is missing and keeps what you have; games already present are not duplicated. Replace first erases this browser&apos;s data.</p>
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
          <AutoBackup />
        </div>

        <div className="stack-sm" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
          <h3 style={{ fontSize: '1rem' }}>Clear</h3>
          <div className="row">
            <button className="btn" type="button" onClick={() => setConfirmCache(true)}>Clear cached evaluations</button>
            <button className="btn" type="button" onClick={() => setConfirmReset(true)}>Reset settings</button>
            <button className="btn btn-danger" type="button" onClick={() => setConfirmClear(true)}>
              <Icon name="trash" /> Delete all my data
            </button>
          </div>
          <p className="hint" style={{ margin: 0 }}>Cached evaluations only speed things up; deleting them never loses a game or a note.</p>
        </div>
      </section>

      <ConfirmDialog
        open={confirmReplace}
        danger
        title="Replace all data with this backup?"
        confirmLabel="Replace"
        body={<p>Everything currently stored in this browser is erased first, then the backup is loaded. This cannot be undone. Download a backup first if you are unsure.</p>}
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => {
          setConfirmReplace(false);
          void doImport('replace');
        }}
      />
      <ConfirmDialog
        open={confirmCache}
        title="Clear cached evaluations?"
        confirmLabel="Clear cache"
        body={<p>Saved game analyses are kept. Positions will simply be searched again the next time they come up.</p>}
        onCancel={() => setConfirmCache(false)}
        onConfirm={() => {
          setConfirmCache(false);
          void clearEvalCache().then(() => toast.success('Cache cleared.'));
        }}
      />
      <ConfirmDialog
        open={confirmReset}
        title="Reset settings?"
        confirmLabel="Reset"
        body={<p>Appearance, engine and training settings go back to their defaults. Your games and notes are not touched.</p>}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          resetPrefs();
          toast.success('Settings reset.');
        }}
      />
      <Dialog
        open={confirmClear}
        onClose={() => (setConfirmClear(false), setTyped(''))}
        title="Delete all my data?"
        footer={
          <>
            <button className="btn" type="button" onClick={() => (setConfirmClear(false), setTyped(''))}>Cancel</button>
            <button className="btn btn-danger" type="button" disabled={typed.trim().toUpperCase() !== 'DELETE' || busy !== ''} onClick={() => void doClear()}>Delete everything</button>
          </>
        }
      >
        <div className="stack-sm">
          <p style={{ margin: 0 }}>This permanently removes every game, analysis, puzzle, note, repertoire line, reflection and calendar entry from this browser. It cannot be undone.</p>
          <label className="check"><input type="checkbox" checked={keepPrefs} onChange={(e) => setKeepPrefs(e.target.checked)} /> <span>Keep my appearance and engine settings</span></label>
          <Field label="Type DELETE to confirm" htmlFor="set-del">
            <input id="set-del" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
