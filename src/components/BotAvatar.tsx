import type { Bot } from '../lib/engine/bots';

// Original flat portraits drawn from a few parts, picked from the bot's id. They are not likenesses of anyone.
const SKIN = ['#f1c9a5', '#e0a97d', '#c68863', '#a56a47', '#7b4b32', '#f6d9bf'];
const HAIR = ['#2b2118', '#5a3a22', '#a8742f', '#d9b36a', '#8a2f26', '#6b6f78', '#1a1a1f'];

function pick(id: string, salt: number, n: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return Math.abs(h) % n;
}

export function BotAvatar({ bot, size = 56 }: { bot: Pick<Bot, 'id' | 'hue'>; size?: number }) {
  const skin = SKIN[pick(bot.id, 1, SKIN.length)]!;
  const hair = HAIR[pick(bot.id, 2, HAIR.length)]!;
  const style = pick(bot.id, 3, 4);
  const glasses = pick(bot.id, 4, 3) === 0;
  const mouth = pick(bot.id, 5, 3);
  const beard = pick(bot.id, 6, 5) === 0;
  const shirt = `hsl(${(bot.hue + 40) % 360} 35% 52%)`;
  return (
    <svg className="bot-face" width={size} height={size} viewBox="0 0 64 64" role="presentation" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="10" fill={`hsl(${bot.hue} 38% 30%)`} />
      <path d="M8 64c2-13 12-19 24-19s22 6 24 19z" fill={shirt} />
      <rect x="27" y="36" width="10" height="11" rx="4" fill={skin} />
      {style === 3 ? <path d="M17 30c-2-14 6-20 15-20s17 6 15 20c-2-6-6-9-15-9s-13 3-15 9z" fill={hair} /> : null}
      <ellipse cx="32" cy="29" rx="12.5" ry="14" fill={skin} />
      {beard ? <path d="M20 30c1 12 6 17 12 17s11-5 12-17c-3 5-7 6-12 6s-9-1-12-6z" fill={hair} opacity="0.9" /> : null}
      {style === 0 ? <path d="M19 28c-2-13 5-19 13-19s15 6 13 19c-2-6-5-10-13-10s-11 4-13 10z" fill={hair} /> : null}
      {style === 1 ? <path d="M18 31c-3-16 5-22 14-22s17 6 14 22c-1-8-3-13-14-13s-13 5-14 13z" fill={hair} /> : null}
      {style === 2 ? <path d="M19 26c3-9 8-10 13-10s10 1 13 10c-4-3-8-4-13-4s-9 1-13 4z" fill={hair} /> : null}
      <circle cx="27" cy="29" r="1.6" fill="#241c16" />
      <circle cx="37" cy="29" r="1.6" fill="#241c16" />
      {glasses ? (
        <g fill="none" stroke="#241c16" strokeWidth="1.4">
          <circle cx="27" cy="29" r="4.2" />
          <circle cx="37" cy="29" r="4.2" />
          <path d="M31.2 29h1.6" />
        </g>
      ) : null}
      {mouth === 0 ? <path d="M27 37c2.5 2.4 7.5 2.4 10 0" fill="none" stroke="#6b3a2a" strokeWidth="1.6" strokeLinecap="round" /> : null}
      {mouth === 1 ? <path d="M28 37.5h8" fill="none" stroke="#6b3a2a" strokeWidth="1.6" strokeLinecap="round" /> : null}
      {mouth === 2 ? <path d="M27.5 36.5c3 3.2 6 3.2 9 0z" fill="#fff" stroke="#6b3a2a" strokeWidth="1.2" strokeLinejoin="round" /> : null}
    </svg>
  );
}
