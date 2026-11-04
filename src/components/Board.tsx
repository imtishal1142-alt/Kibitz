import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Chessboard, defaultPieces } from 'react-chessboard';
import type { PieceRenderObject } from 'react-chessboard';
import { BoardResizer } from './BoardResizer';
import { BOARD_THEMES } from '../lib/storage/prefs';
import { usePrefs } from '../hooks/usePrefs';
import type { Color, MoveClass } from '../lib/types';
import { CLASS_LABEL } from '../lib/chess/classify';
import { GradeIcon } from './GradeIcon';
import { MoveInput } from './MoveInput';

export interface BoardMove {
  from: string;
  to: string;
  promotion?: string;
  san: string;
  uci: string;
}

export interface BoardArrow {
  from: string;
  to: string;
  color?: string;
}

export type MarkKind = 'good' | 'bad' | 'best' | 'info';

interface BoardProps {
  fen: string;
  orientation?: Color;
  /** Which side(s) the person may move. null = view only. */
  movable?: Color | 'both' | null;
  /** Return false to reject the move (the piece goes back). */
  onMove?: (m: BoardMove) => boolean | void;
  lastMove?: { from: string; to: string } | null;
  arrows?: BoardArrow[];
  marks?: Record<string, MarkKind>;
  ariaLabel?: string;
  /** Show a corner handle to drag the board bigger or smaller. */
  resizable?: boolean;
  /** Called when a square is clicked and no move was made (used by exercises that ask for a square). */
  onSquareClick?: (square: string) => void;
  /** Offer a "type a move" box under a movable board (the keyboard and screen-reader way to play). Default true. */
  typedMoves?: boolean;
  /** A grade icon drawn on the corner of a square (used for the move just played in a reviewed game). */
  badge?: { square: string; cls: MoveClass } | null;
}

const MARK_COLOR: Record<MarkKind, string> = {
  good: 'rgba(31, 138, 112, 0.85)',
  best: 'rgba(104, 160, 46, 0.95)',
  bad: 'rgba(198, 40, 40, 0.9)',
  info: 'rgba(201, 138, 0, 0.9)',
};
export const ARROW_COLORS = { best: 'rgba(104, 160, 46, 0.9)', alt: 'rgba(31, 138, 112, 0.75)', bad: 'rgba(198, 40, 40, 0.8)', info: 'rgba(201, 138, 0, 0.85)' } as const;

const GLYPH: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
function makeGlyphPieces(): PieceRenderObject {
  const out: PieceRenderObject = {};
  for (const c of ['w', 'b']) {
    for (const t of Object.keys(GLYPH)) {
      out[`${c}${t}`] = () => (
        <svg viewBox="0 0 50 50" width="100%" height="100%" style={{ display: 'block' }}>
          <text x="25" y="27" textAnchor="middle" dominantBaseline="central" fontSize="42" fontFamily="'Segoe UI Symbol','Noto Sans Symbols 2','DejaVu Sans',sans-serif" fill={c === 'w' ? '#ffffff' : '#10151f'} stroke={c === 'w' ? '#10151f' : '#ffffff'} strokeWidth={c === 'w' ? 1.6 : 0.9} paintOrder="stroke">
            {`${GLYPH[t]}︎`}
          </text>
        </svg>
      );
    }
  }
  return out;
}
const glyphPieces = makeGlyphPieces();

function safeChess(fen: string): Chess {
  try {
    return new Chess(fen);
  } catch {
    return new Chess('8/8/8/8/8/8/8/8 w - - 0 1', { skipValidation: true });
  }
}

export function useReducedMotion(): boolean {
  const [prefs] = usePrefs();
  const [sys, setSys] = useState(() => (typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false));
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setSys(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return prefs.reducedMotion === 'on' ? true : prefs.reducedMotion === 'off' ? false : sys;
}

/** A grade icon on the top-right corner of a square. The grade is also announced through the board's label (see callers). */
function SquareBadge({ square, cls, orientation }: { square: string; cls: MoveClass; orientation: Color }) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  if (file < 0 || file > 7 || !(rank >= 0 && rank <= 7)) return null;
  const col = orientation === 'w' ? file : 7 - file;
  const row = orientation === 'w' ? 7 - rank : rank;
  return (
    <span className="sq-badge" style={{ left: `${(col + 1) * 12.5}%`, top: `${row * 12.5}%` }} title={CLASS_LABEL[cls]}>
      <GradeIcon cls={cls} size={26} />
    </span>
  );
}

