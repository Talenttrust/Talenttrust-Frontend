'use client';

import { useEffect } from 'react';

/** True when `target` is a text-entry element that keyboard shortcuts must not fire over. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export interface UseMilestonesKeyboardShortcutsOptions {
  /** Opens the milestone creation form. Bound to Ctrl/Cmd+Shift+N. */
  onAddMilestone: () => void;
  /** Downloads the current milestone list as an .ics calendar file. Bound to Ctrl/Cmd+Shift+C. */
  onAddToCalendar: () => void;
  /** Set to `false` to detach the listener, e.g. while a dialog already owns keyboard focus. */
  enabled?: boolean;
}

/**
 * Global keyboard shortcuts for milestones' primary actions.
 *
 * | Shortcut | Action |
 * |----------|--------|
 * | `Ctrl/Cmd + Shift + N` | Add milestone |
 * | `Ctrl/Cmd + Shift + C` | Add to calendar |
 *
 * Shift is included specifically to avoid clashing with browser/native
 * shortcuts (e.g. Ctrl/Cmd+N for a new window). Ignored while a text input,
 * textarea, select, or contenteditable element has focus so normal typing is
 * never intercepted.
 */
export function useMilestonesKeyboardShortcuts({
  onAddMilestone,
  onAddToCalendar,
  enabled = true,
}: UseMilestonesKeyboardShortcutsOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === 'n') {
        event.preventDefault();
        onAddMilestone();
      } else if (key === 'c') {
        event.preventDefault();
        onAddToCalendar();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onAddMilestone, onAddToCalendar]);
}

export default useMilestonesKeyboardShortcuts;
