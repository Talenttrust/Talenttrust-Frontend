import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import {
  addReputationLookup,
  clearReputationHistory,
  loadReputationHistory,
  REPUTATION_HISTORY_KEY,
  REPUTATION_HISTORY_LIMIT,
  saveReputationHistory,
} from '@/lib/reputationHistory';

const address = () => Keypair.random().publicKey();

describe('reputationHistory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('returns an empty list when nothing has been stored', () => {
    expect(loadReputationHistory()).toEqual([]);
  });

  it('keeps no more than five successful addresses', () => {
    const addresses = Array.from({ length: 7 }, address);
    saveReputationHistory(addresses);

    const stored = loadReputationHistory();
    expect(stored).toHaveLength(REPUTATION_HISTORY_LIMIT);
    expect(stored).toEqual(addresses.slice(0, REPUTATION_HISTORY_LIMIT));
  });

  it('adds the newest lookup first and deduplicates normalized addresses', () => {
    const [a, b, c] = [address(), address(), address()];
    let history = addReputationLookup(a, []);
    history = addReputationLookup(b, history);
    history = addReputationLookup(c.toLowerCase(), history);
    history = addReputationLookup(b, history);

    expect(history).toEqual([b, c, a]);
    expect(loadReputationHistory()).toEqual([b, c, a]);
  });

  it('drops invalid addresses and unexpected values', () => {
    localStorage.setItem(
      REPUTATION_HISTORY_KEY,
      JSON.stringify(['not-an-address', 42, null, address()]),
    );

    const stored = loadReputationHistory();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatch(/^G/);
  });

  it('returns an empty list for malformed JSON', () => {
    localStorage.setItem(REPUTATION_HISTORY_KEY, '{not json');
    expect(loadReputationHistory()).toEqual([]);
  });

  it('returns an empty list when the stored value is not an array', () => {
    localStorage.setItem(REPUTATION_HISTORY_KEY, JSON.stringify({ address: address() }));
    expect(loadReputationHistory()).toEqual([]);
  });

  it('does not throw when storage reads fail', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    expect(loadReputationHistory()).toEqual([]);
    expect(() => addReputationLookup(address())).not.toThrow();
  });

  it('does not throw when storage writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(saveReputationHistory([address()])).toBe(false);
    expect(() => addReputationLookup(address(), [])).not.toThrow();
  });

  it('clears the stored history', () => {
    saveReputationHistory([address()]);
    expect(loadReputationHistory()).not.toHaveLength(0);

    clearReputationHistory();
    expect(loadReputationHistory()).toEqual([]);
  });
});
