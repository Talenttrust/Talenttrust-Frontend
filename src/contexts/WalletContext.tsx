'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/components/toast/toast-provider';
import { requestAccess } from '@stellar/freighter-api';
import { getItem, setItem, removeItem } from '@/lib/safeStorage';

const STORAGE_KEY = 'talenttrust-wallet-address';

export type WalletContextType = {
  address: string | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const FREIGHTER_NOT_INSTALLED = 'Freighter wallet is not installed. Please install the Freighter browser extension.';
export const USER_REJECTED = 'User rejected the connection request.';

/**
 * WalletProvider provides the global wallet connection state.
 *
 * Integrates with the Freighter Stellar wallet extension via @stellar/freighter-api.
 * On mount, rehydrates the connected address from localStorage. The connect()
 * method checks for Freighter availability, requests access, and surfaces
 * distinct error messages for "not installed" and "user rejected" cases.
 *
 * Includes an optional inactivity timeout that automatically disconnects
 * the wallet after a period of user inactivity.
 *
 * @param idleTimeout - Inactivity duration in milliseconds before auto-disconnect.
 *                      Set to 0 or undefined to disable.
 */
export function WalletProvider({
  children,
  idleTimeout = 0
}: {
  children: ReactNode;
  idleTimeout?: number;
}) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showSuccess } = useToast();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rehydrate saved address from localStorage on mount
  useEffect(() => {
    const saved = getItem(STORAGE_KEY);
    if (saved) {
      setAddress(saved);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    removeItem(STORAGE_KEY);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Resets the inactivity timer. If the timer expires, the wallet is disconnected.
   */
  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (address && idleTimeout > 0) {
      timerRef.current = setTimeout(() => {
        disconnect();
        showSuccess({
          title: 'Session expired',
          description: 'You have been disconnected due to inactivity.',
        });
      }, idleTimeout);
    }
  }, [address, idleTimeout, disconnect, showSuccess]);

  // Handle idle auto-disconnect logic
  useEffect(() => {
    if (typeof window === 'undefined' || !address || idleTimeout <= 0) {
      return;
    }

    const events = ['pointermove', 'keydown', 'visibilitychange', 'mousedown', 'touchstart'];

    const handleActivity = () => {
      resetTimer();
    };

    events.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));
    resetTimer();

    return () => {
      events.forEach(event => window.removeEventListener(event, handleActivity));
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [address, idleTimeout, resetTimer]);

  /**
   * Connects to the Freighter Stellar wallet.
   *
   * 1. Guards against server-side rendering.
   * 2. Checks for Freighter extension availability via window.freighter.
   * 3. Calls requestAccess() to prompt the user for approval.
   * 4. Maps results to distinct error strings or sets the Stellar public key.
   * 5. Persists the address in localStorage on success.
   */
  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      if (typeof window === 'undefined') {
        throw new Error('FREIGHTER_NOT_INSTALLED');
      }

      if (!window.freighter) {
        throw new Error('FREIGHTER_NOT_INSTALLED');
      }

      const result = await requestAccess();

      if (result.error) {
        throw new Error('USER_REJECTED');
      }

      if (!result.address) {
        throw new Error('USER_REJECTED');
      }

      setAddress(result.address);
      setItem(STORAGE_KEY, result.address);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';

      if (message === 'FREIGHTER_NOT_INSTALLED') {
        setError(FREIGHTER_NOT_INSTALLED);
      } else if (message === 'USER_REJECTED') {
        setError(USER_REJECTED);
      } else {
        setError(message);
      }
    } finally {
      setIsConnecting(false);
    }
  }, []);

  return (
    <WalletContext.Provider value={{ address, isConnecting, error, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  );
}

/**
 * Hook to access the wallet connection context.
 *
 * Must be used within a WalletProvider. Returns the current wallet state
 * including the connected Stellar public key, connection status, error
 * messages, and connect/disconnect actions.
 *
 * @returns {WalletContextType} The wallet context value.
 * @throws {Error} If used outside of WalletProvider.
 */
export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
