'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { EscrowContract } from '@/lib/api';
import {
  appendNotification,
  clearNotifications,
  dismiss,
  loadNotifications,
  markAllRead,
  markRead,
  NotificationsStore,
  saveNotifications,
  unreadCount,
} from '@/lib/notifications';
import {
  loadStore,
  saveStore,
  snapshotOf,
  unwatch,
  WATCH_STORE_KEY,
  watch,
  WatchEvent,
  WatchEventType,
  WatchStore,
} from '@/lib/watchlist';
import {
  fetchContractById,
  POLL_INTERVAL_MS,
  PollerOptions,
  PollErrorInfo,
  STALE_AFTER_FAILURES,
  startPoller,
} from '@/lib/poller';
import { NOTIFICATIONS_KEY } from '@/lib/notifications';
import {
  defaultDesktopSettings,
  DESKTOP_NOTIFY_KEY,
  DesktopNotificationPermission,
  DesktopNotifySettings,
  getPermission,
  loadDesktopSettings,
  notifyDesktop,
  requestPermission,
  saveDesktopSettings,
} from '@/lib/desktopNotifications';

interface NotificationsContextValue {
  items: NotificationsStore['items'];
  unread: number;
  watchedIds: number[];
  isWatched: (id: number) => boolean;
  toggleWatch: (contract: EscrowContract) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  dismiss: (id: string) => void;
  clear: () => void;
  announcement: string;
  desktopSettings: DesktopNotifySettings;
  desktopPermission: DesktopNotificationPermission;
  setDesktopEnabled: (enabled: boolean) => Promise<void>;
  toggleDesktopType: (type: WatchEventType) => void;
  /** True after repeated failed polls, until the user dismisses it or polling recovers. */
  updatesPaused: boolean;
  dismissUpdatesPaused: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export interface NotificationsProviderProps {
  children: React.ReactNode;
  poller?: Partial<Omit<PollerOptions, 'onEvents' | 'onRemoved'>>;
}

export function NotificationsProvider({ children, poller }: NotificationsProviderProps) {
  const [notifications, setNotifications] = useState<NotificationsStore>({ version: 1, items: [] });
  const [watchStore, setWatchStore] = useState<WatchStore>({ version: 1, items: [] });
  const [announcement, setAnnouncement] = useState('');
  const [desktopSettings, setDesktopSettings] = useState<DesktopNotifySettings>(defaultDesktopSettings);
  const [desktopPermission, setDesktopPermission] = useState<DesktopNotificationPermission>('default');
  const [stale, setStale] = useState(false);
  const [staleDismissed, setStaleDismissed] = useState(false);
  const staleRef = useRef(false);
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;
  const desktopSettingsRef = useRef(desktopSettings);
  desktopSettingsRef.current = desktopSettings;

  const refresh = useCallback(() => {
    setNotifications(loadNotifications());
    setWatchStore(loadStore());
    setDesktopSettings(loadDesktopSettings());
    setDesktopPermission(getPermission());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Cross-tab sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === WATCH_STORE_KEY ||
        e.key === NOTIFICATIONS_KEY ||
        e.key === DESKTOP_NOTIFY_KEY ||
        e.key === null
      ) {
        refresh();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  // Background poller.
  useEffect(() => {
    const stop = startPoller({
      ...poller,
      intervalMs: poller?.intervalMs ?? POLL_INTERVAL_MS,
      fetchContract: poller?.fetchContract ?? ((id) => fetchContractById(id)),
      loadStore: poller?.loadStore ?? loadStore,
      saveStore: poller?.saveStore ?? saveStore,
      onEvents: (id: number, events: WatchEvent[], contract: EscrowContract) => {
        let next = notificationsRef.current;
        for (const event of events) {
          const message = `${contract.title ? `#${id} ${contract.title}: ` : `#${id}: `}${event.message}`;
          next = appendNotification(next, {
            escrowId: id,
            type: event.type,
            title: event.title,
            message,
          });
          notifyDesktop(
            {
              escrowId: id,
              type: event.type,
              title: event.title,
              message,
            },
            desktopSettingsRef.current,
          );
        }
        saveNotifications(next);
        notificationsRef.current = next;
        setNotifications(next);
        const last = events[events.length - 1];
        if (last) setAnnouncement(`${last.title}. ${unreadCount(next)} unread.`);
      },
      onError: (info: PollErrorInfo) => {
        poller?.onError?.(info);
        if (info.consecutiveFailures >= STALE_AFTER_FAILURES) {
          if (!staleRef.current) {
            staleRef.current = true;
            setStale(true);
            setAnnouncement('Updates paused, retrying.');
          }
        }
      },
      onRecover: () => {
        poller?.onRecover?.();
        // Recovery re-arms the notice for the next outage.
        staleRef.current = false;
        setStale(false);
        setStaleDismissed(false);
      },
      onRemoved: (id: number) => {
        const next = unwatch(id);
        setWatchStore(next);
        const message = `Escrow #${id} is no longer available and was removed from your watchlist.`;
        const withNotice = appendNotification(notificationsRef.current, {
          escrowId: id,
          type: 'cancelled',
          title: 'Escrow removed',
          message,
        });
        saveNotifications(withNotice);
        notificationsRef.current = withNotice;
        setNotifications(withNotice);
        setAnnouncement(message);
      },
      addVisibilityListener:
        poller?.addVisibilityListener ??
        ((fn) => {
          document.addEventListener('visibilitychange', fn);
          return () => document.removeEventListener('visibilitychange', fn);
        }),
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleWatch = useCallback((contract: EscrowContract) => {
    setWatchStore((current) => {
      const watchedNow = current.items.some((i) => i.id === contract.id);
      if (watchedNow) {
        return unwatch(contract.id);
      }
      const { store, evicted } = watch(contract.id, snapshotOf(contract));
      if (evicted.length > 0) {
        let nextNotifications = notificationsRef.current;
        let lastMessage = '';
        for (const evictedId of evicted) {
          lastMessage = `Escrow #${evictedId} was removed from your watchlist to stay under the limit`;
          nextNotifications = appendNotification(nextNotifications, {
            escrowId: evictedId,
            type: 'cancelled',
            title: 'Watchlist limit reached',
            message: lastMessage,
          });
        }
        saveNotifications(nextNotifications);
        notificationsRef.current = nextNotifications;
        setNotifications(nextNotifications);
        setAnnouncement(lastMessage);
      }
      return store;
    });
  }, []);

  const doMarkAllRead = useCallback(() => {
    const next = markAllRead(notificationsRef.current);
    saveNotifications(next);
    notificationsRef.current = next;
    setNotifications(next);
    setAnnouncement('All notifications marked as read.');
  }, []);

  const doMarkRead = useCallback((id: string) => {
    const next = markRead(notificationsRef.current, id);
    if (next === notificationsRef.current) return;
    saveNotifications(next);
    notificationsRef.current = next;
    setNotifications(next);
    setAnnouncement(`Notification marked as read. ${unreadCount(next)} unread.`);
  }, []);

  const doDismiss = useCallback((id: string) => {
    const next = dismiss(notificationsRef.current, id);
    if (next === notificationsRef.current) return;
    saveNotifications(next);
    notificationsRef.current = next;
    setNotifications(next);
    setAnnouncement(`Notification dismissed. ${unreadCount(next)} unread.`);
  }, []);

  const doClear = useCallback(() => {
    const next = clearNotifications();
    notificationsRef.current = next;
    setNotifications(next);
    setAnnouncement('Notifications cleared.');
  }, []);

  const setDesktopEnabled = useCallback(async (enabled: boolean) => {
    if (!enabled) {
      const next: DesktopNotifySettings = { ...desktopSettingsRef.current, enabled: false };
      saveDesktopSettings(next);
      desktopSettingsRef.current = next;
      setDesktopSettings(next);
      setAnnouncement('Desktop notifications disabled.');
      return;
    }

    let perm = getPermission();
    if (perm === 'default') {
      perm = await requestPermission();
    }
    setDesktopPermission(perm);

    if (perm === 'granted') {
      const next: DesktopNotifySettings = { ...desktopSettingsRef.current, enabled: true };
      saveDesktopSettings(next);
      desktopSettingsRef.current = next;
      setDesktopSettings(next);
      setAnnouncement('Desktop notifications enabled.');
    } else {
      const next: DesktopNotifySettings = { ...desktopSettingsRef.current, enabled: false };
      saveDesktopSettings(next);
      desktopSettingsRef.current = next;
      setDesktopSettings(next);
      if (perm === 'denied') {
        setAnnouncement('Desktop notifications are blocked by browser permissions.');
      } else if (perm === 'unsupported') {
        setAnnouncement('Desktop notifications are not supported in this browser.');
      }
    }
  }, []);

  const toggleDesktopType = useCallback((type: WatchEventType) => {
    const current = desktopSettingsRef.current;
    const has = current.types.includes(type);
    const types = has ? current.types.filter((t) => t !== type) : [...current.types, type];
    const next: DesktopNotifySettings = { ...current, types };
    saveDesktopSettings(next);
    desktopSettingsRef.current = next;
    setDesktopSettings(next);
  }, []);

  const dismissUpdatesPaused = useCallback(() => setStaleDismissed(true), []);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items: notifications.items,
      unread: unreadCount(notifications),
      watchedIds: watchStore.items.map((i) => i.id),
      isWatched: (id: number) => watchStore.items.some((i) => i.id === id),
      toggleWatch,
      markAllRead: doMarkAllRead,
      markRead: doMarkRead,
      dismiss: doDismiss,
      clear: doClear,
      announcement,
      desktopSettings,
      desktopPermission,
      setDesktopEnabled,
      toggleDesktopType,
      updatesPaused: stale && !staleDismissed,
      dismissUpdatesPaused,
    }),
    [notifications, watchStore, toggleWatch, doMarkAllRead, doMarkRead, doDismiss, doClear, announcement],
    [notifications, watchStore, toggleWatch, doMarkAllRead, doClear, announcement, stale, staleDismissed, dismissUpdatesPaused],
    [
      notifications,
      watchStore,
      toggleWatch,
      doMarkAllRead,
      doClear,
      announcement,
      desktopSettings,
      desktopPermission,
      setDesktopEnabled,
      toggleDesktopType,
    ],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationsProvider');
  return ctx;
}

/** Like useNotifications, but returns null when rendered outside a provider. */
export function useOptionalNotifications(): NotificationsContextValue | null {
  return useContext(NotificationsContext);
}
