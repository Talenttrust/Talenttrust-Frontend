import { describe, expect, it, vi } from 'vitest';
import {
  routeRequest,
  STATIC_CACHE,
  RUNTIME_CACHE,
  MAX_RUNTIME_ENTRIES,
  cacheRuntimeResponse,
  trimRuntimeCache,
  OFFLINE_URL,
  type RouteDecision,
} from '../swRouting';

const ORIGIN = 'http://localhost:3000';

describe('routeRequest', () => {
  // ── Cross-origin requests: network-only ──────────────────────────────

  describe('cross-origin requests (API, RPC, Horizon)', () => {
    it('returns network-only for an API URL', () => {
      const result = routeRequest(
        'https://api.talenttrust.io/contracts',
        '',
        ORIGIN,
      );

      expect(result.strategy).toBe('network-only');
      expect(result.cacheName).toBeNull();
      expect(result.fallbackUrl).toBeNull();
    });

    it('returns network-only for a Soroban RPC endpoint', () => {
      const result = routeRequest(
        'https://soroban-testnet.stellar.org/simulate',
        '',
        ORIGIN,
      );

      expect(result.strategy).toBe('network-only');
      expect(result.cacheName).toBeNull();
      expect(result.fallbackUrl).toBeNull();
    });

    it('returns network-only for a Horizon URL', () => {
      const result = routeRequest(
        'https://horizon-testnet.stellar.org/accounts/GABC',
        '',
        ORIGIN,
      );

      expect(result.strategy).toBe('network-only');
      expect(result.cacheName).toBeNull();
      expect(result.fallbackUrl).toBeNull();
    });

    it('returns network-only for any cross-origin URL', () => {
      const result = routeRequest(
        'https://example.com/some/path',
        '',
        ORIGIN,
      );

      expect(result.strategy).toBe('network-only');
      expect(result.cacheName).toBeNull();
      expect(result.fallbackUrl).toBeNull();
    });

    it('returns network-only for cross-origin navigations', () => {
      const result = routeRequest(
        'https://example.com/page',
        'navigate',
        ORIGIN,
      );

      expect(result.strategy).toBe('network-only');
      expect(result.cacheName).toBeNull();
      expect(result.fallbackUrl).toBeNull();
    });
  });

  // ── Static assets: cache-first ──────────────────────────────────────

  describe('/_next/static/* — cache-first', () => {
    it('returns cache-first for a static JS chunk', () => {
      const result = routeRequest(
        '/_next/static/chunks/main-abc123.js',
        '',
        ORIGIN,
      );

      expect(result.strategy).toBe('cache-first');
      expect(result.cacheName).toBe(STATIC_CACHE);
      expect(result.fallbackUrl).toBeNull();
    });

    it('returns cache-first for a static CSS file', () => {
      const result = routeRequest(
        '/_next/static/css/styles-xyz.css',
        '',
        ORIGIN,
      );

      expect(result.strategy).toBe('cache-first');
      expect(result.cacheName).toBe(STATIC_CACHE);
      expect(result.fallbackUrl).toBeNull();
    });

    it('returns cache-first for a static media file', () => {
      const result = routeRequest(
        '/_next/static/media/font-123.woff2',
        '',
        ORIGIN,
      );

      expect(result.strategy).toBe('cache-first');
      expect(result.cacheName).toBe(STATIC_CACHE);
    });

    it('uses the absolute URL form for static assets', () => {
      const result = routeRequest(
        `${ORIGIN}/_next/static/chunks/app.js`,
        '',
        ORIGIN,
      );

      expect(result.strategy).toBe('cache-first');
      expect(result.cacheName).toBe(STATIC_CACHE);
    });
  });

  // ── Navigations: network-first with /offline fallback ───────────────

  describe('navigations — network-first with offline fallback', () => {
    it('returns network-first for a navigate request', () => {
      const result = routeRequest('/', 'navigate', ORIGIN);

      expect(result.strategy).toBe('network-first');
      expect(result.cacheName).toBe(RUNTIME_CACHE);
      expect(result.fallbackUrl).toBe(OFFLINE_URL);
    });

    it('returns network-first for a deep-link navigation', () => {
      const result = routeRequest('/contracts/123', 'navigate', ORIGIN);

      expect(result.strategy).toBe('network-first');
      expect(result.cacheName).toBe(RUNTIME_CACHE);
      expect(result.fallbackUrl).toBe(OFFLINE_URL);
    });

    it('returns network-first for navigation using absolute URL', () => {
      const result = routeRequest(
        `${ORIGIN}/milestones`,
        'navigate',
        ORIGIN,
      );

      expect(result.strategy).toBe('network-first');
      expect(result.cacheName).toBe(RUNTIME_CACHE);
      expect(result.fallbackUrl).toBe(OFFLINE_URL);
    });
  });

  // ── Other same-origin GET: network-first ────────────────────────────

  describe('other same-origin requests — network-first', () => {
    it('returns network-first for a non-static, non-navigation same-origin GET', () => {
      const result = routeRequest('/icon.svg', '', ORIGIN);

      expect(result.strategy).toBe('network-first');
      expect(result.cacheName).toBe(RUNTIME_CACHE);
      expect(result.fallbackUrl).toBeNull();
    });

    it('returns network-first for a manifest request', () => {
      const result = routeRequest('/manifest.webmanifest', '', ORIGIN);

      expect(result.strategy).toBe('network-first');
      expect(result.cacheName).toBe(RUNTIME_CACHE);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  describe('edge cases', () => {
    it.each(['/api', '/api/contracts', '/sw.js', 'https://[', 'data:text/plain,secret', 'https://localhost:3000/page'])(
      'keeps %s network-only', (url) => {
        expect(routeRequest(url, 'navigate', ORIGIN)).toEqual({ strategy: 'network-only', cacheName: null, fallbackUrl: null });
      },
    );
    it('handles a relative URL by resolving against the origin', () => {
      const result = routeRequest('/some/path', '', ORIGIN);

      expect(result.strategy).toBe('network-first');
      expect(result.cacheName).toBe(RUNTIME_CACHE);
    });

    it('does not cache cross-origin even with navigate mode', () => {
      const result = routeRequest(
        'https://api.example.com/data',
        'navigate',
        ORIGIN,
      );

      expect(result.strategy).toBe('network-only');
      expect(result.cacheName).toBeNull();
    });

    it('returns a consistent RouteDecision shape', () => {
      const result: RouteDecision = routeRequest('/', 'navigate', ORIGIN);

      expect(result).toHaveProperty('strategy');
      expect(result).toHaveProperty('cacheName');
      expect(result).toHaveProperty('fallbackUrl');
      expect(typeof result.strategy).toBe('string');
    });
  });

  // ── Constants ───────────────────────────────────────────────────────

  describe('constants', () => {
    it('STATIC_CACHE is a non-empty versioned string', () => {
      expect(STATIC_CACHE).toBeTruthy();
      expect(STATIC_CACHE).toMatch(/talenttrust-static-v\d+/);
    });

    it('OFFLINE_URL points to /offline', () => {
      expect(OFFLINE_URL).toBe('/offline');
    });
  });
});

describe('runtime cache cap', () => {
  const makeCache = (count: number) => {
    const entries = new Map(Array.from({ length: count }, (_, index) => [`page-${index}`, {}]));
    return {
      entries,
      keys: vi.fn(async () => [...entries.keys()] as unknown as Request[]),
      delete: vi.fn(async (key: Request) => entries.delete(key as unknown as string)),
      put: vi.fn(async (key: Request, response: Response) => { entries.set(key as unknown as string, response); }),
    };
  };

  it.each([0, MAX_RUNTIME_ENTRIES - 1, MAX_RUNTIME_ENTRIES])('leaves %i entries unchanged', async (count) => {
    const cache = makeCache(count);
    await trimRuntimeCache(cache);
    expect(cache.entries.size).toBe(count);
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('evicts the oldest entries at the cap boundary', async () => {
    const cache = makeCache(MAX_RUNTIME_ENTRIES + 2);
    await trimRuntimeCache(cache);
    expect(cache.entries.size).toBe(MAX_RUNTIME_ENTRIES);
    expect([...cache.entries.keys()][0]).toBe('page-2');
    expect(cache.delete.mock.calls.map(([key]) => key)).toEqual(['page-0', 'page-1']);
  });

  it('serializes concurrent writes and refreshes entry order', async () => {
    const cache = makeCache(MAX_RUNTIME_ENTRIES);
    await cacheRuntimeResponse(cache, 'page-0' as unknown as Request, {} as Response);
    await Promise.all(['new-1', 'new-2'].map((key) => cacheRuntimeResponse(cache, key as unknown as Request, {} as Response)));
    expect(cache.entries.size).toBe(MAX_RUNTIME_ENTRIES);
    expect(cache.entries.has('page-0')).toBe(true);
    expect(cache.entries.has('page-1')).toBe(false);
    expect(cache.entries.has('page-2')).toBe(false);
    expect([...cache.entries.keys()].slice(-3)).toEqual(['page-0', 'new-1', 'new-2']);
  });

  it('a failed write does not block later cache writes', async () => {
    const cache = makeCache(0);
    cache.put.mockRejectedValueOnce(new Error('quota exceeded'));
    await expect(cacheRuntimeResponse(cache, 'failed' as unknown as Request, {} as Response)).rejects.toThrow('quota');
    await cacheRuntimeResponse(cache, 'next' as unknown as Request, {} as Response);
    expect([...cache.entries.keys()]).toEqual(['next']);
  });
});
