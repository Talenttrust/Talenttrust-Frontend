import { createElement } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EscrowContract } from '@/lib/api';
import {
  acquireLeadership,
  LEADER_HEARTBEAT_MS,
  LEADER_KEY_PREFIX,
  LEADER_LEASE_MS,
  type LockManagerLike,
  type StorageLike,
  type TabLeaderOptions,
} from '@/lib/tabLeader';
import { loadNotifications } from '@/lib/notifications';
import type { WatchStore } from '@/lib/watchlist';
import { NotificationsProvider, POLLER_LEADER_NAME } from '@/components/NotificationsProvider';

// ── Fakes ────────────────────────────────────────────────────────────────────

/** Virtual clock with a timer queue, shared by every simulated tab. */
function createClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeoutFn: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeoutFn: (id: unknown) => void timers.delete(id as number),
    advance(ms: number) {
      const target = now + ms;
      for (;;) {
        let due: [number, { at: number; fn: () => void }] | undefined;
        for (const entry of timers) if (entry[1].at <= target && (!due || entry[1].at < due[1].at)) due = entry;
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = target;
    },
  };
}

/**
 * localStorage shared between simulated tabs. Like the real `storage` event, a
 * write only notifies the *other* tabs.
 */
function createSharedStorage() {
  const data = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();
  const notifyOthers = (tab: string) => {
    for (const [owner, fns] of listeners) if (owner !== tab) fns.forEach((fn) => fn());
  };
  return {
    data,
    tab(tab: string): Pick<TabLeaderOptions, 'storage' | 'addStorageListener'> {
      const storage: StorageLike = {
        getItem: (k) => data.get(k) ?? null,
        setItem: (k, v) => {
          data.set(k, v);
          notifyOthers(tab);
        },
        removeItem: (k) => {
          data.delete(k);
          notifyOthers(tab);
        },
      };
      return {
        storage,
        addStorageListener: (_key, fn) => {
          const set = listeners.get(tab) ?? new Set();
          set.add(fn);
          listeners.set(tab, set);
          return () => set.delete(fn);
        },
      };
    },
  };
}

