'use client';

import { useRef, useEffect } from 'react';
import { useOptionalWallet, useWallet } from './WalletProvider';
import { site } from '@/lib/site';

/** Renders nothing outside a WalletProvider. */
export function NetworkGuard() {
  return useOptionalWallet() ? <NetworkGuardBanner /> : null;
}

function NetworkGuardBanner() {
  const { state } = useWallet();
  const hasAnnounced = useRef(false);

  if (state.type !== 'wrong-network' && state.type !== 'network-unreadable') {
    hasAnnounced.current = false;
    return null;
  }

  const networkName = site.network === 'mainnet' ? 'Mainnet' : site.network.charAt(0).toUpperCase() + site.network.slice(1);
  if (state.type === 'network-unreadable') {
    return (
      <div
        className="alert alert-error"
        role={hasAnnounced.current ? undefined : 'alert'}
        style={{ marginTop: 0, borderRadius: 0 }}
      >
        <strong>Could not read network</strong>: Freighter's active network could not be verified.
        Reconnect your wallet and try again.
      </div>
    );
  }

  const actualNetwork = state.passphrase.includes('Public Global Stellar Network') ? 'Mainnet' :
                       state.passphrase.includes('Test SDF Network') ? 'Testnet' :
                       state.passphrase.includes('Future Network') ? 'Futurenet' : 'Unknown';

  return (
    <div
      className="alert alert-error"
      role={hasAnnounced.current ? undefined : 'alert'}
      style={{ marginTop: 0, borderRadius: 0 }}
    >
      <strong>Wrong network</strong>: Your wallet is on {actualNetwork}, but TalentTrust requires {networkName}.
      Open Freighter and switch to the correct network to continue.
    </div>
  );
}

export function useRequireNetwork(): boolean {
  const { state } = useWallet();
  const isCorrect = state.type === 'connected' || state.type === 'connecting';
  return isCorrect;
}
