'use client';

import { createContext, useContext, useEffect, useReducer, ReactNode } from 'react';
import { isInstalled, getAddressSafe, getNetworkPassphrase, requestAccessSafe, isAllowedSafe } from '@/lib/stellar/freighter';
import { expectedPassphrase } from '@/lib/stellar/network';

type WalletState =
  | { type: 'unavailable' }
  | { type: 'disconnected' }
  | { type: 'connecting' }
  | { type: 'connected'; address: string; passphrase: string }
  | { type: 'wrong-network'; address: string; passphrase: string }
  | { type: 'error'; message: string };

type WalletAction =
  | { type: 'SET_UNAVAILABLE' }
  | { type: 'SET_DISCONNECTED' }
  | { type: 'SET_CONNECTING' }
  | { type: 'SET_CONNECTED'; address: string; passphrase: string }
  | { type: 'SET_WRONG_NETWORK'; address: string; passphrase: string }
  | { type: 'SET_ERROR'; message: string };

const initialState: WalletState = { type: 'disconnected' };

function walletReducer(state: WalletState, action: WalletAction): WalletState {
  switch (action.type) {
    case 'SET_UNAVAILABLE':
      return { type: 'unavailable' };
    case 'SET_DISCONNECTED':
      return { type: 'disconnected' };
    case 'SET_CONNECTING':
      return { type: 'connecting' };
    case 'SET_CONNECTED':
      return { type: 'connected', address: action.address, passphrase: action.passphrase };
    case 'SET_WRONG_NETWORK':
      return { type: 'wrong-network', address: action.address, passphrase: action.passphrase };
    case 'SET_ERROR':
      return { type: 'error', message: action.message };
    default:
      return state;
  }
}

interface WalletContextValue {
  state: WalletState;
  connect: () => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

const AUTOCONNECT_KEY = 'tt.wallet.autoconnect';

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(walletReducer, initialState);

  const checkWallet = async () => {
    try {
      const installed = await isInstalled();
      if (!installed) {
        dispatch({ type: 'SET_UNAVAILABLE' });
        return;
      }

      const allowed = await isAllowedSafe();
      if (!allowed) {
        dispatch({ type: 'SET_DISCONNECTED' });
        return;
      }

      const address = await getAddressSafe();
      const passphrase = await getNetworkPassphrase();

      if (!address) {
        dispatch({ type: 'SET_DISCONNECTED' });
        return;
      }

      const expected = expectedPassphrase();
      if (passphrase !== expected) {
        dispatch({ type: 'SET_WRONG_NETWORK', address, passphrase });
        return;
      }

      dispatch({ type: 'SET_CONNECTED', address, passphrase });
    } catch (e) {
      dispatch({ type: 'SET_ERROR', message: (e as Error).message });
    }
  };

  const connect = async () => {
    dispatch({ type: 'SET_CONNECTING' });
    try {
      const installed = await isInstalled();
      if (!installed) {
        dispatch({ type: 'SET_UNAVAILABLE' });
        return;
      }

      const result = await requestAccessSafe();
      if (result.error) {
        dispatch({ type: 'SET_ERROR', message: result.error });
        return;
      }

      const address = result.address;
      const passphrase = await getNetworkPassphrase();
      const expected = expectedPassphrase();

      if (passphrase !== expected) {
        dispatch({ type: 'SET_WRONG_NETWORK', address, passphrase });
        return;
      }

      dispatch({ type: 'SET_CONNECTED', address, passphrase });
      localStorage.setItem(AUTOCONNECT_KEY, '1');
    } catch (e) {
      dispatch({ type: 'SET_ERROR', message: (e as Error).message });
    }
  };

  const disconnect = () => {
    dispatch({ type: 'SET_DISCONNECTED' });
    localStorage.removeItem(AUTOCONNECT_KEY);
  };

  const refresh = async () => {
    await checkWallet();
  };

  useEffect(() => {
    const autoconnect = localStorage.getItem(AUTOCONNECT_KEY) === '1';
    if (autoconnect) {
      checkWallet();
    } else {
      isInstalled().then((installed) => {
        dispatch(installed ? { type: 'SET_DISCONNECTED' } : { type: 'SET_UNAVAILABLE' });
      });
    }
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      if (state.type === 'connected' || state.type === 'wrong-network') {
        checkWallet();
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden && (state.type === 'connected' || state.type === 'wrong-network')) {
        checkWallet();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.type]);

  return (
    <WalletContext.Provider value={{ state, connect, disconnect, refresh }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}
