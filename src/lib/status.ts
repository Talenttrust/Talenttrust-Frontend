/**
 * Status checkers for the /status page.
 *
 * Each checker returns a StatusResult describing whether the dependency is
 * operational, degraded (slow), or down, plus latency and a detail string.
 *
 * Dependencies:
 *  - REST API  : GET /health
 *  - Chain config: GET /api/v1/chain  (+ mismatch detection)
 *  - Soroban RPC : JSON-RPC getHealth + getLatestLedger (no SDK)
 *  - Contract    : JSON-RPC getLedgerEntries for the contract instance (lazy SDK import)
 */

import { site } from './site';

export type CheckState = 'operational' | 'degraded' | 'down';

export interface StatusResult {
  state: CheckState;
  latencyMs: number;
  detail: string;
}

/** Latency above this threshold is considered degraded but not down (ms). */
export const DEGRADED_THRESHOLD_MS = 2000;

/** Fetch timeout for all checkers (ms). */
export const FETCH_TIMEOUT_MS = 5000;

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Fetch with an AbortController timeout.  Throws on network error or timeout.
 * Returns the Response — callers are responsible for checking ok and parsing.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = signal ?? init.signal ?? undefined;
  const onExternalAbort = () => controller.abort(externalSignal?.reason);

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Classify a measured latency as operational or degraded.
 * The caller should call this only when the request itself succeeded.
 */
function classify(latencyMs: number): CheckState {
  return latencyMs > DEGRADED_THRESHOLD_MS ? 'degraded' : 'operational';
}

/**
 * Detect an aborted request (our timeout) rather than a genuine network error.
 * `fetch` rejects with a DOMException named AbortError; its message case varies
 * between runtimes, so match on the name as well as the message.
 */
function isAbortError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { name, message } = err as { name?: unknown; message?: unknown };
  if (name === 'AbortError') return true;
  return typeof message === 'string' && /abort|timed? ?out/i.test(message);
}

type TimedResult<T> =
  | { ok: true; value: T; latencyMs: number }
  | { ok: false; error: unknown; latencyMs: number };

