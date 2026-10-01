/**
 * Seed-source determinism tests for `src/app/wallet/constants.ts` (#1261).
 *
 * The mount-time recovery path depends on the starter data being stable and
 * non-mutable across renders, so these tests pin those invariants directly.
 */

import type { WalletItem } from '@/types/domain';
import {
  SAMPLE_WALLET_ITEMS,
  getSampleWalletItems,
  isValidWalletItemStatus,
  isValidWalletItem,
  assertValidWalletItems,
  InvariantError,
} from '../constants';

describe('wallet seed invariants', () => {
  it('isValidWalletItemStatus correctly validates statuses', () => {
    expect(isValidWalletItemStatus('Active')).toBe(true);
    expect(isValidWalletItemStatus('Archived')).toBe(true);
    expect(isValidWalletItemStatus('Pending')).toBe(true);
    expect(isValidWalletItemStatus('Invalid')).toBe(false);
    expect(isValidWalletItemStatus('')).toBe(false);
  });

  it('isValidWalletItem validates correctly', () => {
    const valid = {
      id: 'w-test',
      name: 'Test',
      type: 'Asset',
      balance: 100,
      currency: 'TST',
      status: 'Active',
      createdAt: '2026-01-01',
    };
    expect(isValidWalletItem(valid)).toBe(true);
    expect(isValidWalletItem({ ...valid, id: '' })).toBe(false);
    expect(isValidWalletItem({ ...valid, balance: -1 })).toBe(false);
    expect(isValidWalletItem({ ...valid, status: 'Unknown' })).toBe(false);
    expect(isValidWalletItem({ ...valid, createdAt: '2026-02-30' })).toBe(false);
    expect(isValidWalletItem({ ...valid, address: 'Invalid' })).toBe(false);
  });

  it('assertValidWalletItems throws on invalid or duplicate items', () => {
    const valid = {
      id: 'w-test',
      name: 'Test',
      type: 'Asset',
      balance: 100,
      currency: 'TST',
      status: 'Active',
      createdAt: '2026-01-01',
    };
    expect(() => assertValidWalletItems([])).toThrow(InvariantError);
    expect(() => assertValidWalletItems([valid])).not.toThrow();
    expect(() => assertValidWalletItems([valid, valid])).toThrow(InvariantError);
    expect(() => assertValidWalletItems([valid, { ...valid, id: 'w-test2', balance: -1 }])).toThrow(InvariantError);
  });
});

describe('wallet seed constants', () => {
  it('exposes a deeply frozen canonical sample list', () => {
    expect(Object.isFrozen(SAMPLE_WALLET_ITEMS)).toBe(true);
    SAMPLE_WALLET_ITEMS.forEach((item) => {
      expect(Object.isFrozen(item)).toBe(true);
    });
  });

  it('does not let consumers mutate the seed array or its items', () => {
    const beforeName = SAMPLE_WALLET_ITEMS[0].name;
    const beforeLength = SAMPLE_WALLET_ITEMS.length;

    // Pushing onto a frozen array throws.
    expect(() => {
      (SAMPLE_WALLET_ITEMS as WalletItem[]).push({} as WalletItem);
    }).toThrow();

    // Assigning to a frozen item is a no-op (sloppy) or throws (strict);
    // either way the canonical value must not change.
    try {
      (SAMPLE_WALLET_ITEMS[0] as { name: string }).name = 'Mutated';
    } catch {
      /* strict mode throws — expected */
    }

    expect(SAMPLE_WALLET_ITEMS[0].name).toBe(beforeName);
    expect(SAMPLE_WALLET_ITEMS.length).toBe(beforeLength);
  });

  it('returns a fresh, writable copy on every call (no aliasing)', () => {
    const first = getSampleWalletItems();
    const second = getSampleWalletItems();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
    expect(first[0]).not.toBe(SAMPLE_WALLET_ITEMS[0]);

    // The copies are writable and independent of the frozen constant.
    first[0].name = 'Edited Copy';
    expect(second[0].name).toBe('Stellar Lumens (XLM)');
    expect(SAMPLE_WALLET_ITEMS[0].name).toBe('Stellar Lumens (XLM)');
  });

  it('produces deterministic, unique, non-empty ids', () => {
    const seed = getSampleWalletItems();
    const ids = seed.map((item) => item.id);

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    // Stable order across calls keeps React keys deterministic.
    expect(getSampleWalletItems().map((item) => item.id)).toEqual(ids);
  });
});
