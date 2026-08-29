'use client';

import { useState, useEffect } from 'react';

/**
 * Hook for detecting online/offline status.
 *
 * Returns the current online status and updates in real-time as the network
 * state changes. Works with browser online/offline events.
 *
 * @returns Object with isOnline boolean status.
 */
export function useOnlineStatus(): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(() => {
    // Initialize with current navigator state (default to true if unavailable)
    if (typeof navigator !== 'undefined' && navigator.onLine !== undefined) {
      return navigator.onLine;
    }
    return true;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}
