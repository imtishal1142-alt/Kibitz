import type { SVGProps } from 'react';

// Small stroke icon set (24x24, currentColor). Decorative by default (aria-hidden): the control
// that contains an icon always has a text label or an aria-label.
const P = {
  desk: 'M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M8 5v14M16 5v14',
  stop: 'M6 6h12v12H6z',
  library: 'M5 4v16M9 4v16M13.5 5.2l3.2 14.6M19 6.5l-2 .6',
  board: 'M4 4h16v16H4zM4 12h16M12 4v16',
  train: 'M12 3l2.2 5 5.3.5-4 3.6 1.2 5.3L12 14.6 7.3 17.4l1.2-5.3-4-3.6 5.3-.5z',
  insights: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  cloud: 'M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9.5a4.2 4.2 0 0 1 0 8.5z',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13a7.7 7.7 0 0 0 0-2l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.3-.9-2 3.4 2 1.5a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.3.9 2-3.4z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  flip: 'M7 4v14m0 0-3-3m3 3 3-3M17 20V6m0 0-3 3m3-3 3 3',
  undo: 'M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-3',
  flag: 'M5 21V4m0 1h12l-2 4 2 4H5',
  handshake: 'M3 12l4-4 4 1 3-2 7 6-3 3-2-1-3 3-4-1-3 2zM3 12l3 3',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  download: 'M12 4v12m0 0-4-4m4 4 4-4M5 20h14',
  upload: 'M12 20V8m0 0-4 4m4-4 4 4M5 4h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6 6 18',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.01',
  warn: 'M12 4 3 20h18zM12 10v5M12 17.5v.01',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  first: 'M18 5l-7 7 7 7M7 5v14',
  last: 'M6 5l7 7-7 7M17 5v14',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12h.01',
  book: 'M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  note: 'M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7',
  swords: 'M4 4l9 9m-3 1 3 3-3 3-3-3m13-13-9 9m3 1-3 3 3 3 3-3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  refresh: 'M20 11a8 8 0 0 0-14.5-3.5L4 9m0-5v5h5M4 13a8 8 0 0 0 14.5 3.5L20 15m0 5v-5h-5',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  plus: 'M12 5v14M5 12h14',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  trophy: 'M8 4h8v6a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 14v4M8 21h8',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  bot: 'M6 8h12v10H6zM12 8V4m0 0h.01M9 12.5h.01M15 12.5h.01M9.5 15.5h5M3 12v3M21 12v3',
  knight: 'M7 20h10M8 20c0-4 1-6 3-8L8 9l3-4 3 1c2 1 3 3 3 6 0 2-1 4-1 8',
} as const;

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      <path d={P[name]} />
    </svg>
  );
}
