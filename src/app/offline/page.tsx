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
    <div className="container offline-page">
      <div className="offline-inner">
        {/* Offline icon */}
        <div aria-hidden="true" className="offline-icon">
          <svg
            width="64"
            height="64"
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

        <div>
          <h1>
            You&apos;re Offline
          </h1>
          <p className="muted">
            TalentTrust needs a network connection to load escrow data and
            sign transactions. Your funds are safe — please reconnect to
            continue.
          </p>
        </div>

        <div className="card">
          <p className="small muted" style={{ margin: 0 }}>
            While offline, you can still browse previously visited pages
            from your cache. Any actions that require the blockchain or
            wallet signing will wait until you&apos;re back online.
          </p>
        </div>

        <div className="row" style={{ justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn btn-primary"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="btn btn-secondary"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
