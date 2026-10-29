import { createStore } from './store';

export type ToastKind = 'info' | 'success' | 'error';
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

export const toasts = createStore<Toast[]>([]);
let nextId = 1;

function push(kind: ToastKind, text: string, ms = kind === 'error' ? 8000 : 4000): void {
  const id = nextId++;
  toasts.set((t) => [...t.slice(-3), { id, kind, text }]);
  setTimeout(() => dismiss(id), ms);
}

export function dismiss(id: number): void {
  toasts.set((t) => t.filter((x) => x.id !== id));
}

export const toast = {
  info: (text: string) => push('info', text),
  success: (text: string) => push('success', text),
  error: (text: string) => push('error', text),
};
