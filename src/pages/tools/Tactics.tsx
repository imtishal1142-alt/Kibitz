import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banner, PageHead } from '../../components/ui';
import { Coach } from '../../components/Coach';
import { MiniBoard } from '../../components/MiniBoard';
import { loadLibraryPuzzles, toRecord } from '../../lib/training/libraryPuzzles';
import type { LibraryPuzzle } from '../../lib/training/libraryPuzzles';
import { TACTIC_PATTERNS } from '../../lib/training/tacticPatterns';
import { putPuzzles } from '../../lib/storage/repos';
import { toast } from '../../services/toast';

export default function Tactics() {
  const nav = useNavigate();
  const [pack, setPack] = useState<LibraryPuzzle[] | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    void loadLibraryPuzzles().then(setPack).catch(() => setPack([]));
  }, []);
  const by = useMemo(() => {
    const m = new Map<string, LibraryPuzzle[]>();
    for (const p of pack ?? []) {
      const k = p.themes[0] ?? 'tactic';
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [pack]);
  const practise = async (id: string) => {
    if (!pack) return;
    setBusy(id);
    try {
      await putPuzzles(pack.map((p) => toRecord(p)));
      nav(`/puzzles?theme=${encodeURIComponent(id)}`);
    } catch {
      toast.error('Could not add the puzzle pack.');
    } finally {
      setBusy('');
    }
  };
  return (
    <div className="stack">
      <PageHead title="Tactic patterns" sub="Learn to recognise the patterns, then practise each one." actions={<Link className="btn" to="/train">All tools</Link>} />
      <Coach mood="happy" text="Almost every game below master level is decided by tactics. Before each move, run the same check: checks, captures, threats. Pick a pattern to see what it looks like, then practise it." />
      <Banner kind="info">
        The puzzles come from engine self-play games. Each has one clearly best first move, confirmed by Stockfish at depth 16, and the theme is read from what that first move does. Level 1 means a very shallow engine search already finds the move, level 2 needs a few moves of depth, level 3 needs more. It is a measure of how hidden the move is, not a rating. Most puzzles are level 1.
      </Banner>
      <div className="grid-2">
        {TACTIC_PATTERNS.map((t) => {
          const list = by.get(t.id) ?? [];
          const ex = [...list].sort((a, b) => a.level - b.level)[0];
          const lv = [1, 2, 3].map((l) => list.filter((p) => p.level === l).length);
          return (
            <section key={t.id} className="sheet pad stack-sm tactic-card" aria-labelledby={`tp-${t.id}`}>
              <div className="tactic-top">
                {ex ? (
                  <div className="tactic-board" aria-hidden="true">
                    <MiniBoard fen={ex.fen} orientation={ex.side} />
                  </div>
                ) : null}
                <div className="stack-sm">
                  <h2 id={`tp-${t.id}`}>{t.title}</h2>
                  <p style={{ margin: 0 }}>{t.what}</p>
                </div>
              </div>
              <div className="label">How to spot it</div>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {t.spot.map((s) => <li key={s}>{s}</li>)}
              </ul>
              <p className="small muted" style={{ margin: 0 }}><strong>Tip.</strong> {t.tip}</p>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="small muted">{pack ? (list.length ? `${list.length} puzzles (${lv[0]} easy, ${lv[1]} medium, ${lv[2]} hard)` : 'No puzzles of this pattern in the pack yet') : 'Loading…'}</span>
                <button type="button" className="btn btn-primary btn-sm" disabled={!list.length || !!busy} onClick={() => void practise(t.id)}>
                  {busy === t.id ? 'Adding…' : 'Practise'}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
