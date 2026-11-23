import type { WatchEventType } from './watchlist';
import { createVersionedStore } from './safeStorage';

export const NOTIFICATIONS_KEY = 'tt.notifications.v1';
export const NOTIFICATIONS_VERSION = 1;
export const NOTIFICATIONS_MAX = 100;

export interface NotificationItem {
  id: string;
  escrowId: number;
  type: WatchEventType;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
}

export interface NotificationsStore {
  version: number;
  items: NotificationItem[];
}

function emptyStore(): NotificationsStore {
  return { version: NOTIFICATIONS_VERSION, items: [] };
}

function isValidItem(value: unknown): value is NotificationItem {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.escrowId === 'number' &&
    typeof v.type === 'string' &&
    typeof v.title === 'string' &&
    typeof v.message === 'string' &&
    typeof v.createdAt === 'number' &&
    typeof v.read === 'boolean'
  );
}

function isValidStore(value: unknown): value is NotificationsStore {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.version !== NOTIFICATIONS_VERSION) return false;
  if (!Array.isArray(v.items)) return false;
  return v.items.every(isValidItem);
}

const notificationsStore = createVersionedStore<NotificationsStore>({
  key: NOTIFICATIONS_KEY,
  version: NOTIFICATIONS_VERSION,
  validate: isValidStore,
  empty: emptyStore,
  maxItems: NOTIFICATIONS_MAX,
  label: 'Notification',
});

export function loadNotifications(): NotificationsStore {
  return notificationsStore.load();
}

export function saveNotifications(store: NotificationsStore): boolean {
  return notificationsStore.save(store);
}

let seq = 0;
export function makeNotificationId(escrowId: number, type: string, now = Date.now()): string {
  seq += 1;
  return `${escrowId}:${type}:${now}:${seq}`;
}

export function appendNotification(
  store: NotificationsStore,
  item: Omit<NotificationItem, 'id' | 'createdAt' | 'read'> & Partial<Pick<NotificationItem, 'id' | 'createdAt' | 'read'>>,
): NotificationsStore {
  const full: NotificationItem = {
    id: item.id ?? makeNotificationId(item.escrowId, item.type, item.createdAt),
    escrowId: item.escrowId,
    type: item.type,
    title: item.title,
    message: item.message,
    createdAt: item.createdAt ?? Date.now(),
    read: item.read ?? false,
  };
  const items = [full, ...store.items].slice(0, NOTIFICATIONS_MAX);
  return { version: NOTIFICATIONS_VERSION, items };
}

export function unreadCount(store: NotificationsStore): number {
  return store.items.reduce((n, i) => n + (i.read ? 0 : 1), 0);
}

export function markAllRead(store: NotificationsStore): NotificationsStore {
  return { version: NOTIFICATIONS_VERSION, items: store.items.map((i) => ({ ...i, read: true })) };
}

/** Marks one notification read. Returns the same store object when nothing changes. */
export function markRead(store: NotificationsStore, id: string): NotificationsStore {
  const target = store.items.find((i) => i.id === id);
  if (!target || target.read) return store;
  return {
    version: NOTIFICATIONS_VERSION,
    items: store.items.map((i) => (i.id === id ? { ...i, read: true } : i)),
  };
}

/** Removes one notification. Returns the same store object when the id is unknown. */
export function dismiss(store: NotificationsStore, id: string): NotificationsStore {
  if (!store.items.some((i) => i.id === id)) return store;
  return { version: NOTIFICATIONS_VERSION, items: store.items.filter((i) => i.id !== id) };
}

export function clearNotifications(): NotificationsStore {
  const next = emptyStore();
  saveNotifications(next);
  return next;
}
