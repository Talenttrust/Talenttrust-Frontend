import type { Snapshot, WatchEventType } from './watchlist';
import { createVersionedStore } from './safeStorage';

export const NOTIFICATIONS_KEY = 'tt.notifications.v1';
export const NOTIFICATIONS_VERSION = 1;
export const NOTIFICATIONS_MAX = 100;
/** A repeat of the same event for the same escrow state within this window is dropped. */
export const NOTIFICATION_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

export interface NotificationItem {
  id: string;
  escrowId: number;
  type: WatchEventType;
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
  /**
   * Key of the escrow state that produced this notification (see `snapshotKey`).
   * Used to drop duplicates, for example when two tabs report the same change.
   */
  snapshot?: string;
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
    typeof v.read === 'boolean' &&
    (v.snapshot === undefined || typeof v.snapshot === 'string')
  );
}

function isValidStore(value: unknown): value is NotificationsStore {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.version !== NOTIFICATIONS_VERSION) return false;
  if (!Array.isArray(v.items)) return false;
  return v.items.every(isValidItem);
}

const notificationsStore = createVersionedStore<NotificationsStore, NotificationItem>({
  key: NOTIFICATIONS_KEY,
  version: NOTIFICATIONS_VERSION,
  validate: isValidStore,
  empty: emptyStore,
  maxItems: NOTIFICATIONS_MAX,
  items: (store) => store.items,
  withItems: (store, items) => ({ ...store, items }),
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

/** Stable key for an escrow snapshot, used to de-duplicate notifications. */
export function snapshotKey(snapshot: Snapshot): string {
  return `${snapshot.status}|${snapshot.fundedAmount}|${snapshot.releasedIdx.join(',')}`;
}

/** True when `store` already has this event for the same escrow state within the dedupe window. */
export function isDuplicateNotification(
  store: NotificationsStore,
  item: Pick<NotificationItem, 'escrowId' | 'type' | 'message'> & { snapshot?: string; createdAt?: number },
  windowMs: number = NOTIFICATION_DEDUPE_WINDOW_MS,
): boolean {
  if (item.snapshot === undefined) return false;
  const at = item.createdAt ?? Date.now();
  return store.items.some(
    (i) =>
      i.snapshot === item.snapshot &&
      i.escrowId === item.escrowId &&
      i.type === item.type &&
      // Several milestones released in one change share a snapshot but not a message.
      i.message === item.message &&
      Math.abs(at - i.createdAt) <= windowMs,
  );
}

/**
 * Prepends a notification. Idempotent for items that carry a `snapshot`: the
 * same escrow, type, snapshot and message within `NOTIFICATION_DEDUPE_WINDOW_MS`
 * returns the same store object unchanged.
 */
export function appendNotification(
  store: NotificationsStore,
  item: Omit<NotificationItem, 'id' | 'createdAt' | 'read' | 'snapshot'> &
    Partial<Pick<NotificationItem, 'id' | 'createdAt' | 'read' | 'snapshot'>>,
): NotificationsStore {
  const createdAt = item.createdAt ?? Date.now();
  if (isDuplicateNotification(store, { ...item, createdAt })) return store;
  const full: NotificationItem = {
    id: item.id ?? makeNotificationId(item.escrowId, item.type, createdAt),
    escrowId: item.escrowId,
    type: item.type,
    title: item.title,
    message: item.message,
    createdAt,
    read: item.read ?? false,
    ...(item.snapshot === undefined ? {} : { snapshot: item.snapshot }),
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
