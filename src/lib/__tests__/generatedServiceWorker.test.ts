// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertServiceWorkerCurrent, buildServiceWorker, generateServiceWorker } from '../../../scripts/build-sw.mjs';
import { MAX_RUNTIME_ENTRIES, OFFLINE_URL, PRECACHE_URLS, RUNTIME_CACHE, STATIC_CACHE } from '../swRouting';
import nextConfig from '../../../next.config.js';

const ORIGIN = 'https://app.example';
const workerUrl = new URL('../../../public/sw.js', import.meta.url);
const scriptUrl = new URL('../../../scripts/build-sw.mjs', import.meta.url);

async function createWorker(source: string, useSourceModule = false) {
  const stores = new Map<string, Map<string, Response>>();
  const key = (request: Request | string) => new URL(typeof request === 'string' ? request : request.url, ORIGIN).href;
  const store = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name)!;
  };
  const network = vi.fn(async () => new Response('fresh'));
  let failWrites = false;
  const cacheStorage = {
    keys: vi.fn(async () => [...stores.keys()]),
    delete: vi.fn(async (name: string) => stores.delete(name)),
    open: vi.fn(async (name: string) => ({
      keys: async () => [...store(name).keys()].map((url) => new Request(url)),
      match: async (request: Request | string) => store(name).get(key(request))?.clone(),
      delete: async (request: Request | string) => store(name).delete(key(request)),
      put: async (request: Request | string, response: Response) => {
        if (failWrites) throw new Error('quota');
        store(name).set(key(request), response);
      },
      add: async (url: string) => {
        if (url === '/icon-192x192.png') throw new Error('synthetic missing icon');
        store(name).set(key(url), new Response(`precache ${url}`));
      },
    })),
  };
  const listeners: Record<string, (event: unknown) => void> = {};
  const scope = {
    location: { origin: ORIGIN },
    addEventListener: (name: string, listener: (event: unknown) => void) => { listeners[name] = listener; },
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(async () => undefined),
  };
  if (useSourceModule) {
    for (const [name, value] of Object.entries({ ...scope, caches: cacheStorage, fetch: network })) vi.stubGlobal(name, value);
    vi.resetModules();
    await import('../../service-worker');
  } else {
    runInNewContext(source, { ...scope, self: scope, caches: cacheStorage, fetch: network, URL, Response, Request, console }, { filename: fileURLToPath(workerUrl) });
  }
  const lifecycle = async (type: 'install' | 'activate') => {
    let work!: Promise<unknown>;
    listeners[type]({ waitUntil: (promise: Promise<unknown>) => { work = promise; } });
    await work;
  };
  const request = (url: string, mode = '', method = 'GET') => {
    let result: Promise<Response> | undefined;
    listeners.fetch({ request: { url: new URL(url, ORIGIN).href, mode, method },
      respondWith: (response: Promise<Response>) => { result = response; } });
    return result;
  };
  return { stores, store, key, network, cacheStorage, lifecycle, request, listeners, scope, failWrites: () => { failWrites = true; } };
}

