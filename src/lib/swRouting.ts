/**
 * Pure service-worker routing logic.
 *
 * `scripts/build-sw.mjs` bundles this module with `src/service-worker.ts`
 * into `public/sw.js`. Tests and the browser worker use the same policy.
 *
 * ## Strategies
 *
 * | Request type                         | Strategy       | Cache? |
 * |--------------------------------------|----------------|--------|
 * | Cross-origin (API, RPC, Horizon)     | network-only   | No     |
 * | Same-origin `/_next/static/*`        | cache-first    | Yes    |
 * | Same-origin navigation (mode=navigate) | network-first | Shell  |
 * | Same-origin other GET                | network-first  | Shell  |
 *
 * No response from `NEXT_PUBLIC_API_URL`, Soroban RPC, or Horizon is ever
 * stored in Cache Storage.
 */

/** Strategies the service worker can act on. */
export type CacheStrategy =
  | 'network-only'
  | 'cache-first'
  | 'network-first'
  | 'offline-fallback';

/** The outcome of routing a single request. */
export interface RouteDecision {
  /** Which caching strategy to apply. */
  strategy: CacheStrategy;
  /**
   * The cache name to use for cache-first / network-first strategies.
   * `null` for network-only requests so the SW knows to skip Cache Storage
   * entirely.
   */
  cacheName: string | null;
  /**
   * For navigations: the URL to fall back to when the network fails.
   * `null` when no fallback applies (network-only, cache-first).
   */
  fallbackUrl: string | null;
}

/**
 * Versioned cache name for static assets and the app shell.
 *
 * Bump this version whenever the precache asset list changes so the
 * `activate` event can delete old caches left over from previous versions.
 */
export const STATIC_CACHE = 'talenttrust-static-v2';
export const RUNTIME_CACHE = 'talenttrust-runtime-v2';
export const MAX_RUNTIME_ENTRIES = 100;

/**
 * Fallback URL used when a same-origin navigation fails and the device is
 * offline.  The `/offline` page is precached at install time so it is
 * guaranteed to be available without a network round-trip.
 */
export const OFFLINE_URL = '/offline';
export const PRECACHE_URLS = ['/', OFFLINE_URL, '/icon.svg', '/icon-192x192.png', '/icon-512x512.png'];

/** Delete oldest entries in Cache Storage insertion order. */
export async function trimRuntimeCache(cache: Pick<Cache, 'keys' | 'delete'>): Promise<void> {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_RUNTIME_ENTRIES))) {
    await cache.delete(key);
  }
}

// Fetch events can overlap. Serialize refresh/put/trim to enforce the cap,
// including when separate caches.open calls return different Cache objects.
let runtimeWrites = Promise.resolve();
export function cacheRuntimeResponse(cache: Pick<Cache, 'keys' | 'delete' | 'put'>, request: Request, response: Response): Promise<void> {
  const write = runtimeWrites.catch(() => undefined).then(async () => {
    // Reinsert a refreshed entry at the end so eviction retains fresh pages.
    await cache.delete(request);
    await cache.put(request, response);
    await trimRuntimeCache(cache);
  });
  runtimeWrites = write;
  return write;
}

/**
 * Determine the caching strategy for an outgoing request.
 *
 * @param url    - The request URL (absolute or relative).
 * @param mode   - The fetch mode (`'navigate'` for page loads, `''` for
 *                 sub-resources when not known).
 * @returns      A {@link RouteDecision} describing how to handle the request.
 */
export function routeRequest(
  url: string,
  mode: string,
  origin: string,
): RouteDecision {
  let parsedUrl: URL;

  try {
    // Resolve relative URLs against the given origin so callers can pass
    // either `/foo` or `https://host/foo`.
    parsedUrl = url.startsWith('http') ? new URL(url) : new URL(url, origin);
  } catch {
    // Malformed URL — never cache, never fallback, just hit the network.
    return {
      strategy: 'network-only',
      cacheName: null,
      fallbackUrl: null,
    };
  }

  const isSameOrigin = parsedUrl.origin === origin;

  // ── Cross-origin requests are always network-only ──────────────────
  // This covers NEXT_PUBLIC_API_URL, Soroban RPC endpoints, Horizon, and
  // any wallet relay.  No cross-origin response is ever stored in Cache
  // Storage.
  if (!isSameOrigin || !['http:', 'https:'].includes(parsedUrl.protocol)) {
    return {
      strategy: 'network-only',
      cacheName: null,
      fallbackUrl: null,
    };
  }

  const pathname = parsedUrl.pathname;

  // Same-origin API responses and the worker update script also stay fresh.
  if (pathname === '/api' || pathname.startsWith('/api/') || pathname === '/sw.js') {
    return { strategy: 'network-only', cacheName: null, fallbackUrl: null };
  }

  // ── Next.js static assets: cache-first ──────────────────────────────
  // These are immutable, content-hashed files served from `/_next/static/`.
  // They are safe to cache aggressively and never need a network fallback.
  if (pathname.startsWith('/_next/static/')) {
    return {
      strategy: 'cache-first',
      cacheName: STATIC_CACHE,
      fallbackUrl: null,
    };
  }

  // ── Navigations: network-first with offline fallback ───────────────
  // Try the network first so the user always gets fresh content.  When the
  // network is unavailable, fall back to the precached /offline page.
  if (mode === 'navigate') {
    return {
      strategy: 'network-first',
      cacheName: RUNTIME_CACHE,
      fallbackUrl: OFFLINE_URL,
    };
  }

  // ── Other same-origin GET requests: network-first (app shell) ──────
  // Fallthrough for same-origin sub-resources that are not static assets.
  // Use network-first so stale content is avoided, but cache the response
  // so the shell can still load offline.
  return {
    strategy: 'network-first',
    cacheName: RUNTIME_CACHE,
    fallbackUrl: null,
  };
}
