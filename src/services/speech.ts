// Spoken coach lines using the browser's own speech synthesis. Nothing is sent anywhere; the voices are the ones the
// device already has, so quality and availability vary by device and the app cannot promise a particular voice.
import { useSyncExternalStore } from 'react';

let speaking = false;
const subs = new Set<() => void>();
const set = (v: boolean) => {
  if (speaking === v) return;
  speaking = v;
  subs.forEach((f) => f());
};

export const speechAvailable = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

export function useSpeaking(): boolean {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => speaking, () => false);
}

export function listVoices(): { name: string; lang: string }[] {
  if (!speechAvailable()) return [];
  return window.speechSynthesis.getVoices().map((v) => ({ name: v.name, lang: v.lang }));
}

/** Turns "1.e4" style text into something a voice reads sensibly. */
export function speakable(text: string): string {
  return text
    .replace(/\bO-O-O\b/g, 'castles queenside')
    .replace(/\bO-O\b/g, 'castles kingside')
    .replace(/(\d+)\.\.\./g, 'move $1, Black plays ')
    .replace(/(\d+)\.(?=\s?[A-Za-z])/g, 'move $1, ')
    .replace(/(?<=[A-Za-z])x(?=[a-h][1-8])/g, ' takes ')
    .replace(/#/g, ' checkmate')
    .replace(/\+/g, ' check')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stopSpeaking(): void {
  if (!speechAvailable()) return;
  window.speechSynthesis.cancel();
  set(false);
}

export function speak(text: string, opts: { voiceName?: string; rate?: number } = {}): boolean {
  if (!speechAvailable() || !text.trim()) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text));
  const voice = opts.voiceName ? synth.getVoices().find((v) => v.name === opts.voiceName) : undefined;
  if (voice) u.voice = voice;
  u.rate = Math.max(0.6, Math.min(1.5, opts.rate ?? 1));
  u.onstart = () => set(true);
  u.onend = () => set(false);
  u.onerror = () => set(false);
  synth.speak(u);
  return true;
}
