import { useEffect, useRef } from 'react';
import { CLASS_LABEL } from '../lib/chess/classify';
import { GradeIcon } from './GradeIcon';
import type { LineTree } from '../lib/analysis/lineTree';
import type { MoveClass } from '../lib/types';
import { Icon } from './Icon';

interface Props {
  tree: LineTree;
  /** Changes whenever the tree is edited, so the sheet re-renders. */
  version: number;
  current: number;
  onSelect: (id: number) => void;
  /** Classification of main-line moves by ply. */
  classes?: Record<number, MoveClass>;
  critical?: Set<number>;
  onDeleteVariation?: (id: number) => void;
}

const COLORED = new Set<MoveClass>(['brilliant', 'great', 'inaccuracy', 'miss', 'mistake', 'blunder']);

function chain(tree: LineTree, start: number): number[] {
  const out = [start];
  let cur = start;
  for (;;) {
    const n = tree.node(cur);
    const next = n.children.find((c) => tree.has(c));
    if (next === undefined) break;
    out.push(next);
    cur = next;
  }
  return out;
}

function numbered(tree: LineTree, ids: number[]): { id: number; text: string }[] {
  return ids.map((id, i) => {
    const n = tree.node(id);
    return { id, text: n.color === 'w' ? `${n.moveNo}.${n.san}` : i === 0 ? `${n.moveNo}...${n.san}` : n.san! };
  });
}

/** The game as a paper scoresheet: move number, White, Black; variations are written under the move they replace. */
export function Scoresheet({ tree, version, current, onSelect, classes, critical, onDeleteVariation }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const main = tree.mainlineIds().slice(1);
  const rows: { no: number; w?: number; b?: number }[] = [];
  for (const id of main) {
    const n = tree.node(id);
    const last = rows.at(-1);
    if (n.color === 'w') rows.push({ no: n.moveNo, w: id });
    else if (last && last.w !== undefined && last.b === undefined && last.no === n.moveNo) last.b = id;
    else rows.push({ no: n.moveNo, b: id });
  }

  useEffect(() => {
    const el = ref.current?.querySelector('[aria-current="true"]');
    if (el && 'scrollIntoView' in el) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [current]);

  const cell = (id: number | undefined) => {
    if (id === undefined) return <span />;
    const n = tree.node(id);
    const cls = classes?.[n.ply];
    const showIcon = cls !== undefined && cls !== 'excellent' && cls !== 'good' && cls !== 'forced';
    return (
      <button type="button" className={`mv ${cls && COLORED.has(cls) ? `cls-${cls}` : ''} ${critical?.has(n.ply) ? 'mv-crit' : ''}`} aria-current={id === current} onClick={() => onSelect(id)} aria-label={`${tree.label(id)}${cls ? `, ${CLASS_LABEL[cls].toLowerCase()}` : ''}`}>
        <span>{n.san}</span>
        {showIcon && cls ? <span className="mv-glyph"><GradeIcon cls={cls} size={16} /></span> : null}
      </button>
    );
  };

  const variationBlocks = (ids: (number | undefined)[]) => {
    const blocks: { id: number; depth: number }[] = [];
    const collect = (parent: number, depth: number) => {
      for (const v of tree.variationsAfter(parent)) {
        blocks.push({ id: v, depth });
        for (const nid of chain(tree, v)) {
          const nodeParent = tree.node(nid).parent;
          if (nid !== v && nodeParent !== null) collect(nodeParent, depth + 1);
        }
      }
    };
    for (const id of ids) {
      if (id === undefined) continue;
      const p = tree.node(id).parent;
      if (p !== null) collect(p, 1);
    }
    return blocks.map((b) => {
      const parts = numbered(tree, chain(tree, b.id));
      return (
        <div key={b.id} className="stack-sm" style={{ padding: '4px 10px 6px', marginLeft: 38 + (b.depth - 1) * 14, background: 'var(--card-2)', borderLeft: '3px solid var(--line)' }}>
          <div className="row-nowrap" style={{ alignItems: 'flex-start', gap: 6 }}>
            <span className="pv grow">
              {parts.map((p) => (
                <button key={p.id} type="button" aria-current={p.id === current} style={p.id === current ? { background: 'var(--accent-tint)', fontWeight: 650 } : undefined} onClick={() => onSelect(p.id)}>
                  {p.text}
                </button>
              ))}
            </span>
            {onDeleteVariation ? (
              <button type="button" className="btn btn-quiet btn-icon btn-sm" aria-label="Delete this variation" onClick={() => onDeleteVariation(b.id)}>
                <Icon name="x" size={14} />
              </button>
            ) : null}
          </div>
        </div>
      );
    });
  };

  void version;
  return (
    <div className="scoresheet" ref={ref} role={rows.length ? 'list' : undefined} aria-label={rows.length ? 'Moves' : undefined}>
      {rows.length === 0 ? <p className="muted pad-sm" style={{ margin: 0 }}>No moves yet. Make a move on the board.</p> : null}
      {rows.map((r) => (
        <div key={`${r.no}-${r.w ?? r.b}`} role="listitem">
          <div className="sheet-row">
            <span className="sheet-no">{r.no}</span>
            {r.w === undefined ? <span className="faint" style={{ padding: '0 8px', display: 'flex', alignItems: 'center' }}>…</span> : cell(r.w)}
            {cell(r.b)}
          </div>
          {variationBlocks([r.w, r.b])}
        </div>
      ))}
    </div>
  );
}
