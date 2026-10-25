'use client';

import { useEffect, useState } from 'react';

/**
 * useOnlineStatus — tracks the browser's online/offline state.
 *
 * SSR-safe: returns `true` on the server and during the first client render
 * to avoid a hydration mismatch (`navigator.onLine` is only available in the
 * browser). After mount, it syncs to `navigator.onLine` and listens for
 * `online` / `offline` events.
 *
 * @returns `true` when the browser reports an active network connection,
 *          `false` when offline.
 *
 * @example
 * const isOnline = useOnlineStatus();
 * if (!isOnline) return <OfflineBanner />;
 */
export function useOnlineStatus(): boolean {
  // Default to `true` so SSR and the initial client render match.
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    // On the client, sync to the actual navigator state immediately.
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
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

  return isOnline;
}
