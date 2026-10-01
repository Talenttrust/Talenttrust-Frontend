'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { reportError } from '../lib/errorReporter';

/**
 * Validation boundaries for the root error boundary.
 *
 * Invariants:
 * 1. The component never throws during render, even when `error` or `reset`
 *    are malformed (null, undefined, non-function, non-Error values).
 * 2. A given error object is reported at most once per mount, even if React
 *    re-renders the boundary with the same error reference.
 * 3. The reset callback is invoked at most once per click and failures in
 *    the callback are contained so the UI remains usable.
 * 4. No error message, stack trace, or digest is ever rendered to the DOM.
 */

/** Maximum length of a digest value we consider valid. */
const MAX_DIGEST_LENGTH = 256;

export interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Maximum number of retry attempts before the "Try Again" button is replaced
 * with a harder recovery path (page reload / go home).
 *
 * Invariant: once `retryCount >= MAX_RETRIES`, no further calls to `reset()`
 * are made — the user is directed to reload or navigate away instead.
 */
const MAX_RETRIES = 3;

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  const [retryCount, setRetryCount] = useState(0);
  const [liveMessage, setLiveMessage] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const isResettingRef = useRef(false);
  const lastReportedErrorRef = useRef<Error | null>(null);

  const retriesExhausted = retryCount >= MAX_RETRIES;

  useEffect(() => {
    // Structural validation for error invariant
    const safeError = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
    
    if (safeError !== lastReportedErrorRef.current) {
      lastReportedErrorRef.current = safeError;
      try {
        reportError(safeError, 'Error Boundary');
      } catch (err) {
        // Prevent reportError failure from crashing the boundary
      }
    }
  }, [error]);

  const handleReset = useCallback(() => {
    if (isResettingRef.current || retriesExhausted) return;

    if (typeof reset !== 'function') {
      try {
        reportError(new TypeError('Error boundary reset handler is not a function'), 'Error Boundary');
      } catch (err) {
        // Ignore
      }
      return;
    }

    isResettingRef.current = true;
    setIsResetting(true);
    setResetError(null);
    setLiveMessage('Retrying, please wait…');

    try {
      const result: unknown = reset();

      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<unknown>)
          .catch((err) => {
            try {
              reportError(err instanceof Error ? err : new Error('Reset failed'), 'Error Boundary Reset');
            } catch (e) {
              // Ignore
            }
            setResetError('Recovery failed. Please try again or reload the page.');
            setLiveMessage('Recovery failed. Please try reloading the page.');
          })
          .finally(() => {
            isResettingRef.current = false;
            setIsResetting(false);
            setRetryCount((c) => c + 1);
          });
      } else {
        isResettingRef.current = false;
        setIsResetting(false);
        setRetryCount((c) => c + 1);
      }
    } catch (err) {
      isResettingRef.current = false;
      setIsResetting(false);
      setRetryCount((c) => c + 1);
      try {
        reportError(err instanceof Error ? err : new Error('Reset failed'), 'Error Boundary Reset');
      } catch (e) {
        // Ignore
      }
      setResetError('Recovery failed. Please try again or reload the page.');
      setLiveMessage('Recovery failed. Please try reloading the page.');
    }
  }, [reset, retriesExhausted]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-[var(--background)]">
      <div
        role="status"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {liveMessage}
      </div>

      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl" aria-hidden="true">⚠️</div>

        <h1 className="text-2xl font-bold text-gray-900">Unexpected Error</h1>

        <p className="text-gray-600">
          {retriesExhausted
            ? 'We were unable to recover after several attempts. Please reload the page or go home.'
            : 'Something went wrong on our end. Please try again or contact support if the problem persists.'}
        </p>

        {resetError && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            {resetError}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-6">
          {!retriesExhausted && (
            <button
              onClick={handleReset}
              disabled={isResetting}
              className="px-5 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResetting ? 'Retrying...' : 'Try Again'}
            </button>
          )}
          <Link
            href="/"
            className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition-colors"
          >
            Go Home
          </Link>
          <a
            href="mailto:support@talenttrust.io"
            className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition-colors"
          >
            Contact Support
          </a>
        </div>

        {retriesExhausted && (
          <p className="text-xs text-gray-400">
            If the problem persists, please{' '}
            <a
              href="mailto:support@talenttrust.io"
              className="underline hover:text-gray-600"
            >
              contact support
            </a>
            .
          </p>
        )}
      </div>
    </main>
  );
}

// Preserve backwards compatibility for callers expecting `GlobalError` or `ErrorPage`
export const GlobalError = ErrorBoundary;
export const ErrorPage = ErrorBoundary;
