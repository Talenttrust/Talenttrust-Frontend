import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  computeBackoffDelay,
  pollOnce,
  POLL_CONCURRENCY,
  POLL_MAX_BACKOFF_MS,
  runPool,
  startPoller,
  type PollErrorInfo,
} from '@/lib/poller';
import type { EscrowContract } from '@/lib/api';
import type { WatchStore } from '@/lib/watchlist';
import type { WatchEvent } from '@/lib/watchlist';

const contract = (over: Partial<EscrowContract> = {}): EscrowContract => ({
  id: 1,
  title: 'Design',
  client: 'GCLIENT',
  freelancer: 'GFREE',
  token: 'XLM',
  milestones: [],
  totalAmount: 300,
  fundedAmount: 300,
  releasedAmount: 0,
  status: 'Funded',
  reputationIssued: false,
  ...over,
});

const storeWith = (ids: number[]): WatchStore => ({
  version: 1,
  items: ids.map((id) => ({ id, lastSnapshot: { status: 'Created', releasedIdx: [], fundedAmount: 0 } })),
});

describe('runPool', () => {
  it('never runs more than the limit concurrently', async () => {
    let inFlight = 0;
    let max = 0;
    await runPool([1, 2, 3, 4, 5, 6, 7], 3, async () => {
      inFlight += 1;
      max = Math.max(max, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
    });
    expect(max).toBeLessThanOrEqual(3);
    expect(max).toBe(3);
  });

  it('handles a limit larger than the item count', async () => {
    const seen: number[] = [];
    await runPool([1, 2], 10, async (n) => {
      seen.push(n);
    });
    expect(seen.sort()).toEqual([1, 2]);
  });
});

describe('pollOnce', () => {
  it('emits events and updates the snapshot', async () => {
    const onEvents = vi.fn();
    const save = vi.fn();
    await pollOnce({
      fetchContract: async () =>
        contract({ status: 'Funded', fundedAmount: 300, milestones: [{ index: 0, title: 'A', amount: 300, released: true }] }),
      onEvents,
      onRemoved: vi.fn(),
      loadStore: () => storeWith([1]),
      saveStore: save,
    });
    expect(onEvents).toHaveBeenCalledTimes(1);
    const [id, events] = onEvents.mock.calls[0] as [number, WatchEvent[]];
    expect(id).toBe(1);
    expect(events.map((e) => e.type).sort()).toEqual(['funded', 'milestone_released']);
    expect(save).toHaveBeenCalled();
  });

  it('marks a 404 watched id as removed rather than erroring', async () => {
    const onRemoved = vi.fn();
    const save = vi.fn();
    await pollOnce({
      fetchContract: async () => {
        throw new ApiError({ kind: 'http', status: 404, code: 'contract_not_found' });
      },
      onEvents: vi.fn(),
      onRemoved,
      loadStore: () => storeWith([9]),
      saveStore: save,
    });
    expect(onRemoved).toHaveBeenCalledWith(9);
    const written = save.mock.calls[0][0] as WatchStore;
    expect(written.items).toHaveLength(0);
  });

  it('ignores non-404 errors', async () => {
    const onRemoved = vi.fn();
    await pollOnce({
      fetchContract: async () => {
        throw new ApiError({ kind: 'network' });
      },
      onEvents: vi.fn(),
      onRemoved,
      loadStore: () => storeWith([9]),
      saveStore: vi.fn(),
    });
    expect(onRemoved).not.toHaveBeenCalled();
  });

  it('does nothing with an empty watchlist', async () => {
    const fetchContract = vi.fn();
    await pollOnce({ fetchContract, onEvents: vi.fn(), onRemoved: vi.fn(), loadStore: () => storeWith([]), saveStore: vi.fn() });
    expect(fetchContract).not.toHaveBeenCalled();
  });

  it('bounds concurrency across many watched ids', async () => {
    let inFlight = 0;
    let max = 0;
    await pollOnce({
      fetchContract: async () => {
        inFlight += 1;
        max = Math.max(max, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return contract();
      },
      onEvents: vi.fn(),
      onRemoved: vi.fn(),
      loadStore: () => storeWith([1, 2, 3, 4, 5, 6]),
      saveStore: vi.fn(),
    });
    expect(max).toBeLessThanOrEqual(POLL_CONCURRENCY);
  });
});

describe('startPoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('polls on the interval while visible', async () => {
    const fetchContract = vi.fn().mockResolvedValue(contract());
    const stop = startPoller({
      fetchContract,
      onEvents: vi.fn(),
      onRemoved: vi.fn(),
      loadStore: () => storeWith([1]),
      saveStore: vi.fn(),
      intervalMs: 1000,
      isVisible: () => true,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContract).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContract).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchContract).toHaveBeenCalledTimes(2);
  });

  it('pauses when the tab is hidden', async () => {
    const fetchContract = vi.fn().mockResolvedValue(contract());
    let visible = false;
    startPoller({
      fetchContract,
      onEvents: vi.fn(),
      onRemoved: vi.fn(),
      loadStore: () => storeWith([1]),
      saveStore: vi.fn(),
      intervalMs: 1000,
      isVisible: () => visible,
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchContract).not.toHaveBeenCalled();
    visible = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContract).toHaveBeenCalledTimes(1);
  });

  it('does not overlap runs when a poll is still in flight', async () => {
    let resolveFetch: (c: EscrowContract) => void = () => {};
    const fetchContract = vi.fn(
      () =>
        new Promise<EscrowContract>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    startPoller({
      fetchContract,
      onEvents: vi.fn(),
      onRemoved: vi.fn(),
      loadStore: () => storeWith([1]),
      saveStore: vi.fn(),
      intervalMs: 1000,
      isVisible: () => true,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContract).toHaveBeenCalledTimes(1);
    resolveFetch(contract());
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContract).toHaveBeenCalledTimes(2);
  });
});

