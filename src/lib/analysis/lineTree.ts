// Move tree for the analysis board: the game's main line plus any variations you try.
// Every node stores its FEN, so navigating is instant and PGN export (with variations in
// parentheses) is exact. All moves are validated by chess.js when they are added.
import { Chess } from 'chess.js';
import { START_FEN, fullmoveNumber, normalizeFen, sideToMove, uciOf } from '../chess/rules';
import type { Color } from '../types';

export interface TreeNode {
  id: number;
  parent: number | null;
  uci: string | null; // null for the root
  san: string | null;
  fen: string;
  /** Plies from the root of the tree (root = 0). */
  ply: number;
  children: number[];
  main: boolean;
  /** Who played this move and its move number (correct even when the tree starts from a set-up position). */
  color: Color;
  moveNo: number;
}

export class LineTree {
  readonly startFen: string;
  readonly nodes: TreeNode[] = [];

  constructor(startFen: string = START_FEN, mainline: string[] = []) {
    this.startFen = normalizeFen(startFen);
    this.nodes.push({ id: 0, parent: null, uci: null, san: null, fen: this.startFen, ply: 0, children: [], main: true, color: sideToMove(this.startFen), moveNo: fullmoveNumber(this.startFen) });
    let cur = 0;
    for (const u of mainline) {
      const id = this.add(cur, u, true);
      if (id === null) break;
      cur = id;
    }
  }

  node(id: number): TreeNode {
    const n = this.nodes[id];
    if (!n) throw new Error(`No node ${id}`);
    return n;
  }

  has(id: number): boolean {
    const n = this.nodes[id];
    return !!n && n.id === id && n.ply >= 0;
  }

  /** Add a move after `id` (or return the existing child with the same move). Null when illegal. */
  add(id: number, uci: string, asMain = false): number | null {
    const parent = this.node(id);
    const existing = parent.children.map((c) => this.node(c)).find((c) => c.uci === uci);
    if (existing) return existing.id;
    let chess: Chess;
    try {
      chess = new Chess(parent.fen);
    } catch {
      return null;
    }
    let mv;
    try {
      mv = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
    } catch {
      return null;
    }
    const child: TreeNode = { id: this.nodes.length, parent: id, uci: uciOf(mv), san: mv.san, fen: chess.fen(), ply: parent.ply + 1, children: [], main: asMain || (parent.main && parent.children.length === 0), color: chess.turn() === 'w' ? 'b' : 'w', moveNo: fullmoveNumber(parent.fen) };
    this.nodes.push(child);
    parent.children.push(child.id);
    return child.id;
  }

  mainlineIds(): number[] {
    const out = [0];
    let cur = this.node(0);
    for (;;) {
      const next = cur.children.map((c) => this.node(c)).find((c) => c.main);
      if (!next) break;
      out.push(next.id);
      cur = next;
    }
    return out;
  }

  pathTo(id: number): number[] {
    const out: number[] = [];
    for (let n: TreeNode | null = this.node(id); n; n = n.parent === null ? null : this.node(n.parent)) out.unshift(n.id);
    return out;
  }

  /** The move that continues `id` along its own line (main continuation, else the first variation). */
  next(id: number): number | null {
    const n = this.node(id);
    const main = n.children.map((c) => this.node(c)).find((c) => c.main);
    return main?.id ?? n.children[0] ?? null;
  }

  prev(id: number): number | null {
    return this.node(id).parent;
  }

  variationsAfter(id: number): number[] {
    return this.node(id).children.filter((c) => !this.node(c).main);
  }

  /** "12...Nxe4" style label for a node. */
  label(id: number): string {
    const n = this.node(id);
    return n.san ? `${n.moveNo}${n.color === 'w' ? '.' : '...'}${n.san}` : 'Start';
  }

  /** Line of SAN moves from the root to `id`. */
  sansTo(id: number): string[] {
    return this.pathTo(id).slice(1).map((i) => this.node(i).san!);
  }

  ucisTo(id: number): string[] {
    return this.pathTo(id).slice(1).map((i) => this.node(i).uci!);
  }

  /** Remove a variation (never the main line). Ids of later nodes are unchanged; removed ids become unreachable. */
  remove(id: number): boolean {
    const n = this.node(id);
    if (n.main || n.parent === null) return false;
    const drop = new Set<number>();
    const walk = (i: number) => {
      drop.add(i);
      this.node(i).children.forEach(walk);
    };
    walk(id);
    const parent = this.node(n.parent);
    parent.children = parent.children.filter((c) => c !== id);
    for (const d of drop) this.nodes[d] = { ...this.nodes[d]!, ply: -1, children: [] };
    return true;
  }

  /** PGN movetext with variations in parentheses. */
  movetext(): string {
    const parts: string[] = [];
    const move = (id: number, forceNumber: boolean): void => {
      const n = this.node(id);
      if (n.color === 'w') parts.push(`${n.moveNo}. ${n.san}`);
      else parts.push(forceNumber ? `${n.moveNo}... ${n.san}` : n.san!);
    };
    const from = (parentId: number, needNumber: boolean): void => {
      let parent = parentId;
      let num = needNumber;
      for (;;) {
        const kids = this.node(parent).children.filter((c) => this.has(c));
        if (!kids.length) return;
        const [first, ...alts] = kids as [number, ...number[]];
        move(first, num);
        for (const alt of alts) {
          parts.push('(');
          move(alt, true);
          from(alt, false);
          parts.push(')');
        }
        num = alts.length > 0;
        parent = first;
      }
    };
    from(0, this.node(0).color === 'b');
    return parts.join(' ').replace(/\( /g, '(').replace(/ \)/g, ')');
  }

  toPgn(headers: Record<string, string>, result: string): string {
    // The PGN "seven tag roster" always comes first and in this order; other tags follow.
    const roster = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
    const fallback: Record<string, string> = { Event: 'Kibitz analysis', Site: '?', Date: '????.??.??', Round: '-', White: '?', Black: '?' };
    const h: Record<string, string> = { ...headers, Result: result };
    for (const k of roster) h[k] ??= fallback[k] ?? '?';
    if (this.startFen !== normalizeFen(START_FEN)) {
      h['SetUp'] = '1';
      h['FEN'] = this.startFen;
    }
    const ordered = [...roster, ...Object.keys(h).filter((k) => !roster.includes(k))];
    const head = ordered
      .map((k) => `[${k} "${(h[k] ?? '?').replace(/"/g, "'")}"]`)
      .join('\n');
    return `${head}\n\n${this.movetext()} ${result}`.trim();
  }
}
