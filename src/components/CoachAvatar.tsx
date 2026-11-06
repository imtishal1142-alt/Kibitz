// Kibi, the coach: a small original character drawn in SVG. It follows the colour theme (ink outline, accent details),
// blinks, bobs gently, and changes expression with the mood. Decorative: the words next to it carry the meaning.
export type Mood = 'idle' | 'happy' | 'proud' | 'thinking' | 'surprised' | 'worried' | 'sad' | 'wink' | 'cheer';

const MOUTH: Record<Mood, string> = {
  idle: 'M47 78 Q60 86 73 78',
  happy: 'M44 76 Q60 94 76 76 Q60 84 44 76 Z',
  proud: 'M44 77 Q60 92 76 77',
  thinking: 'M50 81 L68 79',
  surprised: 'M54 78 Q60 74 66 78 Q60 90 54 78 Z',
  worried: 'M48 83 Q60 75 72 83',
  sad: 'M48 85 Q60 74 72 85',
  wink: 'M46 77 Q60 90 74 77',
  cheer: 'M42 74 Q60 98 78 74 Z',
};
const BROW_L: Record<Mood, string> = {
  idle: 'M38 47 L52 45', happy: 'M38 45 L52 43', proud: 'M38 44 L52 44', thinking: 'M38 48 L52 42', surprised: 'M38 41 L52 40',
  worried: 'M38 43 L52 47', sad: 'M38 44 L52 48', wink: 'M38 45 L52 43', cheer: 'M38 41 L52 41',
};
const BROW_R: Record<Mood, string> = {
  idle: 'M68 45 L82 47', happy: 'M68 43 L82 45', proud: 'M68 44 L82 44', thinking: 'M68 45 L82 45', surprised: 'M68 40 L82 41',
  worried: 'M68 47 L82 43', sad: 'M68 48 L82 44', wink: 'M68 43 L82 45', cheer: 'M68 41 L82 41',
};

export function CoachAvatar({ mood = 'idle', size = 72, speaking = false, label }: { mood?: Mood; size?: number; speaking?: boolean; label?: string }) {
  const closedL = mood === 'happy' || mood === 'proud' || mood === 'cheer';
  const closedR = closedL || mood === 'wink';
  const mouth = speaking ? 'M46 77 Q60 92 74 77 Q60 82 46 77 Z' : MOUTH[mood];
  const open = speaking || mood === 'happy' || mood === 'surprised' || mood === 'cheer';
  return (
    <svg className={`kibi-av kibi-${mood}${speaking ? ' kibi-speaking' : ''}`} width={size} height={size} viewBox="0 -8 120 128" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false">
      {/* shoulders and collar */}
      <path d="M14 118 Q16 96 40 92 L80 92 Q104 96 106 118 Z" fill="var(--ink)" />
      <path d="M50 92 L60 104 L70 92 Z" fill="var(--card)" />
      <path d="M57 104 L60 111 L63 104 Z" fill="var(--accent-tint)" stroke="var(--ink)" strokeWidth="1.2" />
      {/* head */}
      <g className="kibi-head">
        {/* pawn-shaped topknot */}
        <path d="M60 4 a6.5 6.5 0 1 1 0.01 0 Z M53 24 Q56 15 60 15 Q64 15 67 24 Z" fill="var(--ink)" />
        <rect x="50" y="22" width="20" height="5" rx="2.5" fill="var(--ink)" />
        <ellipse cx="60" cy="58" rx="36" ry="34" fill="var(--card)" stroke="var(--ink)" strokeWidth="3.5" />
        <ellipse cx="26" cy="60" rx="5" ry="8" fill="var(--card)" stroke="var(--ink)" strokeWidth="3" />
        <ellipse cx="94" cy="60" rx="5" ry="8" fill="var(--card)" stroke="var(--ink)" strokeWidth="3" />
        {/* cheeks */}
        {(mood === 'happy' || mood === 'proud' || mood === 'cheer' || mood === 'wink') && (
          <>
            <ellipse cx="38" cy="68" rx="6" ry="3.5" fill="var(--accent)" opacity="0.18" />
            <ellipse cx="82" cy="68" rx="6" ry="3.5" fill="var(--accent)" opacity="0.18" />
          </>
        )}
        {/* eyes */}
        <g className="kibi-eyes">
          {closedL ? (
            <path d="M39 58 Q45 51 51 58" fill="none" stroke="var(--ink)" strokeWidth="3.4" strokeLinecap="round" />
          ) : (
            <g className="kibi-eye"><ellipse cx="45" cy="57" rx="6.5" ry="7.5" fill="var(--ink)" /><circle cx="47" cy="54.5" r="2.2" fill="var(--card)" /></g>
          )}
          {closedR ? (
            <path d="M69 58 Q75 51 81 58" fill="none" stroke="var(--ink)" strokeWidth="3.4" strokeLinecap="round" />
          ) : (
            <g className="kibi-eye"><ellipse cx="75" cy="57" rx="6.5" ry="7.5" fill="var(--ink)" /><circle cx="77" cy="54.5" r="2.2" fill="var(--card)" /></g>
          )}
        </g>
        <path d={BROW_L[mood]} stroke="var(--ink)" strokeWidth="3.4" strokeLinecap="round" fill="none" />
        <path d={BROW_R[mood]} stroke="var(--ink)" strokeWidth="3.4" strokeLinecap="round" fill="none" />
        {/* nose */}
        <path d="M60 62 Q57 69 61 70" fill="none" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" />
        {/* mouth */}
        <path className="kibi-mouth" d={mouth} fill={open ? 'var(--ink)' : 'none'} stroke="var(--ink)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        {mood === 'worried' && <path d="M96 38 q4 7 0 11 q-4 -4 0 -11 Z" fill="var(--accent)" opacity="0.55" />}
      </g>
      {mood === 'thinking' && (
        <g className="kibi-dots" fill="var(--ink)"><circle cx="98" cy="20" r="2.6" /><circle cx="107" cy="14" r="3.4" /><circle cx="117" cy="7" r="4.4" /></g>
      )}
      {(mood === 'proud' || mood === 'cheer') && (
        <g className="kibi-sparks" fill="var(--accent)">
          <path d="M100 24 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5 Z" />
          <path d="M18 26 l1.8 4.4 4.4 1.8 -4.4 1.8 -1.8 4.4 -1.8 -4.4 -4.4 -1.8 4.4 -1.8 Z" />
        </g>
      )}
    </svg>
  );
}
