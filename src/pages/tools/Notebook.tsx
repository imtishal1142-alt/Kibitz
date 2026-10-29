import { Chess } from 'chess.js';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog, Empty, Field, PageHead } from '../../components/ui';
import { Board } from '../../components/Board';
import { Icon } from '../../components/Icon';
import { Pv } from '../../components/Pv';
import { START_FEN, validateFen } from '../../lib/chess/rules';
import { deleteNotebook, listNotebook, putNotebook } from '../../lib/storage/repos';
import { formatDateTime } from '../../lib/ui/format';
import { useQuery } from '../../hooks/useQuery';
import { toast } from '../../services/toast';
import type { NotebookEntry } from '../../lib/types';

function replay(fen: string, sans: string[]): { fen: string; ok: boolean } {
  try {
    const c = new Chess(fen);
    for (const s of sans) c.move(s);
    return { fen: c.fen(), ok: true };
  } catch {
    return { fen, ok: false };
  }
}

export default function Notebook() {
  const entries = useQuery(listNotebook, ['notebook']);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [newFen, setNewFen] = useState('');
  const [fenError, setFenError] = useState('');

  const list = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return [...(entries.data ?? [])].sort((a, b) => b.updatedAt - a.updatedAt).filter((e) => !q || `${e.title} ${e.note} ${e.tags.join(' ')}`.toLowerCase().includes(q));
  }, [entries.data, filter]);
  const current = entries.data?.find((e) => e.id === selected);

  const create = (fen: string) => {
    const v = validateFen(fen);
    if (!v.ok) {
      setFenError(v.error ?? 'That FEN is not a legal position.');
      return;
    }
    setFenError('');
    const now = Date.now();
    const e: NotebookEntry = { id: `nb-${now.toString(36)}`, fen, title: 'Untitled position', note: '', tags: [], variations: [], createdAt: now, updatedAt: now };
    void putNotebook(e).then(() => {
      setSelected(e.id);
      setNewFen('');
    });
  };

  return (
    <div className="stack">
      <PageHead title="Position notebook" sub="Positions you want to remember, with your notes and variations. Saved on this device." actions={<Link className="btn" to="/train">All tools</Link>} />
      <div className="split-side">
        <section className="sheet pad-sm stack-sm" aria-label="Entries">
          <label className="sr-only" htmlFor="nb-filter">Search the notebook</label>
          <input id="nb-filter" className="input" type="search" placeholder="Search notes and tags" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <ul className="list-plain list-rows">
            {list.map((e) => (
              <li key={e.id}>
                <button type="button" className="btn btn-quiet" style={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start' }} aria-current={e.id === selected} onClick={() => setSelected(e.id)}>
                  <strong>{e.title || 'Untitled position'}</strong>
                  <span className="muted small">{e.tags.join(', ') || formatDateTime(e.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
          {entries.data && entries.data.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Nothing saved yet. Add a position below, or use the Notebook button on the analysis board.</p> : null}
          <div className="stack-sm" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 10 }}>
            <Field label="New entry from a FEN" htmlFor="nb-fen">
              <input id="nb-fen" className="input" value={newFen} onChange={(e) => (setNewFen(e.target.value), setFenError(''))} placeholder="Paste a FEN" spellCheck={false} aria-invalid={!!fenError} />
            </Field>
            {fenError ? <p role="alert" className="small" style={{ margin: 0, color: 'var(--c-blunder)' }}>{fenError}</p> : null}
            <div className="row">
              <button className="btn btn-sm" type="button" disabled={!newFen.trim()} onClick={() => create(newFen.trim())}>
                <Icon name="plus" /> Add FEN
              </button>
              <button className="btn btn-sm" type="button" onClick={() => create(START_FEN)}>
                Start position
              </button>
            </div>
          </div>
        </section>
        {current ? <Editor key={current.id} entry={current} onDeleted={() => setSelected(null)} /> : <Empty title="Choose an entry">Pick a position on the left to read or edit it.</Empty>}
      </div>
    </div>
  );
}

function Editor({ entry, onDeleted }: { entry: NotebookEntry; onDeleted: () => void }) {
  const [title, setTitle] = useState(entry.title);
  const [note, setNote] = useState(entry.note);
  const [tags, setTags] = useState(entry.tags.join(', '));
  const [variations, setVariations] = useState(entry.variations);
  const [scratch, setScratch] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const dirty = title !== entry.title || note !== entry.note || tags !== entry.tags.join(', ') || variations.join('|') !== entry.variations.join('|');
  const shown = useMemo(() => replay(entry.fen, scratch).fen, [entry.fen, scratch]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = () =>
    void putNotebook({ ...entry, title: title.trim() || 'Untitled position', note, tags: tags.split(',').map((t) => t.trim()).filter(Boolean), variations, updatedAt: Date.now() }).then(() => toast.success('Saved.'));

  return (
    <section className="sheet pad stack" aria-label="Entry">
      <div className="split-even">
        <div className="stack-sm">
          <div className="board-wrap">
            <Board
              fen={shown}
              orientation={entry.fen.split(' ')[1] === 'b' ? 'b' : 'w'}
              movable="both"
              onMove={(m) => {
                setScratch((s) => [...s, m.san]);
                return true;
              }}
              ariaLabel="Notebook position. Play moves to try a variation."
            />
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn btn-sm" type="button" disabled={!scratch.length} onClick={() => setScratch((s) => s.slice(0, -1))}>
              <Icon name="undo" /> Back
            </button>
            <button className="btn btn-sm" type="button" disabled={!scratch.length} onClick={() => setScratch([])}>
              Reset
            </button>
            <button
              className="btn btn-sm"
              type="button"
              disabled={!scratch.length}
              onClick={() => {
                setVariations((v) => (v.includes(scratch.join(' ')) ? v : [...v, scratch.join(' ')]));
                setScratch([]);
              }}
            >
              <Icon name="plus" /> Keep this line
            </button>
          </div>
        </div>
        <div className="stack-sm">
          <Field label="Title" htmlFor="nb-title">
            <input id="nb-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Notes" htmlFor="nb-note">
            <textarea id="nb-note" className="textarea" rows={5} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What matters in this position?" />
          </Field>
          <Field label="Tags (comma separated)" htmlFor="nb-tags">
            <input id="nb-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="endgame, rook, to study" />
          </Field>
        </div>
      </div>

      <div>
        <div className="label">Variations ({variations.length})</div>
        {variations.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Play moves on the board and choose &quot;Keep this line&quot;. Only legal moves can be played, so every saved line is valid.</p> : null}
        <ul className="list-plain list-rows">
          {variations.map((v) => {
            const sans = v.split(' ');
            return (
              <li key={v} className="row-nowrap" style={{ alignItems: 'flex-start' }}>
                <span className="grow">
                  <Pv fen={entry.fen} sans={sans} max={30} />
                </span>
                <button className="btn btn-sm btn-quiet" type="button" onClick={() => setScratch(sans)}>
                  Show
                </button>
                <button className="btn btn-sm btn-quiet" type="button" aria-label="Delete this variation" onClick={() => setVariations((x) => x.filter((y) => y !== v))}>
                  <Icon name="x" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="row">
        <button className="btn btn-primary" type="button" disabled={!dirty} onClick={save}>
          <Icon name="check" /> Save changes
        </button>
        <Link className="btn" to={`/analysis?fen=${encodeURIComponent(entry.fen)}`}>
          Analyse this position
        </Link>
        <span className="grow" />
        <button className="btn btn-danger" type="button" onClick={() => setConfirm(true)}>
          <Icon name="trash" /> Delete
        </button>
      </div>
      {dirty ? <p className="small muted" style={{ margin: 0 }}>You have unsaved changes.</p> : null}
      <ConfirmDialog
        open={confirm}
        title="Delete this entry?"
        danger
        confirmLabel="Delete"
        body={<p>The note and its variations are removed from this device.</p>}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void deleteNotebook(entry.id).then(onDeleted);
        }}
      />
    </section>
  );
}