describe('computeBackoffDelay', () => {
  it('uses the plain interval while healthy', () => {
    expect(computeBackoffDelay(1000, 0, () => 0)).toBe(1000);
  });

  it('doubles per consecutive failure without jitter', () => {
    const delays = [1, 2, 3, 4].map((n) => computeBackoffDelay(1000, n, () => 1));
    expect(delays).toEqual([2000, 4000, 8000, 16000]);
  });

  it('caps at ten minutes', () => {
    expect(POLL_MAX_BACKOFF_MS).toBe(600000);
    expect(computeBackoffDelay(60000, 10, () => 1)).toBe(600000);
    expect(computeBackoffDelay(60000, 500, () => 1)).toBe(600000);
  });

  it('jitter only shortens the delay, by at most 20%', () => {
    expect(computeBackoffDelay(1000, 2, () => 0)).toBe(3200);
    expect(computeBackoffDelay(1000, 2, () => 0.5)).toBe(3600);
    expect(computeBackoffDelay(60000, 10, () => 0)).toBe(480000);
    for (let i = 0; i < 50; i += 1) {
      const d = computeBackoffDelay(60000, 12, Math.random);
      expect(d).toBeGreaterThanOrEqual(480000);
      expect(d).toBeLessThanOrEqual(600000);
    }
  });
});

describe('pollOnce result', () => {
  it('reports non-404 failures but not 404s', async () => {
    const result = await pollOnce({
      fetchContract: async (id) => {
        if (id === 1) throw new ApiError({ kind: 'network' });
        if (id === 2) throw new ApiError({ kind: 'http', status: 404 });
        return contract({ id });
      },
      onEvents: vi.fn(),
      onRemoved: vi.fn(),
      loadStore: () => storeWith([1, 2, 3]),
      saveStore: vi.fn(),
    });
    expect(result.total).toBe(3);
    expect(result.failedIds).toEqual([1]);
    expect(result.firstError).toBeInstanceOf(ApiError);
  });

  it('reports no failures on success', async () => {
    const result = await pollOnce({
      fetchContract: async () => contract(),
      onEvents: vi.fn(),
      onRemoved: vi.fn(),
      loadStore: () => storeWith([1]),
      saveStore: vi.fn(),
    });
    expect(result.failedIds).toEqual([]);
  });
});

