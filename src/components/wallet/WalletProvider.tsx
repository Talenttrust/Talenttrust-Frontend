'use client';

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import {
  isInstalled,
  getAddressSafe,
  getNetworkPassphrase,
  requestAccessSafe,
  isAllowedSafe,
  signTransactionSafe,
} from '@/lib/stellar/freighterWallet';
import { expectedPassphrase } from '@/lib/stellar/network';
import { WatchWalletChanges } from '@stellar/freighter-api';

export type WalletState =
  | { type: 'unavailable' }
  | { type: 'disconnected' }
  | { type: 'connecting' }
  | { type: 'connected'; address: string; passphrase: string }
  | { type: 'wrong-network'; address: string; passphrase: string }
  | { type: 'error'; message: string };

export type WalletAction =
  | { type: 'SET_UNAVAILABLE' }
  | { type: 'SET_DISCONNECTED' }
  | { type: 'SET_CONNECTING' }
  | { type: 'SET_CONNECTED'; address: string; passphrase: string }
  | { type: 'SET_WRONG_NETWORK'; address: string; passphrase: string }
  | { type: 'SET_ERROR'; message: string };

const initialState: WalletState = { type: 'disconnected' };

export function walletReducer(state: WalletState, action: WalletAction): WalletState {
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

export interface WalletContextValue {
  state: WalletState;
  address: string | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  refresh: () => Promise<void>;
  signTx: (xdr: string, networkPassphrase: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

const AUTOCONNECT_KEY = 'tt.wallet.autoconnect';

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}

/** Returns true when the autoconnect flag is set; false on any storage failure. */
function readAutoconnect(): boolean {
  return safeGetItem(AUTOCONNECT_KEY) === '1';
}

/** Persists or clears the autoconnect flag; never throws. */
function writeAutoconnect(on: boolean): void {
  if (on) {
    safeSetItem(AUTOCONNECT_KEY, '1');
  } else {
    safeRemoveItem(AUTOCONNECT_KEY);
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(walletReducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const checkWallet = useCallback(async () => {
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
  }, []);

  const connect = useCallback(async () => {
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
      writeAutoconnect(true);
    } catch (e) {
      dispatch({ type: 'SET_ERROR', message: (e as Error).message });
    }
  }, []);

  const disconnect = useCallback(() => {
    dispatch({ type: 'SET_DISCONNECTED' });
    writeAutoconnect(false);
  }, []);

  const refresh = useCallback(async () => {
    await checkWallet();
  }, [checkWallet]);

  const signTx = useCallback(async (xdr: string, networkPassphrase: string): Promise<string> => {
    const result = await signTransactionSafe(xdr, { networkPassphrase });
    if (result.error) {
      throw new Error(result.error);
    }
    if (!result.signedXdr) {
      throw new Error('Freighter did not return a signed transaction.');
    }
    return result.signedXdr;
  }, []);

  useEffect(() => {
    const autoconnect = readAutoconnect();
    if (autoconnect) {
      checkWallet();
    } else {
      isInstalled().then((installed) => {
        dispatch(installed ? { type: 'SET_DISCONNECTED' } : { type: 'SET_UNAVAILABLE' });
      });
    }
  }, [checkWallet]);

  useEffect(() => {
    let watcher: { stop?: () => void } | null = null;

    try {
      if (typeof WatchWalletChanges === 'function') {
        const instance = new WatchWalletChanges();
        if (typeof instance.watch === 'function') {
          instance.watch((params: {
            address?: string;
            network?: string;
            networkPassphrase?: string;
            error?: unknown;
          }) => {
            if (params.error || !params.address) {
              if (
                stateRef.current.type === 'connected' ||
                stateRef.current.type === 'wrong-network'
              ) {
                dispatch({ type: 'SET_DISCONNECTED' });
              }
              return;
            }

            const expected = expectedPassphrase();
            const passphrase = params.networkPassphrase || expected;

            if (passphrase !== expected) {
              dispatch({
                type: 'SET_WRONG_NETWORK',
                address: params.address,
                passphrase,
              });
            } else {
              dispatch({
                type: 'SET_CONNECTED',
                address: params.address,
                passphrase,
              });
            }
          });
          watcher = instance;
        }
      }
    } catch {
      watcher = null;
    }

    const handleFocus = () => {
      if (
        stateRef.current.type === 'connected' ||
        stateRef.current.type === 'wrong-network'
      ) {
        checkWallet();
      }
    };

    const handleVisibilityChange = () => {
      if (
        !document.hidden &&
        (stateRef.current.type === 'connected' ||
          stateRef.current.type === 'wrong-network')
      ) {
        checkWallet();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (watcher && typeof watcher.stop === 'function') {
        try {
          watcher.stop();
        } catch {
          // Ignore watcher cleanup errors
        }
      }
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkWallet]);

  const address =
    state.type === 'connected' || state.type === 'wrong-network'
      ? state.address
      : null;
  const isConnecting = state.type === 'connecting';
  const error = state.type === 'error' ? state.message : null;

  return (
    <WalletContext.Provider
      value={{
        state,
        address,
        isConnecting,
        error,
        connect,
        disconnect,
        refresh,
        signTx,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

/** Like useWallet, but returns null when rendered outside a WalletProvider. */
export function useOptionalWallet() {
  return useContext(WalletContext) ?? null;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}

export default WalletContext;
