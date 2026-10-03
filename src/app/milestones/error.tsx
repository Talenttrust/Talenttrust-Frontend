'use client';

import Link from 'next/link';
import { useMilestonesRouteError } from '@/hooks/useMilestonesRouteError';

type MilestonesErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * State invariants for the milestones error boundary:
 *
 * 1. Reporting is idempotent per error identity (digest when present, else the
 *    error object). The same failure must not be reported twice, even if React
 *    re-renders or Strict Mode double-invokes effects. This prevents duplicate
 *    telemetry and alert fatigue.
 * 2. Reset is single-flight. A double click or a rapid retry must not dispatch
 *    multiple resets that could corrupt the parent state transition.
 * 3. Reporting and `reset()` must never throw out of the boundary. A failure to
 *    recover degrades to a user-safe notice instead of a second crash.
 * 4. No sensitive data is rendered to the user; only a stable digest is
 *    exposed for correlation with server logs.
 *
 * All four invariants are implemented by `useMilestonesRouteError`, which also
 * owns the sanitized metadata contract (`@/lib/milestonesRouteError`). This
 * component is only the presentational shell, so there is a single place to
 * reason about recovery behaviour.
 */
export default function MilestonesError({ error, reset }: MilestonesErrorProps) {
  const { isRetryDisabled, recoveryNotice, handleRetry } =
    useMilestonesRouteError(error, reset, error.digest);

  return (
    <main className="min-h-screen p-8" aria-labelledby="milestones-error-title">
      <section className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 id="milestones-error-title" className="text-2xl font-bold text-slate-900">
          Unable to load milestones
        </h1>
        <p className="mt-3 text-slate-600">
          Please try again. Contact support if the problem continues.
        </p>
        {recoveryNotice !== null ? (
          <p className="mt-2 text-sm text-slate-500" role="status">
            {recoveryNotice}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleRetry}
            disabled={isRetryDisabled}
            aria-disabled={isRetryDisabled}
            aria-describedby="milestones-retry-status"
            className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            {isRetryDisabled ? 'Retrying…' : 'Try again'}
          </button>
          <Link
            href="/"
            className="rounded-xl border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            Go home
          </Link>
        </div>
        <p id="milestones-retry-status" className="sr-only" aria-live="polite">
          {isRetryDisabled ? 'Retrying milestones.' : ''}
        </p>
      </section>
    </main>
  );
}
