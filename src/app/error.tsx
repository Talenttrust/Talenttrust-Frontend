'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { reportError } from '../lib/errorReporter';
import {
  getErrorMessage,
  prepareErrorDetailForDom,
} from '../lib/redactErrorDetail';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  const [digest, setDigest] = useState<string | null>(error.digest ?? null);

  useEffect(() => {
    // Full detail only through the reporter; UI gets a safe digest back.
    setDigest(reportError(error, 'Error Boundary'));
  }, [error]);

  const detail = useMemo(() => {
    if (process.env.NODE_ENV === 'production') return null;
    return prepareErrorDetailForDom(getErrorMessage(error));
  }, [error]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-[var(--background)]">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl">⚠️</div>
        <h1 className="text-2xl font-bold text-gray-900">Unexpected Error</h1>
        <p className="text-gray-600">
          Something went wrong on our end. Please try again or contact support if
          the problem persists.
        </p>
        {digest && (
          <p
            className="text-xs font-mono text-gray-500"
            data-testid="error-boundary-digest"
          >
            Reference: {digest}
          </p>
        )}
        {detail && (
          <p
            className="text-xs text-gray-400 break-words"
            data-testid="error-boundary-detail"
          >
            {detail}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-700 transition-colors"
          >
            Try Again
          </button>
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
      </div>
    </main>
  );
}
