/**
 * TalentTrust Service Worker
 * ─────────────────────────
 * Hand-written service worker that precaches the app shell and static
 * assets, provides an offline fallback page, and never caches API, RPC,
 * or Horizon responses.
 *
 * The routing logic mirrors `src/lib/swRouting.ts` so that the decisions
 * are unit-tested in `src/lib/__tests__/swRouting.test.ts`.
 *
 * ## Strategies
 * | Request type                          | Strategy       | Cache? |
 * |---------------------------------------|----------------|--------|
 * | Cross-origin (API, RPC, Horizon)      | network-only   | No     |
 * | Same-origin /_next/static/*           | cache-first    | Yes    |
 * | Same-origin navigations               | network-first  | Shell  |
 * | Same-origin other GET                 | network-first  | Shell  |
 *
 * @see src/lib/swRouting.ts — pure routing logic (unit-tested)
 */

// ── Cache names (versioned) ──────────────────────────────────────────
const STATIC_CACHE = 'talenttrust-static-v1';
const RUNTIME_CACHE = 'talenttrust-runtime-v1';
const OFFLINE_URL = '/offline';

// ── Precache list: app shell + icons ─────────────────────────────────
const PRECACHE_URLS = [
  '/',
  OFFLINE_URL,
  '/icon.svg',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// ═══════════════════════════════════════════════════════════════════════
// INSTALL — precache the app shell
// ═══════════════════════════════════════════════════════════════════════
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Use individual fetches with catch so a single failed asset doesn't
      // abort the entire install.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            // If the dev server isn't serving a precache URL (e.g. /offline
            // before the page exists), skip it rather than failing install.
          }
        }),
      );
      // Activate immediately so the first visit has the SW ready.
      self.skipWaiting();
    })(),
  );
});

// ═══════════════════════════════════════════════════════════════════════
// ACTIVATE — clean up old cache versions
// ═══════════════════════════════════════════════════════════════════════
self.addEventListener('activate', (event) => {
  const allowedCaches = [STATIC_CACHE, RUNTIME_CACHE];

  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !allowedCaches.includes(key))
          .map((key) => caches.delete(key)),
      );
      // Take control of all clients immediately.
      await self.clients.claim();
    })(),
  );
});

// ═══════════════════════════════════════════════════════════════════════
// FETCH — route requests using the same logic as swRouting.ts
// ═══════════════════════════════════════════════════════════════════════
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests. POST/PUT/DELETE are always network-only.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // ── Cross-origin: network-only (API, RPC, Horizon) ────────────────
  if (!isSameOrigin) {
    // Do not intercept — let the browser go straight to the network.
    return;
  }

  const pathname = url.pathname;

  // ── Next.js static assets: cache-first ────────────────────────────
  if (pathname.startsWith('/_next/static/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        try {
          const response = await fetch(request);
          // Only cache valid (2xx) responses.
          if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          // Network failed and no cache — return a minimal fallback.
          return new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
      })(),
    );
    return;
  }

  // ── Navigations: network-first with /offline fallback ─────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          // Cache the latest navigated page so it's available offline.
          if (response.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          // Try the runtime cache first (last visited page).
          const runtimeMatch = await caches.match(request);
          if (runtimeMatch) return runtimeMatch;

          // Fall back to the precached offline page.
          const offlineMatch = await caches.match(OFFLINE_URL);
          if (offlineMatch) return offlineMatch;

          // Last resort: generic offline response.
          return new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
      })(),
    );
    return;
  }

  // ── Other same-origin GET: network-first (runtime cache) ──────────
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;

        return new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    })(),
  );
});

// ── Message handler: allow clients to trigger skipWaiting ────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
