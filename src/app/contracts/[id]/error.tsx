'use client';

import { useEffect } from 'react';

export default function ContractError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Failed to load contract detail:', error);
  }, [error]);

  return (
    <main
      id="contract-detail-error"
      className="mx-auto flex min-h-[60%] w-full max-w-3xl flex-col items-center justify-center gap-4 px-4 py-16 text-center"
    >
      <h1 className="text-2xl font-semibold text-red-700 dark:text-red-400">
        Something went wrong
      </h1>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        We couldn&#39;t load this escrow. Please try again.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 hover:bg-blue-700 dark:bg-blue-500 dark:text-gray-900 dark:hover:bg-blue-400"
      >
        Retry
      </button>
    </main>
  );
}
