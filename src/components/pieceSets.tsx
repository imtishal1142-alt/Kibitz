// Extra piece styles drawn here (geometric silhouettes), so no artwork needs a separate licence.
// "minimal": flat silhouettes. "ink": hollow outlines. "colour": silhouettes tinted with the palette's accent.
import type { ReactNode } from 'react';
import { defaultPieces } from 'react-chessboard';
import type { PieceRenderObject } from 'react-chessboard';

type Kind = 'P' | 'R' | 'N' | 'B' | 'Q' | 'K';
type Style = 'minimal' | 'ink' | 'colour';

const SHAPES: Record<Kind, ReactNode> = {
  P: (
    <>
      <circle cx="22.5" cy="12.5" r="5.5" />
      <path d="M16.5 36 C16.5 27 19 22.5 22.5 20.5 C26 22.5 28.5 27 28.5 36 Z" />
      <rect x="12.5" y="35.5" width="20" height="4.5" rx="1.8" />
    </>
  ),
  R: (
    <>
      <path d="M12 8 h4.2 v3.2 h3.8 V8 h5 v3.2 h3.8 V8 H33 v9 H12 Z" />
      <rect x="15" y="17" width="15" height="17" />
      <rect x="11.5" y="33.5" width="22" height="6.5" rx="1.5" />
    </>
  ),
  N: (
    <>
      <path d="M13 38 V34 C13 27 16.5 22.5 21 20 L16 16.5 L17 10.5 L21.5 12.5 L22.5 7.5 L25.5 11 C32.5 13 34 22 32.5 30 V38 Z" />
      <rect x="11.5" y="36" width="22" height="4" rx="1.5" />
    </>
  ),
  B: (
    <>
      <circle cx="22.5" cy="6.8" r="2.6" />
      <path d="M22.5 9 C29 14 30.5 19 27 24.5 L29.5 31 H15.5 L18 24.5 C14.5 19 16 14 22.5 9 Z" />
      <rect x="11.5" y="31" width="22" height="3.6" rx="1.4" />
      <rect x="13" y="35" width="19" height="4.5" rx="1.8" />
    </>
  ),
  Q: (
    <>
      <circle cx="9.5" cy="13" r="2.7" />
      <circle cx="16.5" cy="8.8" r="2.7" />
      <circle cx="22.5" cy="7" r="2.7" />
      <circle cx="28.5" cy="8.8" r="2.7" />
      <circle cx="35.5" cy="13" r="2.7" />
      <path d="M9.5 14 L14 31 H31 L35.5 14 L28.5 22 L25.5 11 L22.5 21 L19.5 11 L16.5 22 Z" />
      <rect x="11.5" y="31" width="22" height="4" rx="1.5" />
      <rect x="12.5" y="35.5" width="20" height="4.5" rx="1.8" />
    </>
  ),
  K: (
    <>
      <rect x="21" y="3" width="3" height="11" rx="0.8" />
      <rect x="17.5" y="6.5" width="10" height="3" rx="0.8" />
      <path d="M13.5 36 C13.5 26 16.5 21 22.5 15.5 C28.5 21 31.5 26 31.5 36 Z" />
      <rect x="11.5" y="35.5" width="22" height="4.5" rx="1.8" />
    </>
  ),
};

function piece(kind: Kind, white: boolean, style: Style): () => React.JSX.Element {
  return () => {
    const fill = style === 'ink' ? (white ? '#ffffff' : '#2a2a2a') : style === 'colour' ? (white ? '#ffffff' : 'var(--accent)') : white ? '#f4f4f4' : '#161616';
    const stroke = style === 'ink' ? (white ? '#111111' : '#ffffff') : white ? '#151515' : style === 'colour' ? '#ffffff' : '#f4f4f4';
    const sw = style === 'ink' ? 1.9 : 1.4;
    return (
      <svg viewBox="0 0 45 45" width="100%" height="100%" style={{ display: 'block' }}>
        <g style={{ fill, stroke, strokeWidth: sw, strokeLinejoin: 'round' }}>{SHAPES[kind]}</g>
        {kind === 'N' ? <circle cx="23.5" cy="15.5" r="1.4" style={{ fill: stroke }} /> : null}
        {kind === 'B' ? <path d="M22.5 13 v6 M19.5 16 h6" style={{ stroke, strokeWidth: 1.3, fill: 'none' }} /> : null}
      </svg>
    );
  };
}

export function makeSet(style: Style): PieceRenderObject {
  const out: PieceRenderObject = {};
  for (const c of ['w', 'b']) for (const k of ['P', 'R', 'N', 'B', 'Q', 'K'] as Kind[]) out[`${c}${k}`] = piece(k, c === 'w', style);
  return out;
}

export const minimalPieces = makeSet('minimal');
export const inkPieces = makeSet('ink');
export const colourPieces = makeSet('colour');

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

export function pieceSetFor(id: string): PieceRenderObject {
  return id === 'glyph' ? glyphPieces : id === 'minimal' ? minimalPieces : id === 'ink' ? inkPieces : id === 'colour' ? colourPieces : (defaultPieces as PieceRenderObject);
}
