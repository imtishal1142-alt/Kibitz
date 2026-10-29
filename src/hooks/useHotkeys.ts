import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

/**
 * Keyboard shortcuts. Keys are written like "ArrowLeft", "f", "shift+ArrowRight".
 * Ignored while typing in a field or when a dialog has focus.
 */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) return;
      const key = `${e.shiftKey && e.key.length > 1 ? 'shift+' : ''}${e.key.length === 1 ? e.key.toLowerCase() : e.key}`;
      const fn = ref.current[key];
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
