'use client';

import React, { createContext, useContext, useState, ReactNode, useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/components/toast/toast-provider';

export type WalletContextType = {
  address: string | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletContextType | undefined>(undefined);

/**
 * WalletProvider provides the global wallet connection state.
 * 
 * It includes an optional inactivity timeout that automatically disconnects
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

  const disconnect = useCallback(() => {
    setAddress(null);
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
    // Only run on client and when an address is connected with a valid timeout
    if (typeof window === 'undefined' || !address || idleTimeout <= 0) {
      return;
    }

    const events = ['pointermove', 'keydown', 'visibilitychange', 'mousedown', 'touchstart'];
    
    const handleActivity = () => {
      resetTimer();
    };

    // Add activity listeners
    events.forEach(event => window.addEventListener(event, handleActivity, { passive: true }));
    
    // Start initial timer
    resetTimer();

    return () => {
      // Cleanup listeners and timer
      events.forEach(event => window.removeEventListener(event, handleActivity));
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [address, idleTimeout, resetTimer]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      // Mocking wallet connection delay
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // Mocked address
      setAddress('0x71C7656EC7ab88b098defB751B7401B5f6d8976F');
    } catch (err) {
      setError('Failed to connect wallet');
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

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
