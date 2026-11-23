/**
 * Elects one leader among the open tabs of this origin, so work such as
 * background polling runs in exactly one of them.
 *
 * - With the Web Locks API (`navigator.locks`) the leader holds an exclusive
 *   lock. The browser releases it when the tab closes, crashes or calls
 *   `release()`, and the next waiting tab is granted it immediately.
 * - Without it, the leader keeps a heartbeat lease in localStorage
 *   (`{ id, expires }`). Followers re-check on a jittered timer and take over
 *   once the lease expires, or right away when the leader removes it. A leader
 *   that finds someone else's live lease steps down, which settles the rare
 *   race where two tabs claim the same expired lease.
 *
 * Leadership is released on `pagehide` and when `release()` is called.
 */

export const LEADER_KEY_PREFIX = 'tt.leader.';
/** How long a fallback lease stays valid without a heartbeat. */
export const LEADER_LEASE_MS = 15_000;
/** How often the fallback leader renews its lease and followers re-check it. */
export const LEADER_HEARTBEAT_MS = 5_000;

type Timer = unknown;

export interface LockManagerLike {
  request(
    name: string,
    options: { signal?: AbortSignal },
    callback: (lock: unknown) => Promise<void>,
  ): Promise<unknown>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface TabLeaderOptions {
  /** Lock manager; defaults to `navigator.locks`. Pass `null` to force the lease fallback. */
  locks?: LockManagerLike | null;
  /** Storage for the fallback lease; defaults to `localStorage`. */
  storage?: StorageLike | null;
  /** Unique id for this tab. */
  tabId?: string;
  now?: () => number;
  /** Source of jitter in [0, 1). */
  random?: () => number;
  leaseMs?: number;
  heartbeatMs?: number;
  setTimeoutFn?: (fn: () => void, ms: number) => Timer;
  clearTimeoutFn?: (handle: Timer) => void;
  /** Subscribes to page teardown; defaults to `window` `pagehide`. */
  addPageHideListener?: (fn: () => void) => () => void;
  /** Subscribes to lease changes made by other tabs; defaults to the `storage` event. */
  addStorageListener?: (key: string, fn: () => void) => () => void;
}

export interface AcquireOptions extends TabLeaderOptions {
  /** Called whenever this tab gains (`true`) or loses (`false`) leadership. */
  onChange: (isLeader: boolean) => void;
}

export interface Leadership {
  readonly isLeader: boolean;
  /** True once `release()` ran (directly or on `pagehide`). */
  readonly released: boolean;
  readonly mode: 'locks' | 'lease' | 'solo';
  /** Gives up leadership (or stops waiting for it) so another tab can take over. */
  release(): void;
}

interface Lease {
  id: string;
  expires: number;
}

const defaultTabId = (): string => {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const defaultLocks = (): LockManagerLike | null => {
  if (typeof navigator === 'undefined') return null;
  const locks = (navigator as Navigator & { locks?: LockManagerLike }).locks;
  return locks && typeof locks.request === 'function' ? locks : null;
};

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

const defaultPageHide = (fn: () => void) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('pagehide', fn);
  return () => window.removeEventListener('pagehide', fn);
};

const defaultStorageListener = (key: string, fn: () => void) => {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === key || e.key === null) fn();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
};

