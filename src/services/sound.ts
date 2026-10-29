// Optional move sounds, synthesised with the Web Audio API (no audio files, no downloads).
// Off by default; enabled under Settings. Browsers only allow audio after a user gesture, so the
// context is created on first use.
import { getPrefs } from '../lib/storage/prefs';

export type SoundKind = 'move' | 'capture' | 'check' | 'castle' | 'end' | 'warn' | 'correct' | 'wrong';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function blip(c: AudioContext, vol: number, freq: number, dur: number, type: OscillatorType, at = 0, slideTo?: number): void {
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playSound(kind: SoundKind): void {
  const p = getPrefs();
  if (!p.sounds) return;
  const c = audio();
  if (!c) return;
  const v = 0.25 * p.soundVolume;
  switch (kind) {
    case 'move':
      blip(c, v, 220, 0.07, 'triangle', 0, 140);
      break;
    case 'capture':
      blip(c, v * 1.3, 180, 0.11, 'square', 0, 90);
      blip(c, v * 0.6, 520, 0.05, 'triangle');
      break;
    case 'check':
      blip(c, v, 660, 0.09, 'sine');
      blip(c, v, 880, 0.12, 'sine', 0.09);
      break;
    case 'castle':
      blip(c, v, 200, 0.06, 'triangle');
      blip(c, v, 260, 0.08, 'triangle', 0.08);
      break;
    case 'end':
      [523, 392, 330].forEach((f, i) => blip(c, v, f, 0.22, 'sine', i * 0.16));
      break;
    case 'warn':
      blip(c, v, 990, 0.06, 'square');
      break;
    case 'correct':
      blip(c, v, 523, 0.09, 'sine');
      blip(c, v, 784, 0.14, 'sine', 0.09);
      break;
    case 'wrong':
      blip(c, v, 200, 0.2, 'sawtooth', 0, 120);
      break;
  }
}

/** Pick the sound for a move that was just played (SAN decides check, castle and capture). */
export function soundForSan(san: string): SoundKind {
  if (san.includes('#') || san.includes('+')) return 'check';
  if (san.startsWith('O-O')) return 'castle';
  if (san.includes('x')) return 'capture';
  return 'move';
}
