import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  appendNotification,
  clearNotifications,
  dismiss,
  loadNotifications,
  markAllRead,
  markRead,
  NOTIFICATIONS_KEY,
  NOTIFICATIONS_MAX,
  NOTIFICATIONS_VERSION,
  saveNotifications,
  unreadCount,
  type NotificationsStore,
} from '@/lib/notifications';

const empty = (): NotificationsStore => ({ version: NOTIFICATIONS_VERSION, items: [] });

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('notifications store', () => {
  it('appends newest first, unread by default', () => {
    let store = empty();
    store = appendNotification(store, { escrowId: 1, type: 'funded', title: 'A', message: 'a' });
    store = appendNotification(store, { escrowId: 2, type: 'disputed', title: 'B', message: 'b' });
    expect(store.items[0].escrowId).toBe(2);
    expect(store.items[1].escrowId).toBe(1);
    expect(unreadCount(store)).toBe(2);
  });

  it('caps at 100 items', () => {
    let store = empty();
    for (let i = 0; i < 150; i += 1) {
      store = appendNotification(store, { escrowId: i, type: 'funded', title: `t${i}`, message: `m${i}` });
    }
    expect(store.items).toHaveLength(NOTIFICATIONS_MAX);
    expect(store.items[0].escrowId).toBe(149);
  });

  it('marks all as read', () => {
    let store = appendNotification(empty(), { escrowId: 1, type: 'funded', title: 'A', message: 'a' });
    store = markAllRead(store);
    expect(unreadCount(store)).toBe(0);
  });

  it('clears everything and persists the empty store', () => {
    saveNotifications(appendNotification(empty(), { escrowId: 1, type: 'funded', title: 'A', message: 'a' }));
    expect(loadNotifications().items).toHaveLength(1);
    clearNotifications();
    expect(loadNotifications().items).toHaveLength(0);
  });

  it('resets corrupt storage with a warning', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(NOTIFICATIONS_KEY, 'oops');
    expect(loadNotifications()).toEqual({ version: NOTIFICATIONS_VERSION, items: [] });
  });

  it('resets an unknown version', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify({ version: 5, items: [] }));
    expect(loadNotifications()).toEqual({ version: NOTIFICATIONS_VERSION, items: [] });
  });

  it('does not throw when storage is full', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(saveNotifications(empty())).toBe(false);
  });
});

describe('markRead and dismiss', () => {
  const build = (): NotificationsStore => {
    let store = empty();
    store = appendNotification(store, { id: 'a', escrowId: 1, type: 'funded', title: 'A', message: 'a' });
    store = appendNotification(store, { id: 'b', escrowId: 2, type: 'disputed', title: 'B', message: 'b' });
    store = appendNotification(store, { id: 'c', escrowId: 3, type: 'funded', title: 'C', message: 'c', read: true });
    return store;
  };

  it('markRead marks only the matching item and lowers the unread count', () => {
    const store = build();
    const next = markRead(store, 'b');
    expect(next.items.find((i) => i.id === 'b')?.read).toBe(true);
    expect(next.items.find((i) => i.id === 'a')?.read).toBe(false);
    expect(unreadCount(next)).toBe(unreadCount(store) - 1);
    expect(next.items).toHaveLength(3);
  });

  it('markRead does not mutate the input store', () => {
    const store = build();
    markRead(store, 'a');
    expect(store.items.find((i) => i.id === 'a')?.read).toBe(false);
  });

  it('markRead returns the same store for an unknown id or an already-read item', () => {
    const store = build();
    expect(markRead(store, 'missing')).toBe(store);
    expect(markRead(store, 'c')).toBe(store);
  });

  it('dismiss removes only the matching item and keeps the order of the rest', () => {
    const store = build();
    const next = dismiss(store, 'b');
    expect(next.items.map((i) => i.id)).toEqual(['c', 'a']);
    expect(store.items).toHaveLength(3);
  });

  it('dismissing an unread item lowers the unread count, a read one does not', () => {
    const store = build();
    expect(unreadCount(dismiss(store, 'a'))).toBe(1);
    expect(unreadCount(dismiss(store, 'c'))).toBe(2);
  });

  it('dismiss returns the same store for an unknown id', () => {
    const store = build();
    expect(dismiss(store, 'missing')).toBe(store);
  });

  it('both keep the store version', () => {
    const store = build();
    expect(markRead(store, 'a').version).toBe(NOTIFICATIONS_VERSION);
    expect(dismiss(store, 'a').version).toBe(NOTIFICATIONS_VERSION);
  });
});
