'use client';

import { useEffect, useState } from 'react';
import { readAdmin } from './admin';
import { getAddress } from './freighter';

export function useIsArbiter(): boolean | null {
  const [isArbiter, setIsArbiter] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    const checkArbiter = async () => {
      try {
        const address = await getAddress();
        const admin = await readAdmin();
        // This client-side check is a UX gate only; the contract remains the authority.
        if (active) setIsArbiter(address === admin);
      } catch {
        if (active) setIsArbiter(false);
      }
    };

    checkArbiter();
    window.addEventListener('focus', checkArbiter);
    document.addEventListener('visibilitychange', checkArbiter);

    return () => {
      active = false;
      window.removeEventListener('focus', checkArbiter);
      document.removeEventListener('visibilitychange', checkArbiter);
    };
  }, []);

  return isArbiter;
}