async function timed<T>(fn: () => Promise<T>): Promise<TimedResult<T>> {
  const startedAt = Date.now();
  try {
    const value = await fn();
    return { ok: true, value, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return { ok: false, error, latencyMs: Date.now() - startedAt };
  }
}

function describeFetchError(err: unknown, label: string): string {
  if (isAbortError(err)) {
    return `${label} timed out after ${FETCH_TIMEOUT_MS / 1000}s`;
  }
  return `Network error: ${err instanceof Error ? err.message : String(err)}`;
}

type JsonResult<T> =
  | { ok: true; data: T }
  | { ok: false; detail: string };

async function readJson<T>(res: Response, label: string): Promise<JsonResult<T>> {
  if (!res.ok) {
    return { ok: false, detail: `HTTP ${res.status} ${label}` };
  }

  try {
    const data: T = await res.json();
    return { ok: true, data };
  } catch {
    return { ok: false, detail: `Malformed JSON ${label}` };
  }
}

type FetchJsonResult<T> =
  | { ok: true; data: T; latencyMs: number }
  | { ok: false; detail: string; latencyMs: number };

async function fetchJson<T>(
  fn: () => Promise<Response>,
  responseLabel: string,
  timeoutLabel: string,
): Promise<FetchJsonResult<T>> {
  const response = await timed(fn);
  if (!response.ok) {
    return {
      ok: false,
      latencyMs: response.latencyMs,
      detail: describeFetchError(response.error, timeoutLabel),
    };
  }

  const json = await readJson<T>(response.value, responseLabel);
  if (!json.ok) {
    return { ok: false, latencyMs: response.latencyMs, detail: json.detail };
  }
  return { ok: true, latencyMs: response.latencyMs, data: json.data };
}

// ──────────────────────────────────────────────────────────────────────────────
// checkApi — GET /health
// ──────────────────────────────────────────────────────────────────────────────

export interface ApiHealthData {
  uptime?: number;
  version?: string;
  storage?: string;
  [key: string]: unknown;
}

export async function checkApi(signal?: AbortSignal): Promise<StatusResult> {
  const url = `${site.apiUrl}/health`;
  const response = await fetchJson<ApiHealthData>(
    () => fetchWithTimeout(url),
    'from /health',
    'Request',
  );
  if (!response.ok) {
    return { state: 'down', latencyMs: response.latencyMs, detail: response.detail };
    const res = await fetchWithTimeout(url, {}, FETCH_TIMEOUT_MS, signal);
  }

  const { data, latencyMs } = response;
  const versionStr = data.version ? ` v${data.version}` : '';
  const detail = `API${versionStr} responded in ${latencyMs}ms`;
  return { state: classify(latencyMs), latencyMs, detail };
}

// ──────────────────────────────────────────────────────────────────────────────
// checkChainConfig — GET /api/v1/chain + mismatch detection
// ──────────────────────────────────────────────────────────────────────────────

export interface ChainConfigData {
  network?: string;
  rpcUrl?: string;
  contractId?: string;
  [key: string]: unknown;
}

export interface ChainConfigResult extends StatusResult {
  rpcUrl?: string;
  mismatch?: string;
}

export async function checkChainConfig(signal?: AbortSignal): Promise<ChainConfigResult> {
  const url = `${site.apiUrl}/api/v1/chain`;
  const response = await fetchJson<ChainConfigData>(
    () => fetchWithTimeout(url),
    'from /api/v1/chain',
    'Request',
  );
  if (!response.ok) {
    return { state: 'down', latencyMs: response.latencyMs, detail: response.detail };
  }
    const res = await fetchWithTimeout(url, {}, FETCH_TIMEOUT_MS, signal);

  const { data, latencyMs } = response;

  // Mismatch detection
  const mismatches: string[] = [];
  if (data.contractId && data.contractId !== site.contractId) {
    mismatches.push(
      `Contract ID mismatch — backend: ${data.contractId}, frontend: ${site.contractId}`,
    );
  }
  if (data.network && data.network !== site.network) {
    mismatches.push(
      `Network mismatch — backend: ${data.network}, frontend: ${site.network}`,
    );
  }

  if (mismatches.length > 0) {
    return {
      state: 'degraded',
      latencyMs,
      detail: mismatches.join(' | '),
      rpcUrl: data.rpcUrl,
      mismatch: mismatches.join(' | '),
    };
  }

  const detail = `Network: ${data.network ?? 'unknown'}, Contract: ${(data.contractId ?? '').slice(0, 8)}…`;
  return {
    state: classify(latencyMs),
    latencyMs,
    detail,
    rpcUrl: data.rpcUrl,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// checkRpc — Soroban JSON-RPC getHealth + getLatestLedger (no SDK)
// ──────────────────────────────────────────────────────────────────────────────

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

export async function checkRpc(rpcUrl: string, signal?: AbortSignal): Promise<StatusResult> {
  if (!rpcUrl) {
    return { state: 'down', latencyMs: 0, detail: 'RPC URL not configured' };
  }

  // getLatestLedger is a cheap read-only call supported by all Soroban RPCs
  const response = await fetchJson<JsonRpcResponse<{ sequence: number; protocolVersion: number }>>(
    () =>
      fetchWithTimeout(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getLatestLedger',
          params: {},
        }),
    'from Soroban RPC',
    'RPC request',
  );
  if (!response.ok) {
    return { state: 'down', latencyMs: response.latencyMs, detail: response.detail };
  }
    const res = await fetchWithTimeout(
      rpcUrl,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getLatestLedger',
          params: {},
        }),
      },
      FETCH_TIMEOUT_MS,
      signal,
    );

  const { data, latencyMs } = response;
  if (data.error) {
    return {
      state: 'down',
      latencyMs,
      detail: `RPC error ${data.error.code}: ${data.error.message}`,
    };
  }

  if (!data.result) {
    return { state: 'down', latencyMs, detail: 'Unexpected RPC response shape' };
  }

  const detail = `Ledger #${data.result.sequence}, protocol v${data.result.protocolVersion}`;
  return { state: classify(latencyMs), latencyMs, detail };
}

// ──────────────────────────────────────────────────────────────────────────────
// checkContract — verify the contract instance via JSON-RPC getLedgerEntries
// ──────────────────────────────────────────────────────────────────────────────

interface LedgerEntryJson {
  key?: string;
  /** Base64-encoded `xdr.LedgerEntryData`. */
  xdr?: string;
  lastModifiedLedgerSeq?: number;
  liveUntilLedgerSeq?: number;
}

interface GetLedgerEntriesResult {
  entries?: LedgerEntryJson[];
  latestLedger?: number;
}

/**
 * Build the ledger key for a contract's instance entry.
 *
 * `getLedgerEntries` expects the base64 XDR of a `LedgerKey`. The instance key
 * is the contract data entry with the `LedgerKeyContractInstance` key and
 * persistent durability — the same key the SDK's `Contract.getFootprint()`
 * produces. The SDK is imported lazily so the status page's initial bundle
 * stays small.
 */
