'use client';

import Link from 'next/link';

/**
 * Offline fallback page.
 *
 * Shown by the service worker when a navigation request fails because the
 * device is offline. Explains that escrow data and signing require a
 * network connection, and provides a retry button plus navigation links
 * back to the main app routes.
 *
 * Accessibility:
 * - Single <h1> for screen reader heading navigation.
 * - Retry button has an accessible name and focus ring.
 * - Links are keyboard-navigable with visible focus indicators.
 * - 375px-width friendly: no horizontal scroll, text wraps naturally.
 */
export default function OfflinePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--background)] text-[var(--foreground)]">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Offline icon */}
        <div aria-hidden="true" className="flex justify-center">
          <svg
            className="h-16 w-16 text-[var(--muted-foreground)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 4l18 18M8.5 16.5a5 5 0 017 0M5 13a9 9 0 0114-1M2 10a13 13 0 0114-4"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 20v.01"
            />
          </svg>
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            You&apos;re Offline
          </h1>
          <p className="text-[var(--muted-foreground)]">
            TalentTrust needs a network connection to load escrow data and
            sign transactions. Your funds are safe — please reconnect to
            continue.
          </p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            While offline, you can still browse previously visited pages
            from your cache. Any actions that require the blockchain or
            wallet signing will wait until you&apos;re back online.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-lg border border-[var(--border)] text-[var(--foreground)] font-medium hover:bg-[var(--muted)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            Go Home
          </Link>
        </div>
      </div>
    </main>
  );
}
