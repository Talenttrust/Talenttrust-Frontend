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

- **Types**: `EscrowContract`, `Milestone`, `Dispute`, `Reputation`, `Stats`, `ViewFilter`, `ApiError`, `ApiErrorKind` (`'network' | 'timeout' | 'http' | 'aborted'`).
- `api<T>(path, init)` — applies a `10000` ms default timeout (`combineSignals`) and retries `GET` requests up to 2 times on network errors or HTTP `502`/`503`/`504` with exponential backoff and jitter.
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

Pure request routing logic mirrored by `public/sw.js` and registered via `src/components/ServiceWorkerRegister.tsx`:

- Cross-origin requests (API, Soroban RPC, Horizon) → `'network-only'` (never cached)
- Same-origin `/_next/static/*` → `'cache-first'` in `STATIC_CACHE` (`'talenttrust-static-v1'`)
- Same-origin navigation (`mode === 'navigate'`) → `'network-first'` with fallback to `OFFLINE_URL` (`'/offline'`)
- Other same-origin `GET` requests → `'network-first'` in `STATIC_CACHE`
