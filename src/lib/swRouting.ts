/**
 * Pure service-worker routing logic.
 *
 * The actual `public/sw.js` service worker mirrors the decisions made here
 * so that the routing rules are unit-testable without a browser environment.
 * Keeping this module free of `self`, `caches`, `fetch`, and any other
 * service-worker global means the tests can run under jsdom / Node and the
 * production SW can import the same decisions via copy-paste.
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
export const STATIC_CACHE = 'talenttrust-static-v1';

/**
 * Fallback URL used when a same-origin navigation fails and the device is
 * offline.  The `/offline` page is precached at install time so it is
 * guaranteed to be available without a network round-trip.
 */
export const OFFLINE_URL = '/offline';

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
  if (!isSameOrigin) {
    return {
      strategy: 'network-only',
      cacheName: null,
      fallbackUrl: null,
    };
  }

  const pathname = parsedUrl.pathname;

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
      cacheName: STATIC_CACHE,
      fallbackUrl: OFFLINE_URL,
    };
  }

  // ── Other same-origin GET requests: network-first (app shell) ──────
  // Fallthrough for same-origin sub-resources that are not static assets.
  // Use network-first so stale content is avoided, but cache the response
  // so the shell can still load offline.
  return {
    strategy: 'network-first',
    cacheName: STATIC_CACHE,
    fallbackUrl: null,
  };
}
