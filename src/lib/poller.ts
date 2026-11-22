import { api, ApiError, EscrowContract } from './api';
import {
  diffSnapshots,
  loadStore,
  snapshotOf,
  saveStore,
  WatchEvent,
  WatchStore,
  WatchedEscrow,
} from './watchlist';

export const POLL_INTERVAL_MS = 60000;
export const POLL_CONCURRENCY = 3;
/** Longest delay between ticks while the API keeps failing. */
export const POLL_MAX_BACKOFF_MS = 10 * 60 * 1000;
/** Consecutive failed ticks after which updates are considered stale. */
export const STALE_AFTER_FAILURES = 3;

export interface PollErrorInfo {
  /** Consecutive failed ticks, including this one. Always >= 1. */
  consecutiveFailures: number;
  /** Delay before the next tick, after backoff and jitter. */
  nextDelayMs: number;
  /** Watched escrow ids whose fetch failed this tick (404s are not failures). */
  failedIds: number[];
  /** Number of escrows polled this tick. */
  total: number;
  /** First error seen this tick. */
  error: unknown;
}

export interface PollDeps {
  fetchContract: (id: number) => Promise<EscrowContract>;
  onEvents: (id: number, events: WatchEvent[], current: EscrowContract) => void;
  onRemoved: (id: number) => void;
  /** Called by `startPoller` after each failed tick. */
  onError?: (info: PollErrorInfo) => void;
  /** Called by `startPoller` on the first full success after one or more failed ticks. */
  onRecover?: () => void;
  loadStore?: () => WatchStore;
  saveStore?: (store: WatchStore) => void;
}

export interface PollResult {
  total: number;
  /** Ids that failed with anything other than a 404. */
  failedIds: number[];
  firstError?: unknown;
}

/**
 * Delay before the next tick. Healthy polling uses `intervalMs` unchanged. After
 * `consecutiveFailures` failed ticks the delay doubles per failure up to `maxMs`,
 * then jitter shortens it by up to 20% so tabs do not retry in lockstep. Jitter
 * only shortens the delay, so the cap is never exceeded.
 */
export function computeBackoffDelay(
  intervalMs: number,
  consecutiveFailures: number,
  random: () => number = Math.random,
  maxMs: number = POLL_MAX_BACKOFF_MS,
): number {
  if (consecutiveFailures <= 0) return intervalMs;
  const doubled = intervalMs * 2 ** Math.min(consecutiveFailures, 30);
  const capped = Math.min(maxMs, doubled);
  return Math.round(capped * (0.8 + 0.2 * random()));
}

export async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: size }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

export async function pollOnce(deps: PollDeps): Promise<PollResult> {
  const read = deps.loadStore ?? loadStore;
  const write = deps.saveStore ?? saveStore;
  const store = read();
  const watched: WatchedEscrow[] = [...store.items];

  const removals: number[] = [];
  const updates: Map<number, WatchedEscrow> = new Map();
  const failedIds: number[] = [];
  let firstError: unknown;

  await runPool(watched, POLL_CONCURRENCY, async (item) => {
    try {
      const contract = await deps.fetchContract(item.id);
      const nextSnapshot = snapshotOf(contract);
      const events = diffSnapshots(item.lastSnapshot, nextSnapshot);
      if (events.length > 0) deps.onEvents(item.id, events, contract);
      if (
        events.length > 0 ||
        contract.status !== item.lastSnapshot.status ||
        contract.fundedAmount !== item.lastSnapshot.fundedAmount ||
        nextSnapshot.releasedIdx.length !== item.lastSnapshot.releasedIdx.length
      ) {
        updates.set(item.id, { id: item.id, lastSnapshot: nextSnapshot });
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        removals.push(item.id);
        deps.onRemoved(item.id);
      } else {
        // Anything but a 404 means we could not learn the escrow's state.
        if (failedIds.length === 0) firstError = e;
        failedIds.push(item.id);
      }
    }
  });

  if (removals.length > 0 || updates.size > 0) {
    const current = read();
    const items = current.items
      .filter((i) => !removals.includes(i.id))
      .map((i) => updates.get(i.id) ?? i);
    write({ version: current.version, items });
  }

  return { total: watched.length, failedIds, firstError };
}