describe.each([false, true])('service worker (source module: %s)', (useSourceModule) => {
  afterEach(() => vi.unstubAllGlobals());
  it('is reproducible, current and fails a stale-worker comparison', async () => {
    const generated = await generateServiceWorker();
    expect(generated).toBe(await readFile(workerUrl, 'utf8'));
    expect(generated).toBe(await generateServiceWorker());
    expect(() => assertServiceWorkerCurrent(generated + '\n// stale', generated)).toThrow('stale');
    await buildServiceWorker({ check: true });
    await buildServiceWorker();
    const originalArgv = process.argv;
    try {
      process.argv = [process.execPath, fileURLToPath(scriptUrl), '--check'];
      vi.resetModules();
      await import('../../../scripts/build-sw.mjs');
    } finally { process.argv = originalArgv; }
    expect(execFileSync(process.execPath, [fileURLToPath(scriptUrl), '--check'], { encoding: 'utf8' })).toContain('current');
    expect(execFileSync(process.execPath, [fileURLToPath(scriptUrl)], { encoding: 'utf8' })).toContain('Generated');
    expect(await readFile(workerUrl, 'utf8')).toBe(generated);
  }, 20_000);

  it('retains the no-cache header for service worker updates', async () => {
    const rule = (await nextConfig.headers!()).find((entry: { source: string }) => entry.source === '/sw.js');
    expect(rule?.headers).toContainEqual({ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' });
  });

  it('installs the shell despite a missing asset and removes only old TalentTrust caches', async () => {
    const worker = await createWorker(await readFile(workerUrl, 'utf8'), useSourceModule);
    await worker.lifecycle('install');
    expect(worker.store(STATIC_CACHE).has(worker.key(OFFLINE_URL))).toBe(true);
    expect(worker.store(STATIC_CACHE).size).toBe(PRECACHE_URLS.length - 1);
    expect(worker.scope.skipWaiting).toHaveBeenCalledTimes(1);
    worker.store('talenttrust-static-v1');
    worker.store('talenttrust-runtime-v1');
    worker.store('other-app-cache');
    for (let i = 0; i <= MAX_RUNTIME_ENTRIES; i++) worker.store(RUNTIME_CACHE).set(worker.key(`/preexisting-${i}`), new Response('cached'));
    await worker.lifecycle('activate');
    expect(worker.stores.has('talenttrust-static-v1')).toBe(false);
    expect(worker.stores.has('talenttrust-runtime-v1')).toBe(false);
    expect(worker.stores.has('other-app-cache')).toBe(true);
    expect(worker.store(RUNTIME_CACHE).size).toBe(MAX_RUNTIME_ENTRIES);
    expect(worker.scope.clients.claim).toHaveBeenCalledOnce();
    worker.listeners.message({ data: 'unrelated' });
    worker.listeners.message({ data: 'SKIP_WAITING' });
    expect(worker.scope.skipWaiting).toHaveBeenCalledTimes(2);
  });

  it.each(['https://api.example/contracts', 'https://soroban-testnet.stellar.org', 'https://horizon-testnet.stellar.org', '/api/contracts', '/api', '/sw.js'])(
    'does not intercept or cache %s', async (url) => {
      const worker = await createWorker(await readFile(workerUrl, 'utf8'), useSourceModule);
      expect(worker.request(url)).toBeUndefined();
      expect(worker.network).not.toHaveBeenCalled();
      expect(worker.cacheStorage.open).not.toHaveBeenCalled();
    },
  );

  it('does not intercept mutations', async () => {
    const worker = await createWorker(await readFile(workerUrl, 'utf8'), useSourceModule);
    for (const method of ['POST', 'PUT', 'DELETE']) expect(worker.request('/contracts', '', method)).toBeUndefined();
  });

  it('cache-first assets reuse the static cache, with an offline miss returning 503', async () => {
    const worker = await createWorker(await readFile(workerUrl, 'utf8'), useSourceModule);
    const url = '/_next/static/chunks/test.js';
    expect(await (await worker.request(url))!.text()).toBe('fresh');
    expect(await (await worker.request(url))!.text()).toBe('fresh');
    expect(worker.network).toHaveBeenCalledTimes(1);
    expect(worker.store(RUNTIME_CACHE).size).toBe(0);
    worker.network.mockRejectedValueOnce(new Error('offline'));
    expect((await worker.request('/_next/static/missing.js'))!.status).toBe(503);
  });

  it('concurrent runtime requests stay capped and keep the newest pages', async () => {
    const worker = await createWorker(await readFile(workerUrl, 'utf8'), useSourceModule);
    await Promise.all(Array.from({ length: MAX_RUNTIME_ENTRIES + 5 }, (_, index) => worker.request(`/page-${index}`, 'navigate')));
    expect(worker.store(RUNTIME_CACHE).size).toBe(MAX_RUNTIME_ENTRIES);
    expect(worker.store(RUNTIME_CACHE).has(worker.key('/page-0'))).toBe(false);
    expect(worker.store(RUNTIME_CACHE).has(worker.key(`/page-${MAX_RUNTIME_ENTRIES + 4}`))).toBe(true);
  });

  it('offline navigation uses a cached page, then the static offline shell, then 503', async () => {
    const worker = await createWorker(await readFile(workerUrl, 'utf8'), useSourceModule);
    await worker.lifecycle('install');
    await worker.request('/visited', 'navigate');
    worker.network.mockRejectedValue(new Error('offline'));
    expect(await (await worker.request('/visited', 'navigate'))!.text()).toBe('fresh');
    expect(await (await worker.request('/unvisited', 'navigate'))!.text()).toBe('precache /offline');
    expect((await worker.request('/unvisited-resource'))!.status).toBe(503);
    worker.store(STATIC_CACHE).clear();
    expect((await worker.request('/unvisited', 'navigate'))!.status).toBe(503);
  });

  it.each([['no-store', 200], ['private, max-age=30', 200], ['', 500]])('does not persist %s / HTTP %i', async (directive, status) => {
    const worker = await createWorker(await readFile(workerUrl, 'utf8'), useSourceModule);
    worker.network.mockResolvedValueOnce(new Response('network', { status, headers: { 'cache-control': directive } }));
    expect((await worker.request('/data'))!.status).toBe(status);
    expect(worker.store(RUNTIME_CACHE).size).toBe(0);
  });

  it('quota failures preserve online responses; unavailable storage still claims clients', async () => {
    const worker = await createWorker(await readFile(workerUrl, 'utf8'), useSourceModule);
    worker.failWrites();
    expect(await (await worker.request('/page'))!.text()).toBe('fresh');
    worker.cacheStorage.open.mockRejectedValue(new Error('storage disabled'));
    expect(await (await worker.request('/_next/static/new.js'))!.text()).toBe('fresh');
    worker.network.mockRejectedValue(new Error('offline'));
    expect((await worker.request('/page', 'navigate'))!.status).toBe(503);
    await worker.lifecycle('activate');
    expect(worker.scope.clients.claim).toHaveBeenCalledOnce();
  });
});
