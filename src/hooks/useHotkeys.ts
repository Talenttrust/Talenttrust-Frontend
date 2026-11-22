'use client';

import { useEffect, useRef } from 'react';

export type HotkeyHandler = (event: KeyboardEvent) => void;
export type HotkeyMap = Record<string, HotkeyHandler | undefined>;

export interface UseHotkeysOptions {
  enabled?: boolean;
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as HTMLElement;
  if (typeof el.tagName === 'string' && EDITABLE_TAGS.has(el.tagName.toUpperCase())) {
    return true;
  }
  if (el.isContentEditable) return true;
  if (typeof el.getAttribute === 'function') {
    const ce = el.getAttribute('contenteditable');
    if (ce !== null && ce.toLowerCase() !== 'false') return true;
  }
  if (typeof el.closest === 'function') {
    if (el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) {
      return true;
    }
  }
  return false;
}

function isDialogOpen(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector('dialog[open]'));
}

/**
 * Registers global keyboard shortcuts mapped by `KeyboardEvent.key`.
 *
 * Ignores events when:
 * - focus/target is inside an `<input>`, `<textarea>`, `<select>`, or `contenteditable` element
 * - a modifier key (`Ctrl`, `Meta`, `Alt`) is held
 * - any native `<dialog>` is currently open (`dialog[open]`)
 * - `options.enabled` is `false`
 */
export function useHotkeys(map: HotkeyMap, options: UseHotkeysOptions = {}): void {
  const { enabled = true } = options;
  const mapRef = useRef<HotkeyMap>(map);

  useEffect(() => {
    mapRef.current = map;
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isDialogOpen()) return;
      if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) return;

      const handler = mapRef.current[event.key];
      if (!handler) return;

      event.preventDefault();
      handler(event);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
