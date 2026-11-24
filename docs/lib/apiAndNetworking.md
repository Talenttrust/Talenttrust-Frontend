# API, SWR, Status & Service Worker Routing

Core networking, caching, health-check, and offline routing utilities in `src/lib/`.

## File Locations

- REST client & domain types: `src/lib/api.ts` (`src/lib/api.test.ts`)
- SWR configuration & cache keys: `src/lib/swr.tsx`
- Command palette command definitions: `src/lib/commands.ts` (`src/lib/__tests__/commands.test.ts`)
- System health checkers: `src/lib/status.ts` (`src/lib/status.test.ts`)
- Service worker request router: `src/lib/swRouting.ts` (`src/lib/__tests__/swRouting.test.ts`)
- Site configuration: `src/lib/site.ts`

---

## `api` (`src/lib/api.ts`)

Typed wrapper around `fetch` targeting `site.apiUrl`:

- **Types**: `EscrowContract`, `Milestone`, `Dispute`, `Reputation`, `Stats`, `ViewFilter`, `ApiError`, `ApiErrorKind` (`'network' | 'timeout' | 'http' | 'aborted' | 'parse'`).
- `api<T>(path, init)` — applies a `10000` ms default timeout (`combineSignals`) and retries `GET` requests up to 2 times on network errors or HTTP `502`/`503`/`504` with exponential backoff and jitter.
- Response bodies: an empty body (for example `204`) resolves as `{}`. A successful response whose body is not valid JSON throws `ApiError` with kind `'parse'` and is not retried. Error responses (`!res.ok`) with invalid JSON still throw kind `'http'` with their status.
- `listContracts(opts)` — fetches `/api/v1/contracts` with optional `?party=` and `?status=` query parameters.
- `getStats()` — fetches `/stats`.
- `unwrapContract(payload)` / `unwrapReputation(payload)` — unwraps `{ data: ... }` or direct response payloads.

---

## `swr` (`src/lib/swr.tsx`)

- `SwrProvider` — wraps the app in `SWRConfig` (`src/app/layout.tsx`) with `fetcher` and `shouldRetryOnError` (disables retries on 4xx HTTP errors).
- Key helpers: `contractsListKey(filters?)`, `contractKey(id)`, `isContractsListKey(key)`.

---

## `status` (`src/lib/status.ts`)

Health checkers used by `/status` (`src/app/status/StatusClient.tsx`):

- `checkApi()` — `GET /health`
- `checkChainConfig()` — `GET /api/v1/chain` with frontend/backend `contractId` and `network` mismatch detection
- `checkRpc(rpcUrl)` — Soroban JSON-RPC `getLatestLedger`
- `checkContract(rpcUrl)` — Soroban RPC liveness check for `site.contractId`
- `aggregateState(results)` — derives overall `'operational' | 'degraded' | 'down'` state (`DEGRADED_THRESHOLD_MS = 2000`, `FETCH_TIMEOUT_MS = 5000`).

---

## `swRouting` (`src/lib/swRouting.ts`)

Shared request routing/cache policy bundled with `src/service-worker.ts` into the
committed `public/sw.js`, registered via `src/components/ServiceWorkerRegister.tsx`:

- Cross-origin requests (API, Soroban RPC, Horizon) → `'network-only'` (never cached)
- Same-origin `/api`, `/api/*` and `/sw.js` → `'network-only'`
- Same-origin `/_next/static/*` → `'cache-first'` in `STATIC_CACHE` (`'talenttrust-static-v2'`)
- Same-origin navigation (`mode === 'navigate'`) → `'network-first'` in `RUNTIME_CACHE` (`'talenttrust-runtime-v2'`), with fallback to `OFFLINE_URL` (`'/offline'`) in the static cache
- Other same-origin `GET` requests → `'network-first'` in `RUNTIME_CACHE`
- Non-GET requests are not intercepted. Non-2xx, opaque, `private` and `no-store` responses are never written to runtime caches.

`MAX_RUNTIME_ENTRIES = 100` bounds runtime pages/resources. `cacheRuntimeResponse`
serializes delete/put/trim across overlapping fetches and reinserts refreshed
entries at the end. `trimRuntimeCache` evicts the oldest entries in Cache Storage
insertion order. A full cache plus one new page remains at 100 entries; static
shell assets are kept separately. Cache quota failures preserve successful
network responses. Activation removes only obsolete TalentTrust static/runtime
caches, keeps caches owned by other apps, and trims an existing runtime cache.

`npm run prebuild` generates readable worker JavaScript using the already-locked
TypeScript compiler; `npm run build` runs it automatically. The generator reads
only the two local source files, adds no dependencies and performs no downloads
or remote execution. Commit regenerated `public/sw.js` after changing either
source. `node scripts/build-sw.mjs --check` and the drift test fail if it is stale.
`/sw.js` retains `Cache-Control: no-cache, no-store, must-revalidate`.

Verification:

```sh
npx vitest run src/lib/__tests__/swRouting.test.ts src/lib/__tests__/generatedServiceWorker.test.ts
node scripts/build-sw.mjs --check
```

The generated-worker tests execute the committed JavaScript against synthetic
fetch/Cache Storage transports, including concurrency, cap boundaries, cache
failures, activation, offline navigation and network-only API/RPC/Horizon paths.