/** Minimal Web Locks: one exclusive holder per name, FIFO waiters, abortable. */
function createFakeLocks(): LockManagerLike {
  const held = new Set<string>();
  const queues = new Map<string, Array<() => void>>();
  const pump = (name: string) => {
    if (held.has(name)) return;
    const next = queues.get(name)?.shift();
    next?.();
  };
  return {
    request(name, options, callback) {
      return new Promise((resolve, reject) => {
        const grant = () => {
          held.add(name);
          Promise.resolve(callback({ name })).then(
            (v) => {
              held.delete(name);
              resolve(v);
              pump(name);
            },
            reject,
          );
        };
        const queue = queues.get(name) ?? [];
        queues.set(name, queue);
        options.signal?.addEventListener('abort', () => {
          const i = queue.indexOf(grant);
          if (i >= 0) {
            queue.splice(i, 1);
            reject(new DOMException('Aborted', 'AbortError'));
          }
        });
        queue.push(grant);
        pump(name);
      });
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const noPageHide = () => () => {};

// ── Web Locks ────────────────────────────────────────────────────────────────

describe('acquireLeadership with Web Locks', () => {
  it('grants one tab and hands over when it releases', async () => {
    const locks = createFakeLocks();
    const a = vi.fn();
    const b = vi.fn();
    const tabA = acquireLeadership('poll', { locks, onChange: a, addPageHideListener: noPageHide });
    const tabB = acquireLeadership('poll', { locks, onChange: b, addPageHideListener: noPageHide });
    await flush();

    expect(tabA.mode).toBe('locks');
    expect(tabA.isLeader).toBe(true);
    expect(tabB.isLeader).toBe(false);
    expect(b).not.toHaveBeenCalled();

    tabA.release();
    await flush();
    expect(a.mock.calls).toEqual([[true], [false]]);
    expect(tabB.isLeader).toBe(true);
    expect(b.mock.calls).toEqual([[true]]);
    tabB.release();
  });

  it('stops waiting when released before the lock is granted', async () => {
    const locks = createFakeLocks();
    const tabA = acquireLeadership('poll', { locks, onChange: () => {}, addPageHideListener: noPageHide });
    const b = vi.fn();
    const tabB = acquireLeadership('poll', { locks, onChange: b, addPageHideListener: noPageHide });
    tabB.release();
    tabA.release();
    await flush();
    expect(b).not.toHaveBeenCalled();
    expect(tabB.isLeader).toBe(false);
  });

  it('releases on pagehide', async () => {
    const locks = createFakeLocks();
    let pagehide = () => {};
    const tab = acquireLeadership('poll', {
      locks,
      onChange: () => {},
      addPageHideListener: (fn) => {
        pagehide = fn;
        return () => {};
      },
    });
    await flush();
    expect(tab.isLeader).toBe(true);
    pagehide();
    expect(tab.isLeader).toBe(false);
    expect(tab.released).toBe(true);
  });
});

// ── localStorage lease fallback ─────────────────────────────────────────────

describe('acquireLeadership with the localStorage lease fallback', () => {
  let clock: ReturnType<typeof createClock>;
  let shared: ReturnType<typeof createSharedStorage>;
  const tab = (id: string, onChange = vi.fn(), extra: Partial<TabLeaderOptions> = {}) => {
    const handle = acquireLeadership('poll', {
      onChange,
      locks: null,
      ...shared.tab(id),
      tabId: id,
      now: clock.now,
      random: () => 0.5,
      setTimeoutFn: clock.setTimeoutFn,
      clearTimeoutFn: clock.clearTimeoutFn,
      addPageHideListener: noPageHide,
      ...extra,
    });
    return { handle, onChange };
  };
  const leaseOwner = () => JSON.parse(shared.data.get(`${LEADER_KEY_PREFIX}poll`) ?? 'null')?.id;

  beforeEach(() => {
    clock = createClock();
    shared = createSharedStorage();
  });

  it('is used when navigator.locks is missing', () => {
    expect('locks' in navigator).toBe(false);
    const handle = acquireLeadership('jsdom', { onChange: () => {}, addPageHideListener: noPageHide });
    expect(handle.mode).toBe('lease');
    expect(handle.isLeader).toBe(true);
    expect(localStorage.getItem(`${LEADER_KEY_PREFIX}jsdom`)).toContain('"expires"');
    handle.release();
    expect(localStorage.getItem(`${LEADER_KEY_PREFIX}jsdom`)).toBeNull();
  });

  it('elects exactly one leader and keeps it while it heartbeats', () => {
    const onA = vi.fn();
    const onB = vi.fn();
    const a = tab('A', onA);
    const b = tab('B', onB);
    expect(a.handle.isLeader).toBe(true);
    expect(b.handle.isLeader).toBe(false);

    clock.advance(LEADER_LEASE_MS * 10);
    expect(a.handle.isLeader).toBe(true);
    expect(b.handle.isLeader).toBe(false);
    expect(onA.mock.calls).toEqual([[true]]);
    expect(onB).not.toHaveBeenCalled();
    expect(leaseOwner()).toBe('A');
  });

  it('hands over promptly when the leader releases', () => {
    const onB = vi.fn();
    const a = tab('A');
    const b = tab('B', onB);
    a.handle.release();
    expect(leaseOwner()).toBeUndefined();
    clock.advance(250);
    expect(b.handle.isLeader).toBe(true);
    expect(onB.mock.calls).toEqual([[true]]);
    expect(leaseOwner()).toBe('B');
  });

  it('takes over when the leader stops heartbeating and its lease expires', () => {
    // Tab A "crashes": its timers live on a clock that never advances.
    const frozen = createClock();
    const a = tab('A', vi.fn(), { setTimeoutFn: frozen.setTimeoutFn, clearTimeoutFn: frozen.clearTimeoutFn });
    const onB = vi.fn();
    const b = tab('B', onB);
    expect(a.handle.isLeader).toBe(true);

    clock.advance(LEADER_LEASE_MS - 1);
    expect(b.handle.isLeader).toBe(false);

    clock.advance(LEADER_HEARTBEAT_MS * 2);
    expect(b.handle.isLeader).toBe(true);
    expect(leaseOwner()).toBe('B');
  });

  it('steps down when another tab holds a live lease', () => {
    const onA = vi.fn();
    const a = tab('A', onA);
    shared.data.set(`${LEADER_KEY_PREFIX}poll`, JSON.stringify({ id: 'B', expires: clock.now() + LEADER_LEASE_MS }));
    clock.advance(LEADER_HEARTBEAT_MS);
    expect(a.handle.isLeader).toBe(false);
    expect(onA.mock.calls).toEqual([[true], [false]]);
  });

  it('leads alone when there is neither a lock manager nor storage', () => {
    const onChange = vi.fn();
    const handle = acquireLeadership('poll', { locks: null, storage: null, onChange, addPageHideListener: noPageHide });
    expect(handle.mode).toBe('solo');
    expect(handle.isLeader).toBe(true);
    handle.release();
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });
});

// ── Two simulated NotificationsProviders ────────────────────────────────────

describe('NotificationsProvider across tabs', () => {
  const before: EscrowContract = {
    id: 7,
    title: 'Site',
    client: 'GC',
    freelancer: 'GF',
    token: 'XLM',
    milestones: [{ index: 0, title: 'A', amount: 100, released: false }],
    totalAmount: 100,
    fundedAmount: 0,
    releasedAmount: 0,
    status: 'Created',
    reputationIssued: false,
  };
  const after: EscrowContract = { ...before, fundedAmount: 100, status: 'Funded' };
  // Each tab reads the pre-change snapshot, so both would report the change.
  const watchStore = (): WatchStore => ({
    version: 1,
    items: [{ id: 7, lastSnapshot: { status: 'Created', releasedIdx: [], fundedAmount: 0 } }],
  });

  const renderTab = (tabLeader: TabLeaderOptions) => {
    const fetchContract = vi.fn(async () => after);
    let tick: (() => void) | null = null;
    const view = render(
      createElement(
        NotificationsProvider,
        {
          children: null,
          tabLeader,
          poller: {
            fetchContract,
            isVisible: () => true,
            addVisibilityListener: () => () => {},
            loadStore: watchStore,
            saveStore: () => {},
            setTimeoutFn: ((fn: () => void) => {
              tick = fn;
              return 0;
            }) as never,
            clearTimeoutFn: () => {},
          },
        },
      ),
    );
    return {
      view,
      fetchContract,
      polling: () => tick !== null,
      tick: async () => {
        await act(async () => {
          tick?.();
          await flush();
        });
      },
    };
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('polls in one tab only and stores one notification', async () => {
    const locks = createFakeLocks();
    const a = renderTab({ locks, addPageHideListener: noPageHide });
    const b = renderTab({ locks, addPageHideListener: noPageHide });
    await act(flush);

    expect(a.polling()).toBe(true);
    expect(b.polling()).toBe(false);
    await a.tick();
    await b.tick();

    expect(a.fetchContract).toHaveBeenCalledTimes(1);
    expect(b.fetchContract).not.toHaveBeenCalled();
    expect(loadNotifications().items).toHaveLength(1);
  });

  it('hands polling to the other tab when the leader closes', async () => {
    const locks = createFakeLocks();
    const a = renderTab({ locks, addPageHideListener: noPageHide });
    const b = renderTab({ locks, addPageHideListener: noPageHide });
    await act(flush);
    expect(b.polling()).toBe(false);

    a.view.unmount();
    await act(flush);
    expect(b.polling()).toBe(true);
    await b.tick();
    expect(b.fetchContract).toHaveBeenCalledTimes(1);
  });

  it('still stores one notification if two tabs both poll the same change', async () => {
    // No coordination available: both tabs lead, dedupe is the second line of defense.
    const solo: TabLeaderOptions = { locks: null, storage: null, addPageHideListener: noPageHide };
    const a = renderTab(solo);
    const b = renderTab(solo);
    await a.tick();
    await b.tick();

    expect(a.fetchContract).toHaveBeenCalledTimes(1);
    expect(b.fetchContract).toHaveBeenCalledTimes(1);
    const items = loadNotifications().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ escrowId: 7, type: 'funded' });
  });

  it('uses a shared leader name for the poller', () => {
    expect(POLLER_LEADER_NAME).toBe('tt.poller');
  });
});
