'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMilestonesRouteError } from '@/hooks/useMilestonesRouteError';
import { ensureValidError, getErrorIdentity } from '@/lib/milestonesErrorUtils';
import { reportError } from '@/lib/errorReporter';
import { MILESTONES_RESET_FAILURE_NOTICE } from '@/hooks/useMilestonesRouteError';
import { MILESTONES_ROUTE_ERROR_CODE } from '@/lib/milestonesRouteError';

type MilestonesErrorProps = {
  error: unknown;
  reset: () => void;
};

/**
 * State invariants for the milestones error boundary:
 *
 * 1. Reporting is idempotent per error identity. The same error object
 *    (or the same digest) must not be reported more than once, even if
 *    React re-renders or Strict Mode double-invokes effects. This prevents
 *    duplicate telemetry and alert fatigue.
 * 2. Reset is guarded against concurrent/repeated invocation. A double
 *    click or a rapid retry must not dispatch multiple resets that could
 *    corrupt the parent state transition.
 * 3. Reporting must never throw. A failure in the observability path must
 *    not cause the error boundary itself to crash or block recovery.
 * 4. No sensitive data is rendered to the user; only a stable digest is
 *    exposed for correlation with server logs.
 */

export default function MilestonesError({ error, reset }: MilestonesErrorProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [resetFailed, setResetFailed] = useState(false);
  const reportedError = useRef<Error | null>(null);
  const retryInFlightRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);

  useEffect(() => {
    const validError = ensureValidError(error);
    const errorId = getErrorIdentity(validError);
    if (reportedError.current === errorId) return;
    reportedError.current = errorId;
    setIsRetrying(false);
    setResetFailed(false);
    reportError(validError, 'Milestones page', 'error', {
      code: MILESTONES_ROUTE_ERROR_CODE,
      name: 'Error',
    });
  }, [error]);

  const handleRetry = () => {
    if (retryInFlightRef.current) return;
    retryInFlightRef.current = true;
    setIsRetrying(true);
    try {
      reset();
    } catch (e) {
      setResetFailed(true);
      setIsRetrying(false);
    }
  };

  return (
    <main className="min-h-screen p-8" aria-labelledby="milestones-error-title">
      <section className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 id="milestones-error-title" className="text-2xl font-bold text-slate-900">
          Unable to load milestones
        </h1>
        <p className="mt-3 text-slate-600">
          Please try again. Contact support if the problem continues.
        </p>
        {resetFailed ? (
          <p className="mt-2 text-sm text-slate-500" role="status">
            {MILESTONES_RESET_FAILURE_NOTICE}
          </p>
        ) : retryCountRef.current > 0 ? (
          <p className="mt-2 text-sm text-slate-500" role="status">
            Retry attempts: {retryCountRef.current}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            aria-disabled={isRetrying}
            aria-describedby="milestones-retry-status"
            className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            {isRetrying ? 'Retrying…' : 'Try again'}
          </button>
          <Link
            href="/"
            className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            Go home
          </Link>
        </div>
        <p id="milestones-retry-status" className="sr-only" aria-live="polite">
          {isRetrying ? 'Retrying milestones.' : ''}
        </p>
      </section>
    </main>
  );
}