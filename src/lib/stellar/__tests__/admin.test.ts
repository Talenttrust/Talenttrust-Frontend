/// <reference types="vitest" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { xdr } from '@stellar/stellar-sdk';

/**
 * We use vi.resetModules() + dynamic import in each test so that the
 * module-level `adminRequest` variable starts as `undefined` for every case.
 *
 * The mocks are registered before each dynamic import so Vitest's module
 * registry picks them up fresh.
 */

const ADMIN_ADDRESS = 'GADMINAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// A minimal ScVal stand-in – the real type is only needed at the type level.
const fakeScVal = {} as xdr.ScVal;

describe('readAdmin', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function loadWithMocks({
    simulateReadImpl,
    fromScValImpl,
  }: {
    simulateReadImpl: () => Promise<xdr.ScVal>;
    fromScValImpl: () => { toString: () => string };
  }) {
    // Mock ./rpc before importing admin so the fresh module sees our stub.
    vi.doMock('../rpc', () => ({
      simulateRead: vi.fn(simulateReadImpl),
    }));

    // Mock Address from @stellar/stellar-sdk.
    vi.doMock('@stellar/stellar-sdk', () => ({
      Address: {
        fromScVal: vi.fn(fromScValImpl),
      },
    }));

    const { readAdmin } = await import('../admin');
    const { simulateRead } = await import('../rpc');
    const { Address } = await import('@stellar/stellar-sdk');

    return {
      readAdmin,
      simulateRead: vi.mocked(simulateRead),
      Address: Address as unknown as { fromScVal: ReturnType<typeof vi.fn> },
    };
  }

  it('concurrent calls share exactly one simulateRead invocation', async () => {
    let resolveRpc!: (v: xdr.ScVal) => void;
    const rpcPromise = new Promise<xdr.ScVal>((res) => { resolveRpc = res; });

    const { readAdmin, simulateRead } = await loadWithMocks({
      simulateReadImpl: () => rpcPromise,
      fromScValImpl: () => ({ toString: () => ADMIN_ADDRESS }),
    });

    // Fire three concurrent calls before the RPC settles.
    const [a, b, c] = [readAdmin(), readAdmin(), readAdmin()];

    // Only one RPC call should have been made at this point.
    expect(simulateRead).toHaveBeenCalledTimes(1);

    resolveRpc(fakeScVal);

    // All three promises should resolve to the same value.
    await expect(Promise.all([a, b, c])).resolves.toEqual([
      ADMIN_ADDRESS,
      ADMIN_ADDRESS,
      ADMIN_ADDRESS,
    ]);

    // Still just one RPC call total.
    expect(simulateRead).toHaveBeenCalledTimes(1);
  });

  it('caches a successful result – subsequent calls do not hit the RPC again', async () => {
    const { readAdmin, simulateRead } = await loadWithMocks({
      simulateReadImpl: () => Promise.resolve(fakeScVal),
      fromScValImpl: () => ({ toString: () => ADMIN_ADDRESS }),
    });

    const first = await readAdmin();
    const second = await readAdmin();
    const third = await readAdmin();

    expect(first).toBe(ADMIN_ADDRESS);
    expect(second).toBe(ADMIN_ADDRESS);
    expect(third).toBe(ADMIN_ADDRESS);

    // The cache was populated on the first call; no further RPC round-trips.
    expect(simulateRead).toHaveBeenCalledTimes(1);
  });

  it('clears the cache on failure so the next call performs a fresh RPC request', async () => {
    let callCount = 0;

    const { readAdmin, simulateRead } = await loadWithMocks({
      simulateReadImpl: () => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.reject(new Error('transient RPC error'));
        }
        return Promise.resolve(fakeScVal);
      },
      fromScValImpl: () => ({ toString: () => ADMIN_ADDRESS }),
    });

    // First call should fail.
    await expect(readAdmin()).rejects.toThrow('transient RPC error');

    // The cache must have been cleared; second call should succeed and issue a new RPC call.
    const result = await readAdmin();
    expect(result).toBe(ADMIN_ADDRESS);

    // Two separate RPC calls: one failed, one succeeded.
    expect(simulateRead).toHaveBeenCalledTimes(2);
  });

  it('a concurrent failure clears the cache for all waiters and allows a retry', async () => {
    let resolveRpc!: (v: xdr.ScVal) => void;
    let rejectRpc!: (e: unknown) => void;
    const rpcPromise = new Promise<xdr.ScVal>((res, rej) => {
      resolveRpc = res;
      rejectRpc = rej;
    });

    const { readAdmin, simulateRead } = await loadWithMocks({
      simulateReadImpl: () => rpcPromise,
      fromScValImpl: () => ({ toString: () => ADMIN_ADDRESS }),
    });

    // Two concurrent callers.
    const p1 = readAdmin();
    const p2 = readAdmin();

    expect(simulateRead).toHaveBeenCalledTimes(1);

    // The shared RPC call fails.
    rejectRpc(new Error('network down'));

    await expect(p1).rejects.toThrow('network down');
    await expect(p2).rejects.toThrow('network down');

    // Cache is now cleared; a fresh call must trigger a new RPC request.
    resolveRpc(fakeScVal); // won't be used by the stale promise, but lets us set up a clean stub
    // Reload so simulateRead now resolves immediately.
    vi.resetModules();
    vi.doMock('../rpc', () => ({
      simulateRead: vi.fn(() => Promise.resolve(fakeScVal)),
    }));
    vi.doMock('@stellar/stellar-sdk', () => ({
      Address: { fromScVal: vi.fn(() => ({ toString: () => ADMIN_ADDRESS })) },
    }));
    const { readAdmin: readAdmin2, simulateRead: simulateRead2 } = {
      readAdmin: (await import('../admin')).readAdmin,
      simulateRead: vi.mocked((await import('../rpc')).simulateRead),
    };

    await expect(readAdmin2()).resolves.toBe(ADMIN_ADDRESS);
    expect(simulateRead2).toHaveBeenCalledTimes(1);
  });
});
