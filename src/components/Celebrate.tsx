/** A short burst of confetti. Decorative only (hidden from screen readers) and switched off by reduced-motion settings. */
const COLOURS = ['var(--accent)', '#f2b01e', '#e8553d', '#2aa876', '#3b82f6', '#a855f7'];
const PIECES = Array.from({ length: 26 }, (_, i) => ({
  x: `${(i * 37) % 100}%`,
  dx: `${((i * 53) % 90) - 45}px`,
  rot: `${((i * 97) % 720) - 360}deg`,
  d: `${(i % 9) * 55}ms`,
  c: COLOURS[i % COLOURS.length]!,
}));

export function Celebrate() {
  return (
    <div className="confetti" aria-hidden="true">
      {PIECES.map((p, i) => (
        <i key={i} style={{ ['--x' as string]: p.x, ['--dx' as string]: p.dx, ['--rot' as string]: p.rot, ['--d' as string]: p.d, ['--c' as string]: p.c }} />
      ))}
    </div>
  );
}
