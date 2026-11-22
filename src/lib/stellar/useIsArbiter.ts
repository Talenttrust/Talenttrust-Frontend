'use client';

import { useEffect, useState } from 'react';
import { readAdmin } from './admin';
import { getAddress } from './freighter';
import { useOptionalWallet } from '@/components/wallet/WalletProvider';

/**
 * true when the connected Freighter account is the contract admin (arbiter),
 * false when it is not or no wallet is connected, null while checking.
 */
export function useIsArbiter(): boolean | null {
  const [isArbiter, setIsArbiter] = useState<boolean | null>(null);
  const wallet = useOptionalWallet();
  const walletAddress = wallet ? wallet.address : undefined;

  useEffect(() => {
    let active = true;

    const checkArbiter = async () => {
      try {
        const address =
          walletAddress !== undefined ? walletAddress : await getAddress();
        if (!address) {
          if (active) setIsArbiter(false);
          return;
        }
        const admin = await readAdmin();
        // This client-side check is a UX gate only; the contract remains the authority.
        if (active) setIsArbiter(address === admin);
      } catch {
        if (active) setIsArbiter(false);
      }
    };

    checkArbiter();

    // Fallback focus/visibility listeners only when outside of WalletProvider
    if (wallet === null) {
      window.addEventListener('focus', checkArbiter);
      document.addEventListener('visibilitychange', checkArbiter);
      return () => {
        active = false;
        window.removeEventListener('focus', checkArbiter);
        document.removeEventListener('visibilitychange', checkArbiter);
      };
    }

    return () => {
      active = false;
    };
  }, [wallet, walletAddress]);

  return isArbiter;
}
