import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createVersionedStore, safeGet, safeSet, safeRemove } from '../safeStorage';

interface TestStore {
  version: number;
  items: number[];
}

const KEY = 'tt.test.v1';

const make = () =>
  createVersionedStore<TestStore, number>({
    key: KEY,
    version: 1,
    validate: (v): v is TestStore => {
      if (!v || typeof v !== 'object') return false;
      const o = v as Record<string, unknown>;
      return o.version === 1 && Array.isArray(o.items) && o.items.every((i) => typeof i === 'number');
    },
    empty: () => ({ version: 1, items: [] }),
    maxItems: 2,
    items: (s) => s.items,
    withItems: (s, items) => ({ ...s, items }),
    label: 'Test',
  });

describe('safeStorage', () => {
  let store: Record<string, string>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns empty when missing', () => {
    expect(make().load()).toEqual({ version: 1, items: [] });
    expect(warn).not.toHaveBeenCalled();
  });

  it('round-trips and caps items on load', () => {
    const s = make();
    s.save({ version: 1, items: [1, 2, 3] });
    expect(s.load().items).toEqual([1, 2]);
  });

  it('resets corrupt JSON with a warning', () => {
    store[KEY] = '{not json';
    expect(make().load()).toEqual({ version: 1, items: [] });
    expect(warn).toHaveBeenCalled();
    expect(JSON.parse(store[KEY])).toEqual({ version: 1, items: [] });
  });

  it('resets invalid shape with a warning', () => {
    store[KEY] = JSON.stringify({ version: 1, items: ['x'] });
    expect(make().load()).toEqual({ version: 1, items: [] });
    expect(warn).toHaveBeenCalled();
  });

  it('resets version mismatch', () => {
    store[KEY] = JSON.stringify({ version: 9, items: [1] });
    expect(make().load()).toEqual({ version: 1, items: [] });
    expect(warn).toHaveBeenCalled();
  });

  it('handles quota errors on save without throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    });
    expect(make().save({ version: 1, items: [1] })).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('clear empties the store', () => {
    const s = make();
    s.save({ version: 1, items: [1] });
    expect(s.clear()).toEqual({ version: 1, items: [] });
    expect(JSON.parse(store[KEY])).toEqual({ version: 1, items: [] });
  });

  it('safeGet/safeSet/safeRemove handle plain strings and quota errors', () => {
    expect(safeSet('a', 'b')).toBe(true);
    expect(safeGet('a')).toBe('b');
    expect(safeRemove('a')).toBe(true);
    expect(safeGet('a')).toBeNull();

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    });
    expect(safeGet('a')).toBeNull();
    expect(safeSet('a', 'b')).toBe(false);
    expect(safeRemove('a')).toBe(false);
  });
});