/** Remembered across boards so a keyboard user does not have to reopen the move box after every puzzle. */
let typedOpen = false;

const PIECE_NAME: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

/**
 * react-chessboard draws every piece as a draggable button with no name, which a screen reader announces as just
 * "draggable". This names each one ("white knight on g1") and takes pieces that cannot move out of the Tab order
 * so the board is not 32 Tab stops. Pieces that can move stay reachable and can be lifted with Space or Enter and
 * moved with the arrow keys (the library's own keyboard support); typing a move is the other keyboard route.
 */
function useNamedPieces(host: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = host.current;
    if (!el || typeof MutationObserver === 'undefined') return;
    const apply = () => {
      for (const btn of el.querySelectorAll<HTMLElement>('[aria-roledescription="draggable"]')) {
        const piece = btn.querySelector<HTMLElement>('[data-piece]')?.dataset.piece;
        const square = btn.closest<HTMLElement>('[data-square]')?.dataset.square;
        if (!piece || !square) continue;
        const name = `${piece[0] === 'w' ? 'white' : 'black'} ${PIECE_NAME[(piece[1] ?? '').toLowerCase()] ?? 'piece'} on ${square}`;
        if (btn.getAttribute('aria-label') !== name) btn.setAttribute('aria-label', name);
        const tab = btn.getAttribute('aria-disabled') === 'true' ? '-1' : '0';
        if (btn.getAttribute('tabindex') !== tab) btn.setAttribute('tabindex', tab);
      }
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-disabled'] });
    return () => mo.disconnect();
  }, [host]);
}

/** A plain-text description of the position for screen readers, because the board itself is a picture. */
export function describePosition(chess: Chess): string {
  const side = (color: 'w' | 'b') => {
    const items = chess.board().flat().filter((p) => p && p.color === color) as { type: string; square: string }[];
    const order = 'kqrbnp';
    items.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    return items.map((p) => `${PIECE_NAME[p.type]} ${p.square}`).join(', ') || 'no pieces';
  };
  return `White: ${side('w')}. Black: ${side('b')}. ${chess.turn() === 'w' ? 'White' : 'Black'} to move.`;
}

