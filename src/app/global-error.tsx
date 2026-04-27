'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[Global Error Boundary]', error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-50 font-sans">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-6xl">🚨</div>
          <h1 className="text-2xl font-bold text-gray-900">Critical Error</h1>
          <p className="text-gray-600">
            A critical error occurred. Please try reloading the page.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={reset}
              className="px-5 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-700 transition-colors"
            >
              Try Again
            </button>
            <a
              href="/"
              className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition-colors"
            >
              Go Home
            </a>
            <a
              href="mailto:support@talenttrust.io"
              className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition-colors"
            >
              Contact Support
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