describe('startPoller backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  const run = (fetchContract: (id: number) => Promise<EscrowContract>, extra: Partial<Parameters<typeof startPoller>[0]> = {}) => {
    const onError = vi.fn<(info: PollErrorInfo) => void>();
    const onRecover = vi.fn();
    const onRemoved = vi.fn();
    const stop = startPoller({
      fetchContract,
      onEvents: vi.fn(),
      onRemoved,
      onError,
      onRecover,
      loadStore: () => storeWith([1]),
      saveStore: vi.fn(),
      intervalMs: 1000,
      random: () => 1,
      isVisible: () => true,
      ...extra,
    });
    return { stop, onError, onRecover, onRemoved };
  };

  it('grows the delay after each consecutive failure', async () => {
    const fetchContract = vi.fn().mockRejectedValue(new ApiError({ kind: 'network' }));
    const { stop, onError } = run(fetchContract);

    await vi.advanceTimersByTimeAsync(1000); // tick 1 fails -> next in 2000
    expect(fetchContract).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchContract).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); // tick 2 fails -> next in 4000
    expect(fetchContract).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3999);
    expect(fetchContract).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); // tick 3 fails -> next in 8000
    expect(fetchContract).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(7999);
    expect(fetchContract).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchContract).toHaveBeenCalledTimes(4);

    expect(onError.mock.calls.map(([i]) => [i.consecutiveFailures, i.nextDelayMs])).toEqual([
      [1, 2000],
      [2, 4000],
      [3, 8000],
      [4, 16000],
    ]);
    stop();
  });

  it('stops growing at the ten minute cap', async () => {
    const fetchContract = vi.fn().mockRejectedValue(new ApiError({ kind: 'network' }));
    const { stop, onError } = run(fetchContract, { intervalMs: 60000 });

    await vi.advanceTimersByTimeAsync(60000);
    for (let i = 0; i < 12; i += 1) await vi.advanceTimersByTimeAsync(POLL_MAX_BACKOFF_MS);

    const last = onError.mock.calls.at(-1)![0];
    expect(last.nextDelayMs).toBe(POLL_MAX_BACKOFF_MS);
    expect(Math.max(...onError.mock.calls.map(([i]) => i.nextDelayMs))).toBe(POLL_MAX_BACKOFF_MS);
    stop();
  });

  it('applies jitter to the scheduled delay', async () => {
    const fetchContract = vi.fn().mockRejectedValue(new ApiError({ kind: 'network' }));
    const { stop, onError } = run(fetchContract, { random: () => 0 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(onError.mock.calls[0][0].nextDelayMs).toBe(1600);
    await vi.advanceTimersByTimeAsync(1599);
    expect(fetchContract).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchContract).toHaveBeenCalledTimes(2);
    stop();
  });

  it('resets to the normal interval on the first full success', async () => {
    let failing = true;
    const fetchContract = vi.fn(async () => {
      if (failing) throw new ApiError({ kind: 'network' });
      return contract();
    });
    const { stop, onRecover, onError } = run(fetchContract);

    await vi.advanceTimersByTimeAsync(1000); // fail, next 2000
    await vi.advanceTimersByTimeAsync(2000); // fail, next 4000
    expect(onError).toHaveBeenCalledTimes(2);
    failing = false;
    await vi.advanceTimersByTimeAsync(4000); // success
    expect(fetchContract).toHaveBeenCalledTimes(3);
    expect(onRecover).toHaveBeenCalledTimes(1);

    // Back to the 1000ms cadence.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContract).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContract).toHaveBeenCalledTimes(5);
    expect(onRecover).toHaveBeenCalledTimes(1);
    stop();
  });

  it('restarts the backoff from the start after a recovery', async () => {
    let failing = true;
    const fetchContract = vi.fn(async () => {
      if (failing) throw new ApiError({ kind: 'network' });
      return contract();
    });
    const { stop, onError } = run(fetchContract);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    failing = false;
    await vi.advanceTimersByTimeAsync(4000); // recovers
    failing = true;
    await vi.advanceTimersByTimeAsync(1000); // fails again
    expect(onError.mock.calls.at(-1)![0]).toMatchObject({ consecutiveFailures: 1, nextDelayMs: 2000 });
    stop();
  });

  it('counts a partial failure as a failed tick', async () => {
    const fetchContract = vi.fn(async (id: number) => {
      if (id === 2) throw new ApiError({ kind: 'network' });
      return contract({ id });
    });
    const { stop, onError } = run(fetchContract, { loadStore: () => storeWith([1, 2, 3]) });

    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({ failedIds: [2], total: 3, consecutiveFailures: 1 });
    stop();
  });

  it('counts a thrown poll (for example unreadable storage) as a failed tick', async () => {
    const { stop, onError } = run(vi.fn(), {
      loadStore: () => {
        throw new Error('storage unavailable');
      },
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0].error as Error).message).toBe('storage unavailable');
    expect(onError.mock.calls[0][0].nextDelayMs).toBe(2000);
    stop();
  });

  it('keeps 404 handling unchanged: removal, no failure, no backoff', async () => {
    const fetchContract = vi.fn().mockRejectedValue(new ApiError({ kind: 'http', status: 404 }));
    const { stop, onError, onRecover, onRemoved } = run(fetchContract);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onRemoved).toHaveBeenCalledWith(1);
    expect(onError).not.toHaveBeenCalled();
    expect(onRecover).not.toHaveBeenCalled();
    // The cadence is still the normal interval.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContract).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchContract).toHaveBeenCalledTimes(3);
    stop();
  });

  it('does not treat an empty watchlist as a failure', async () => {
    const { stop, onError } = run(vi.fn(), { loadStore: () => storeWith([]) });
    await vi.advanceTimersByTimeAsync(3000);
    expect(onError).not.toHaveBeenCalled();
    stop();
  });

  it('does not count hidden ticks as failures or successes', async () => {
    let visible = false;
    const fetchContract = vi.fn().mockRejectedValue(new ApiError({ kind: 'network' }));
    const { stop, onError } = run(fetchContract, { isVisible: () => visible });

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchContract).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    visible = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(onError.mock.calls[0][0].consecutiveFailures).toBe(1);
    stop();
  });

  it('polls immediately when the tab becomes visible during a backoff, without double-scheduling', async () => {
    const fetchContract = vi.fn().mockRejectedValue(new ApiError({ kind: 'network' }));
    let listener: () => void = () => {};
    const { stop } = run(fetchContract, {
      addVisibilityListener: (fn) => {
        listener = fn;
        return () => {};
      },
    });
    await vi.advanceTimersByTimeAsync(1000); // fail, next in 2000
    expect(fetchContract).toHaveBeenCalledTimes(1);
    listener();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchContract).toHaveBeenCalledTimes(2); // polled now, next in 4000
    await vi.advanceTimersByTimeAsync(3999);
    expect(fetchContract).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchContract).toHaveBeenCalledTimes(3);
    stop();
  });

  it('stops scheduling after stop()', async () => {
    const fetchContract = vi.fn().mockRejectedValue(new ApiError({ kind: 'network' }));
    const { stop } = run(fetchContract);
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    await vi.advanceTimersByTimeAsync(600000);
    expect(fetchContract).toHaveBeenCalledTimes(1);
  });

  it('supports the injectable setTimeoutFn seam', async () => {
    const delays: number[] = [];
    let next: () => void = () => {};
    const fetchContract = vi.fn().mockRejectedValue(new ApiError({ kind: 'network' }));
    const { stop } = run(fetchContract, {
      setTimeoutFn: ((fn: () => void, ms: number) => {
        next = fn;
        delays.push(ms);
        return 0 as never;
      }) as never,
      clearTimeoutFn: () => {},
    });
    expect(delays).toEqual([1000]);
    next();
    await vi.advanceTimersByTimeAsync(0);
    next();
    await vi.advanceTimersByTimeAsync(0);
    next();
    await vi.advanceTimersByTimeAsync(0);
    expect(delays).toEqual([1000, 2000, 4000, 8000]);
    stop();
  });
});
