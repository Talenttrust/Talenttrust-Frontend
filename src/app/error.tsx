'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { reportError } from '../lib/errorReporter';

export interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

const MAX_RETRIES = 3;

/**
 * Route-level App Router error boundary.
 *
 * Retry invariants: each accepted click consumes one attempt; only one reset
 * may be in flight; retries stop at MAX_RETRIES; failures are reported without
 * exposing their details. Refs enforce these invariants synchronously, before
 * React has a chance to render batched state updates.
 */
function ErrorBoundary({ error, reset }: ErrorProps) {
  const [retryCount, setRetryCount] = useState(0);
  const [liveMessage, setLiveMessage] = useState('');
  const [resetFailed, setResetFailed] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const retryCountRef = useRef(0);
  const isResettingRef = useRef(false);
  const reportedObjectsRef = useRef(new WeakSet<object>());
  const reportedPrimitivesRef = useRef(new Set<unknown>());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const identity = error as unknown;
    if (identity !== null && (typeof identity === 'object' || typeof identity === 'function')) {
      if (reportedObjectsRef.current.has(identity as object)) return;
      reportedObjectsRef.current.add(identity as object);
    } else {
      if (reportedPrimitivesRef.current.has(identity)) return;
      reportedPrimitivesRef.current.add(identity);
    }
    reportError(identity, 'Error Boundary');
  }, [error]);

  const finishRetry = (failed: boolean, failure?: unknown) => {
    if (failed) {
      reportError(failure, 'Error Boundary reset', 'error', {
        retryCount: retryCountRef.current,
      });
      if (mountedRef.current) {
        setResetFailed(true);
        setLiveMessage('Recovery failed. Please try reloading the page.');
      }
    }

    isResettingRef.current = false;
    if (mountedRef.current) {
      setIsResetting(false);
      setRetryCount(retryCountRef.current);
    }
  };

  const handleRetry = () => {
    if (isResettingRef.current || retryCountRef.current >= MAX_RETRIES) return;
    if (typeof reset !== 'function') {
      // Invalid callbacks are failed attempts too, so repeated malformed input
      // cannot generate unbounded reports or keep the recovery button forever.
      retryCountRef.current += 1;
      setRetryCount(retryCountRef.current);
      reportError(new TypeError('Error boundary reset handler is not a function'), 'Error Boundary reset', 'error', {
        retryCount: retryCountRef.current,
      });
      setResetFailed(true);
      setLiveMessage('Recovery failed. Please try reloading the page.');
      return;
    }

    // Set both refs before calling user code; synchronous repeated events cannot
    // observe stale React state or start duplicate reset work.
    isResettingRef.current = true;
    setIsResetting(true);
    retryCountRef.current += 1;
    setRetryCount(retryCountRef.current);
    setResetFailed(false);
    setLiveMessage('Retrying, please wait…');

    let result: unknown;
    try {
      // Keep the public callback typed as Next.js does; inspecting the runtime
      // return value also supports legacy callers that return a promise.
      result = (reset as () => unknown)();
    } catch (failure) {
      finishRetry(true, failure);
      return;
    }

    // Preserve the synchronous Next.js reset contract while also guarding
    // promise-returning callers until fulfillment or rejection.
    let then: unknown;
    try {
      then = result !== null && (typeof result === 'object' || typeof result === 'function')
        ? (result as Promise<void>).then
        : undefined;
    } catch (failure) {
      finishRetry(true, failure);
      return;
    }

    if (typeof then === 'function') {
      Promise.resolve(result).then(
        () => finishRetry(false),
        (failure: unknown) => finishRetry(true, failure),
      );
    } else {
      finishRetry(false);
    }
  };

  const retriesExhausted = retryCount >= MAX_RETRIES;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-[var(--background)]">
      <div role="status" aria-live="assertive" aria-atomic="true" className="sr-only">
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

        {resetFailed && (
          <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            Recovery failed. Please try again or reload the page.
          </p>
        )}

        <div className="flex flex-col sm:flex-row justify-center gap-3">
          {!retriesExhausted && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isResetting}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {isResetting ? 'Retrying...' : 'Try Again'}
            </button>
          )}
          {retriesExhausted && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              Reload Page
            </button>
          )}
          <Link href="/" className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition-colors">
            Go Home
          </Link>
          <a href="mailto:support@talenttrust.io" className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition-colors">
            Contact Support
          </a>
        </div>

        {retriesExhausted && (
          <p className="text-xs text-gray-400">
            If the problem persists, please{' '}
            <a href="mailto:support@talenttrust.io" className="underline hover:text-gray-600">contact support</a>.
          </p>
        )}
      </div>
    </main>
  );
}

export { ErrorBoundary };
export const GlobalError = ErrorBoundary;
export const ErrorPage = ErrorBoundary;
export default ErrorBoundary;
