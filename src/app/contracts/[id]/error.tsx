'use client';

import { useEffect } from 'react';

export default function ContractDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Contract detail failed to load', error);
  }, [error]);

  return (
    <div className="container error-panel" role="alert">
      <h1>Something went wrong</h1>
      <p>We could not load this escrow. Please try again.</p>
      <button type="button" className="btn btn-primary" onClick={reset}>
        Retry
      </button>
    </div>
  );
}