async function contractInstanceLedgerKey(contractId: string): Promise<string> {
  const { Address, xdr } = await import('@stellar/stellar-sdk');
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(contractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent,
    }),
  ).toXDR('base64');
}

/**
 * Read the contract's circuit breaker from its instance storage.
 *
 * The contract stores `Paused` in instance storage (the value exposed by the
 * `is_paused` method read by `readContractStatus()`).
 */
async function isContractPaused(entryXdr: string): Promise<boolean> {
  const { scValToNative, xdr } = await import('@stellar/stellar-sdk');
  const ledgerEntry = xdr.LedgerEntryData.fromXdr(entryXdr, 'base64');
  if (ledgerEntry.type !== 'contractData') throw new Error('Expected a contract data entry');

  const value = ledgerEntry.contractData.val;
  if (value.type !== 'scvContractInstance') throw new Error('Expected a contract instance');

  return (value.instance.storage ?? []).some((item) => {
    try {
      const key = scValToNative(item.key);
      if (!Array.isArray(key) || key.length !== 1 || key[0] !== 'Paused') return false;
      return scValToNative(item.val) === true;
    } catch {
      return false;
    }
  });
}

export async function checkContract(rpcUrl: string, signal?: AbortSignal): Promise<StatusResult> {
  if (!rpcUrl) {
    return { state: 'down', latencyMs: 0, detail: 'RPC URL required to check contract' };
  }

    let ledgerKey: string;
    try {
      ledgerKey = await contractInstanceLedgerKey(site.contractId);
    } catch {
      return {
        state: 'down',
        latencyMs: Date.now() - t0,
        detail: 'Contract ID is not a valid Stellar contract address',
      };
    }

        method: 'getLedgerEntries',
        params: { keys: [ledgerKey] },
  // Use getLedgerEntries to verify the contract exists on-chain.
  // We POST a valid JSON-RPC request; a 200 response with a result means
  // the RPC is aware of the contract's ledger domain.
  const response = await fetchJson<JsonRpcResponse<{ sequence: number }>>(
    () =>
      fetchWithTimeout(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'getLatestLedger',
          params: {},
        }),
    'checking contract via RPC',
    'Contract check',
  );
  if (!response.ok) {
    return { state: 'down', latencyMs: response.latencyMs, detail: response.detail };
  }
    const res = await fetchWithTimeout(
      rpcUrl,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'getLatestLedger',
          params: {},
        }),
      },
      FETCH_TIMEOUT_MS,
      signal,
    );

    let data: JsonRpcResponse<GetLedgerEntriesResult>;
    const entries = Array.isArray(data.result.entries) ? data.result.entries : [];
    const instance = entries.find((entry) => typeof entry.xdr === 'string');

    if (!instance?.xdr) {
      return { state: 'down', latencyMs, detail: `Contract ${shortId}… not found on-chain` };
    }

    let paused: boolean;
    try {
      paused = await isContractPaused(instance.xdr);
    } catch {
      return { state: 'down', latencyMs, detail: 'Malformed contract instance response' };
    }

    if (paused) return { state: 'degraded', latencyMs, detail: 'paused' };

    const ledger = data.result.latestLedger ? ` at ledger #${data.result.latestLedger}` : '';
    return {
      state: classify(latencyMs),
      latencyMs,
      detail: `Contract ${shortId}… verified${ledger}`,
    };
  const { data, latencyMs } = response;
  if (data.error) {
    return {
      state: 'down',
      latencyMs,
      detail: `RPC error ${data.error.code}: ${data.error.message}`,
    };
  }

  if (!data.result) {
    return { state: 'down', latencyMs, detail: 'Unexpected response checking contract' };
  }

  const shortId = site.contractId.slice(0, 8);
  const detail = `Contract ${shortId}… reachable at ledger #${data.result.sequence}`;
  return { state: classify(latencyMs), latencyMs, detail };
}

// ──────────────────────────────────────────────────────────────────────────────
// Overall aggregation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Derive the overall system state from individual check results.
 * - Any 'down' → 'down'
 * - Any 'degraded' → 'degraded'
 * - All 'operational' → 'operational'
 */
export function aggregateState(results: StatusResult[]): CheckState {
  if (results.some((r) => r.state === 'down')) return 'down';
  if (results.some((r) => r.state === 'degraded')) return 'degraded';
  return 'operational';
}