export function acquireLeadership(name: string, options: AcquireOptions): Leadership {
  const locks = options.locks === undefined ? defaultLocks() : options.locks;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const removePageHide = (options.addPageHideListener ?? defaultPageHide)(() => handle.release());

  let isLeader = false;
  let released = false;
  const setLeader = (next: boolean) => {
    if (next === isLeader || (next && released)) return;
    isLeader = next;
    options.onChange(next);
  };

  let stop: () => void = () => {};
  let mode: Leadership['mode'];

  if (locks) {
    mode = 'locks';
    stop = acquireWithLocks(locks, name, setLeader, () => released);
  } else if (storage) {
    mode = 'lease';
    stop = acquireWithLease(storage, name, options, setLeader, () => isLeader, () => released);
  } else {
    // Nothing to coordinate through: assume this is the only tab.
    mode = 'solo';
  }

  const handle: Leadership = {
    get isLeader() {
      return isLeader;
    },
    get released() {
      return released;
    },
    mode,
    release() {
      if (released) return;
      released = true;
      removePageHide();
      stop();
      if (isLeader) {
        isLeader = false;
        options.onChange(false);
      }
    },
  };

  if (mode === 'solo') setLeader(true);
  return handle;
}

function acquireWithLocks(
  locks: LockManagerLike,
  name: string,
  setLeader: (v: boolean) => void,
  isReleased: () => boolean,
): () => void {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let unlock: (() => void) | null = null;

  locks
    .request(`${LEADER_KEY_PREFIX}${name}`, controller ? { signal: controller.signal } : {}, () => {
      if (isReleased()) return Promise.resolve();
      return new Promise<void>((resolve) => {
        unlock = resolve;
        setLeader(true);
      });
    })
    // Rejects with AbortError when released while still waiting.
    .catch(() => {});

  return () => {
    controller?.abort();
    unlock?.();
  };
}

function acquireWithLease(
  storage: StorageLike,
  name: string,
  options: TabLeaderOptions,
  setLeader: (v: boolean) => void,
  isLeader: () => boolean,
  isReleased: () => boolean,
): () => void {
  const key = `${LEADER_KEY_PREFIX}${name}`;
  const id = options.tabId ?? defaultTabId();
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const leaseMs = options.leaseMs ?? LEADER_LEASE_MS;
  const heartbeatMs = options.heartbeatMs ?? LEADER_HEARTBEAT_MS;
  const schedule = options.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = options.clearTimeoutFn ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let timer: Timer;
  let hasTimer = false;

  const read = (): Lease | null => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return null;
      const lease = JSON.parse(raw) as Partial<Lease>;
      return typeof lease?.id === 'string' && typeof lease.expires === 'number' ? (lease as Lease) : null;
    } catch {
      return null;
    }
  };

  const clearTimer = () => {
    if (hasTimer) cancel(timer);
    hasTimer = false;
  };

  const scheduleCheck = (delay: number) => {
    clearTimer();
    timer = schedule(check, delay);
    hasTimer = true;
  };

  const check = () => {
    hasTimer = false;
    if (isReleased()) return;
    const t = now();
    const lease = read();
    if (!lease || lease.id === id || lease.expires <= t) {
      try {
        storage.setItem(key, JSON.stringify({ id, expires: t + leaseMs }));
        // Confirm: another tab may have written the same expired lease just now.
        setLeader(read()?.id === id);
      } catch {
        // Storage refused the write; nothing to coordinate through, so lead.
        setLeader(true);
      }
    } else {
      setLeader(false);
    }
    // Leaders renew early (jitter only shortens); followers check a little late
    // so that tabs do not retry in lockstep.
    const delay = isLeader() ? heartbeatMs * (0.8 + 0.2 * random()) : heartbeatMs * (1 + 0.5 * random());
    scheduleCheck(Math.round(delay));
  };

  const removeStorageListener = (options.addStorageListener ?? defaultStorageListener)(key, () => {
    if (isReleased()) return;
    const lease = read();
    if (isLeader() && lease && lease.id !== id && lease.expires > now()) {
      setLeader(false);
    } else if (!isLeader() && (!lease || lease.expires <= now())) {
      // The leader handed over; claim after a short jittered pause.
      scheduleCheck(Math.round(random() * 250));
    }
  });

  check();

  return () => {
    clearTimer();
    removeStorageListener();
    try {
      if (read()?.id === id) storage.removeItem(key);
    } catch {
      // Ignore: the lease will simply expire.
    }
  };
}
