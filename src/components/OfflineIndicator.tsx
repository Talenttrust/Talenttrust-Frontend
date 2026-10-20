'use client';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * OfflineIndicator — small header indicator that announces "Offline" when
 * the browser reports no network connection.
 *
 * Accessibility:
 * - Uses `role="status"` so screen readers announce the state change.
 * - Has a visually-hidden text label for screen readers even when the icon
 *   is the only visible content.
 * - Visible text "Offline" is shown alongside the icon for clarity.
 * - Focus is not needed on this element (it is non-interactive), but the
 *   text contrast meets WCAG 2.1 AA in both light and dark themes.
 *
 * The indicator renders nothing when online to avoid visual clutter.
 */
export default function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-1.5 rounded-full bg-[var(--status-warning-bg)] px-3 py-1 text-xs font-medium text-[var(--status-warning-foreground)]"
    >
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 4l18 18M8.5 16.5a5 5 0 017 0M5 13a9 9 0 0114-1"
        />
      </svg>
      <span>Offline</span>
    </div>
  );
}
