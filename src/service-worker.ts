import {
  cacheRuntimeResponse,
  OFFLINE_URL,
  PRECACHE_URLS,
  routeRequest,
  RUNTIME_CACHE,
  STATIC_CACHE,
  trimRuntimeCache,
  type RouteDecision,
} from './lib/swRouting';

interface LifetimeEvent { waitUntil(work: Promise<unknown>): void }
interface FetchEvent extends LifetimeEvent {
  request: Request;
  respondWith(response: Promise<Response>): void;
}
interface WorkerScope {
  location: { origin: string };
  clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', listener: (event: LifetimeEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

const scope = globalThis as unknown as WorkerScope;
const offlineResponse = () => new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });

async function match(cacheName: string, request: Request | string): Promise<Response | undefined> {
  try { return await (await caches.open(cacheName)).match(request); }
  catch { return undefined; }
}

async function handleRequest(request: Request, decision: RouteDecision): Promise<Response> {
  const cacheName = decision.cacheName!;
  if (decision.strategy === 'cache-first') {
    const cached = await match(cacheName, request);
    if (cached) return cached;
  }
  try {
    const response = await fetch(request);
    const directives = response.headers.get('cache-control') ?? '';
    if (response.ok && response.type !== 'opaque' && !/(?:^|,)\s*(?:no-store|private)(?:\s|,|=|$)/i.test(directives)) {
      try {
        const cache = await caches.open(cacheName);
        if (cacheName === RUNTIME_CACHE) await cacheRuntimeResponse(cache, request, response.clone());
        else await cache.put(request, response.clone());
      } catch { /* A quota/write failure must not discard a successful network response. */ }
    }
    return response;
  } catch {
    const cached = await match(cacheName, request);
    if (cached) return cached;
    if (decision.fallbackUrl) {
      const fallback = await match(STATIC_CACHE, decision.fallbackUrl);
      if (fallback) return fallback;
    }
    return offlineResponse();
  }
}

scope.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.all(PRECACHE_URLS.map(async (url) => {
      try { await cache.add(url); }
      catch { /* One unavailable asset must not abort installation. */ }
    }));
    await scope.skipWaiting();
  })());
});

scope.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => /^talenttrust-(?:static|runtime)-/.test(name)
      && name !== STATIC_CACHE && name !== RUNTIME_CACHE).map((name) => caches.delete(name)));
    try { await trimRuntimeCache(await caches.open(RUNTIME_CACHE)); }
    catch { /* Cache Storage can be disabled; online requests still work. */ }
    await scope.clients.claim();
  })());
});

scope.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const decision = routeRequest(event.request.url, event.request.mode, scope.location.origin);
  if (decision.strategy === 'network-only') return;
  event.respondWith(handleRequest(event.request, decision));
});

scope.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void scope.skipWaiting();
});