export function Board({ fen, orientation = 'w', movable = null, onMove, lastMove, arrows, marks, ariaLabel, onSquareClick, typedMoves = true, badge, resizable = false }: BoardProps) {
  const [prefs] = usePrefs();
  const reduced = useReducedMotion();
  const id = useId();
  const chess = useMemo(() => safeChess(fen), [fen]);
  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const boardHost = useRef<HTMLDivElement>(null);
  useNamedPieces(boardHost);

  useEffect(() => {
    setSelected(null);
    setPromo(null);
  }, [fen]);

  const turn = chess.turn();
  const description = useMemo(() => describePosition(chess), [chess]);
  const mayMove = useCallback((c: Color) => movable === 'both' ? c === turn : movable === c && c === turn, [movable, turn]);

  const legalFrom = useMemo(() => {
    const map = new Map<string, { to: string; capture: boolean }[]>();
    if (!movable) return map;
    for (const m of chess.moves({ verbose: true })) {
      const list = map.get(m.from) ?? [];
      list.push({ to: m.to, capture: m.isCapture() || m.isEnPassant() });
      map.set(m.from, list);
    }
    return map;
  }, [chess, movable]);

  const commit = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      const probe = safeChess(fen);
      let mv;
      try {
        mv = probe.move({ from, to, promotion });
      } catch {
        return false;
      }
      const res = onMove?.({ from, to, promotion, san: mv.san, uci: `${from}${to}${promotion ?? ''}` });
      return res !== false;
    },
    [fen, onMove],
  );

  const attempt = useCallback(
    (from: string, to: string): boolean => {
      const targets = legalFrom.get(from);
      if (!targets?.some((t) => t.to === to)) return false;
      const isPromo = chess.moves({ square: from as Square, verbose: true }).some((m) => m.to === to && m.promotion);
      if (isPromo) {
        if (prefs.autoQueen) return commit(from, to, 'q');
        setPromo({ from, to });
        setSelected(null);
        return false; // the piece goes back; the move is made once a piece is chosen
      }
      setSelected(null);
      return commit(from, to);
    },
    [chess, commit, legalFrom, prefs.autoQueen],
  );

  const theme = BOARD_THEMES[prefs.boardTheme] ?? BOARD_THEMES['green']!;
  const king = chess.inCheck() ? chess.board().flat().find((p) => p && p.type === 'k' && p.color === turn)?.square : undefined;

  const squareStyles = useMemo(() => {
    const s: Record<string, React.CSSProperties> = {};
    const add = (sq: string, style: React.CSSProperties) => (s[sq] = { ...s[sq], ...style });
    if (prefs.highlightMoves && lastMove) {
      add(lastMove.from, { backgroundColor: 'var(--hi-last)' });
      add(lastMove.to, { backgroundColor: 'var(--hi-last)' });
    }
    if (king) add(king, { backgroundImage: 'radial-gradient(circle at center, rgba(220,38,38,0.85) 0%, rgba(220,38,38,0.45) 45%, transparent 72%)' });
    if (marks) for (const [sq, k] of Object.entries(marks)) add(sq, { boxShadow: `inset 0 0 0 4px ${MARK_COLOR[k]}` });
    if (selected) {
      add(selected, { backgroundColor: 'var(--hi-select)' });
      if (prefs.legalMoveDots) {
        for (const t of legalFrom.get(selected) ?? []) {
          add(t.to, { backgroundImage: t.capture ? 'radial-gradient(circle, transparent 60%, rgba(19,26,44,0.38) 62%)' : 'radial-gradient(circle, rgba(19,26,44,0.34) 19%, transparent 21%)' });
        }
      }
    }
    return s;
  }, [prefs.highlightMoves, prefs.legalMoveDots, lastMove, king, marks, selected, legalFrom]);

  const pieces = prefs.pieceSet === 'glyph' ? glyphPieces : (defaultPieces as PieceRenderObject);

  return (
    <div className="board-frame" role="group" aria-label={ariaLabel ?? 'Chess board'} aria-describedby={`${id}-desc`}>
      <p id={`${id}-desc`} className="sr-only">
        {description}
      </p>
      <div style={{ position: 'relative' }} ref={boardHost}>
        <Chessboard
          options={{
            id: `board-${id}`,
            position: fen,
            boardOrientation: orientation === 'w' ? 'white' : 'black',
            pieces,
            showNotation: prefs.coordinates,
            showAnimations: prefs.animations && !reduced,
            animationDurationInMs: 160,
            allowDragging: !!movable,
            allowDrawingArrows: !movable,
            lightSquareStyle: { backgroundColor: theme.light },
            darkSquareStyle: { backgroundColor: theme.dark },
            lightSquareNotationStyle: { color: theme.dark, fontWeight: 600 },
            darkSquareNotationStyle: { color: theme.light, fontWeight: 600 },
            squareStyles,
            arrows: (arrows ?? []).map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color ?? ARROW_COLORS.best })),
            clearArrowsOnClick: true,
            canDragPiece: ({ piece }) => !!movable && mayMove(piece.pieceType[0] as Color),
            onPieceDrop: ({ sourceSquare, targetSquare }) => (targetSquare ? attempt(sourceSquare, targetSquare) : false),
            onSquareClick: ({ piece, square }) => {
              if (!movable) {
                onSquareClick?.(square);
                return;
              }
              if (selected && selected !== square && attempt(selected, square)) return;
              const own = piece && mayMove(piece.pieceType[0] as Color);
              if (own && selected !== square) setSelected(square);
              else setSelected(null);
              onSquareClick?.(square);
            },
          }}
        />
        {badge ? <SquareBadge square={badge.square} cls={badge.cls} orientation={orientation} /> : null}
        {promo ? (
          <div className="promo" role="dialog" aria-modal="true" aria-label="Choose the promotion piece">
            <div className="promo-box">
              {(['q', 'r', 'b', 'n'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-label={{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[p]}
                  onClick={() => {
                    const { from, to } = promo;
                    setPromo(null);
                    commit(from, to, p);
                  }}
                >
                  {pieces[`${turn}${p.toUpperCase()}`]?.()}
                </button>
              ))}
              <button type="button" aria-label="Cancel promotion" onClick={() => setPromo(null)} style={{ width: 'auto', padding: '0 12px', aspectRatio: 'auto' }}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        {resizable ? <BoardResizer /> : null}
      </div>
      {movable && typedMoves ? (
        <details className="typed-move" open={typedOpen} onToggle={(e) => (typedOpen = e.currentTarget.open)}>
          <summary>Type a move instead</summary>
          <MoveInput
            fen={fen}
            label="Type a move, for example Nf3 or e2e4"
            disabled={!mayMove(turn)}
            onMove={(m) => void commit(m.uci.slice(0, 2), m.uci.slice(2, 4), m.uci.length > 4 ? m.uci.slice(4) : undefined)}
          />
        </details>
      ) : null}
    </div>
  );
}