export interface PollerOptions extends PollDeps {
  intervalMs?: number;
  /** Cap for the failure backoff. Defaults to 10 minutes. */
  maxBackoffMs?: number;
  /** Source of jitter in [0, 1). Injectable for tests. */
  random?: () => number;
  isVisible?: () => boolean;
  /** Schedules the next tick once. Defaults to `setTimeout`. */
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
  /**
   * Legacy scheduler seam. When `setTimeoutFn` is not given, these are used as a
   * one-shot timer: the poller reschedules itself after every tick, so the
   * delay can change while the API is failing.
   */
  setIntervalFn?: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
  addVisibilityListener?: (fn: () => void) => () => void;
}

export function startPoller(options: PollerOptions): () => void {
  const intervalMs = options.intervalMs ?? POLL_INTERVAL_MS;
  const maxBackoffMs = options.maxBackoffMs ?? POLL_MAX_BACKOFF_MS;
  const random = options.random ?? Math.random;
  const schedule: (fn: () => void, ms: number) => unknown =
    options.setTimeoutFn ?? options.setIntervalFn ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel: (handle: never) => void =
    (options.setTimeoutFn
      ? options.clearTimeoutFn
      : options.setIntervalFn
        ? options.clearIntervalFn
        : undefined) ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const isVisible = options.isVisible ?? (() => typeof document === 'undefined' || document.visibilityState === 'visible');

  let stopped = false;
  let running = false;
  let consecutiveFailures = 0;
  let handle: unknown;
  let hasHandle = false;

  const clearTimer = () => {
    if (hasHandle) cancel(handle as never);
    hasHandle = false;
  };
  const scheduleNext = (delayMs: number) => {
    if (stopped) return;
    clearTimer();
    handle = schedule(() => void tick(), delayMs);
    hasHandle = true;
  };
  const currentDelay = () => computeBackoffDelay(intervalMs, consecutiveFailures, random, maxBackoffMs);

  const tick = async (): Promise<void> => {
    if (stopped) return;
    clearTimer();
    // A hidden tab or an overlapping run is skipped without counting as success
    // or failure; the existing cadence continues.
    if (running || !isVisible()) {
      if (!running) scheduleNext(currentDelay());
      return;
    }
    running = true;
    let total = 0;
    let failedIds: number[] = [];
    let firstError: unknown;
    let threw = false;
    try {
      const result = await pollOnce(options);
      total = result.total;
      failedIds = result.failedIds;
      firstError = result.firstError;
    } catch (error) {
      // A thrown error (e.g. unreadable storage) still means the tick failed.
      threw = true;
      firstError = error;
    } finally {
      running = false;
    }
    if (stopped) return;

    if (!threw && failedIds.length === 0) {
      const recovered = consecutiveFailures > 0;
      consecutiveFailures = 0;
      if (recovered) options.onRecover?.();
      scheduleNext(intervalMs);
      return;
    }

    consecutiveFailures += 1;
    const nextDelayMs = currentDelay();
    options.onError?.({
      consecutiveFailures,
      nextDelayMs,
      failedIds,
      total,
      error: firstError,
    });
    scheduleNext(nextDelayMs);
  };

  scheduleNext(intervalMs);
  const removeListener = options.addVisibilityListener
    ? options.addVisibilityListener(() => {
        if (isVisible()) void tick();
      })
    : undefined;

  return () => {
    stopped = true;
    clearTimer();
    removeListener?.();
  };
}

export async function fetchContractById(id: number, signal?: AbortSignal): Promise<EscrowContract> {
  const res = await api<{ data: EscrowContract }>(`/api/v1/contracts/${id}`, { signal });
  return res.data;
}
