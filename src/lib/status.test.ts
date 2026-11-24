import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Address, scValToNative, xdr } from '@stellar/stellar-sdk';
import {
  checkApi,
  checkChainConfig,
  checkRpc,
  checkContract,
  aggregateState,
  DEGRADED_THRESHOLD_MS,
  fetchWithTimeout,
} from './status';
import { site } from './site';

const CONTRACT_ID = site.contractId;
const OTHER_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

// ─────────────────────────────────────────────────────────────────────────────
// Mock fetch globally
// ─────────────────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock site so tests are deterministic regardless of env vars
vi.mock('./site', () => ({
  site: {
    apiUrl: 'https://api.example.com',
    contractId: 'CCZMIVUBMG5SBC47SDTC32RWLBJ2HW2DCFVWJEOKCH2IFJBZGBKTXK5W',
    network: 'testnet',
    name: 'TalentTrust',
    tagline: '',
    github: '',
  },
}));

function makeResponse(
  body: unknown,
  status = 200,
  ok = true,
): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function makeErrorResponse(status: number): Response {
  return makeResponse({ error: 'fail' }, status, false);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchWithTimeout
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchWithTimeout', () => {
  it('resolves with the response when fetch succeeds', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ ok: true }));
    const res = await fetchWithTimeout('https://example.com');
    expect(res.ok).toBe(true);
  });

  it('aborts after the specified timeout', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          // Simulate the signal aborting
          (init.signal as AbortSignal).addEventListener('abort', () =>
            rej(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    );

    const promise = fetchWithTimeout('https://example.com', {}, 100);
    vi.advanceTimersByTime(200);
    await expect(promise).rejects.toThrow();
    vi.useRealTimers();
  });
});

describe('shared fetch handling', () => {
  it('preserves timeout labels and network error details for each checker', async () => {
    const checks = [
      { run: () => checkApi(), timeoutDetail: 'Request timed out after 5s' },
      { run: () => checkChainConfig(), timeoutDetail: 'Request timed out after 5s' },
      { run: () => checkRpc('https://rpc.example.com'), timeoutDetail: 'RPC request timed out after 5s' },
      { run: () => checkContract('https://rpc.example.com'), timeoutDetail: 'Contract check timed out after 5s' },
    ];

    for (const { run, timeoutDetail } of checks) {
      mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
      expect((await run()).detail).toBe(timeoutDetail);

      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      expect((await run()).detail).toBe('Network error: Failed to fetch');
    }
  });

  it('returns the endpoint-specific detail when JSON parsing fails', async () => {
    const badResponse = {
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('bad json');
      },
    } as unknown as Response;
    mockFetch.mockResolvedValueOnce(badResponse);

    const result = await checkApi();

    expect(result.detail).toBe('Malformed JSON from /health');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkApi
// ─────────────────────────────────────────────────────────────────────────────

describe('checkApi', () => {
  it('returns operational on successful /health response', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ uptime: 100, version: '1.0.0', storage: 'ok' }),
    );
    const result = await checkApi();
    expect(result.state).toBe('operational');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.detail).toMatch(/API/);
  });

  it('returns degraded when latency exceeds threshold', async () => {
    // Simulate slow response by delaying Date.now
    let callCount = 0;
    const origDateNow = Date.now;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      // First call returns 0, second call returns threshold + 1
      return callCount === 1 ? 0 : DEGRADED_THRESHOLD_MS + 100;
    });
    mockFetch.mockResolvedValueOnce(makeResponse({ uptime: 100 }));

    const result = await checkApi();
    expect(result.state).toBe('degraded');
    Date.now = origDateNow;
  });

  it('returns down on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(503));
    const result = await checkApi();
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/503/);
  });

  it('returns down on malformed JSON', async () => {
    const badRes = {
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    } as unknown as Response;
    mockFetch.mockResolvedValueOnce(badRes);
    const result = await checkApi();
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Malformed JSON/);
  });

  it('returns down on network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const result = await checkApi();
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Network error/);
  });

  it('returns down with timeout message on AbortError', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortError);
    const result = await checkApi();
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/timed out/i);
  });

  it('includes version in detail when present', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ version: '2.3.1', uptime: 500 }));
    const result = await checkApi();
    expect(result.detail).toMatch(/v2\.3\.1/);
  });

  it('handles health response with no version gracefully', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ uptime: 50 }));
    const result = await checkApi();
    expect(result.state).toBe('operational');
    expect(result.detail).not.toMatch(/vundefined/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkChainConfig
// ─────────────────────────────────────────────────────────────────────────────

describe('checkChainConfig', () => {
  it('returns operational when config matches frontend', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        network: 'testnet',
        contractId: CONTRACT_ID,
        rpcUrl: 'https://rpc.example.com',
      }),
    );
    const result = await checkChainConfig();
    expect(result.state).toBe('operational');
    expect(result.detail).toMatch(/testnet/);
    expect(result.rpcUrl).toBe('https://rpc.example.com');
    expect(result.mismatch).toBeUndefined();
  });

  it('returns degraded with mismatch when contractId differs', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        network: 'testnet',
        contractId: OTHER_CONTRACT_ID,
        rpcUrl: 'https://rpc.example.com',
      }),
    );
    const result = await checkChainConfig();
    expect(result.state).toBe('degraded');
    expect(result.mismatch).toMatch(/Contract ID mismatch/);
    expect(result.detail).toMatch(new RegExp(CONTRACT_ID));
  });

  it('returns degraded with mismatch when network differs', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        network: 'mainnet',
        contractId: CONTRACT_ID,
        rpcUrl: 'https://rpc.example.com',
      }),
    );
    const result = await checkChainConfig();
    expect(result.state).toBe('degraded');
    expect(result.mismatch).toMatch(/Network mismatch/);
  });

  it('reports both mismatches when both contractId and network differ', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        network: 'mainnet',
        contractId: OTHER_CONTRACT_ID,
        rpcUrl: 'https://rpc.example.com',
      }),
    );
    const result = await checkChainConfig();
    expect(result.state).toBe('degraded');
    expect(result.mismatch).toMatch(/Contract ID mismatch/);
    expect(result.mismatch).toMatch(/Network mismatch/);
  });

  it('returns down on non-2xx from /api/v1/chain', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(404));
    const result = await checkChainConfig();
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/404/);
  });

  it('returns down on malformed JSON', async () => {
    const badRes = {
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('bad json'); },
    } as unknown as Response;
    mockFetch.mockResolvedValueOnce(badRes);
    const result = await checkChainConfig();
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Malformed JSON/);
  });

  it('returns down on network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const result = await checkChainConfig();
    expect(result.state).toBe('down');
  });

  it('returns down with timeout message on AbortError', async () => {
    mockFetch.mockRejectedValueOnce(
      new DOMException('Aborted', 'AbortError'),
    );
    const result = await checkChainConfig();
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/timed out/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkRpc
// ─────────────────────────────────────────────────────────────────────────────

describe('checkRpc', () => {
  const RPC_URL = 'https://soroban-testnet.stellar.org';

  it('returns operational on valid getLatestLedger response', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({
        jsonrpc: '2.0',
        id: 1,
        result: { sequence: 12345, protocolVersion: 21 },
      }),
    );
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('operational');
    expect(result.detail).toMatch(/Ledger #12345/);
    expect(result.detail).toMatch(/protocol v21/);
  });

  it('returns down when rpcUrl is empty string', async () => {
    const result = await checkRpc('');
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/not configured/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns down on non-2xx HTTP response', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(502));
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/502/);
  });

  it('returns down on malformed JSON', async () => {
    const badRes = {
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('bad'); },
    } as unknown as Response;
    mockFetch.mockResolvedValueOnce(badRes);
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Malformed JSON/);
  });

  it('returns down on JSON-RPC error field', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Method not found' } }),
    );
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/-32601/);
  });

  it('returns down when result field is missing', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ jsonrpc: '2.0', id: 1 }),
    );
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Unexpected RPC/);
  });

  it('returns down on network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Network error/);
  });

  it('returns down with timeout message on AbortError', async () => {
    mockFetch.mockRejectedValueOnce(
      new DOMException('Aborted', 'AbortError'),
    );
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/timed out/i);
  });

  it('returns degraded when latency exceeds threshold', async () => {
    let callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      return callCount === 1 ? 0 : DEGRADED_THRESHOLD_MS + 500;
    });
    mockFetch.mockResolvedValueOnce(
      makeResponse({ jsonrpc: '2.0', id: 1, result: { sequence: 999, protocolVersion: 21 } }),
    );
    const result = await checkRpc(RPC_URL);
    expect(result.state).toBe('degraded');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkContract
// ─────────────────────────────────────────────────────────────────────────────

const INSTANCE_XDR =
  'AAAABgAAAAAAAAABssRWgWG7IIufkOYt6jZYU6PbQxFrZJHKEfSCpDkwVTsAAAAUAAAAAQAAABMAAAAAbGDr2DatCP6h+Qa00JuCIYPARH8HnqHtSeY/wlmdrMgAAAABAAAAAwAAABAAAAABAAAAAQAAAA8AAAAFQWRtaW4AAAAAAAASAAAAAAAAAAA/O5AsI+AlnRgVht/FQHdQyI9Ur9355uwlvVzRhLtjywAAABAAAAABAAAAAQAAAA8AAAAGTmV4dElkAAAAAAAFAAAAAAAAAAEAAAAQAAAAAQAAAAEAAAAPAAAABlBhdXNlZAAAAAAAAAAAAAA=';

function contractInstanceXdr(paused: boolean): string {
  const entry = xdr.LedgerEntryData.fromXdr(INSTANCE_XDR, 'base64');
  if (entry.type !== 'contractData') throw new Error('fixture is not a contract data entry');
  const value = entry.contractData.val;
  if (value.type !== 'scvContractInstance') throw new Error('fixture is not a contract instance');
  const instance = value.instance;
  const storage = instance.storage ?? [];
  const pausedIndex = storage.findIndex((item) => {
    const key = scValToNative(item.key);
    return Array.isArray(key) && key[0] === 'Paused';
  });
  if (pausedIndex < 0) throw new Error('fixture is missing the Paused entry');
  storage[pausedIndex] = new xdr.ScMapEntry({
    key: storage[pausedIndex].key,
    val: xdr.ScVal.scvBool(paused),
  });
  return entry.toXDR('base64');
}

function expectedLedgerKey(contractId = CONTRACT_ID): string {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(contractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent,
    }),
  ).toXDR('base64');
}

function ledgerEntriesResponse(entryXdr?: string, latestLedger = 55000) {
  return makeResponse({
    jsonrpc: '2.0',
    id: 2,
    result: {
      entries: entryXdr ? [{ key: 'ignored', xdr: entryXdr, lastModifiedLedgerSeq: 123 }] : [],
      latestLedger,
    },
  });
}

describe('checkContract', () => {
  const RPC_URL = 'https://soroban-testnet.stellar.org';

  it('queries the contract instance ledger key and reports operational', async () => {
    mockFetch.mockResolvedValueOnce(ledgerEntriesResponse(contractInstanceXdr(false), 55000));

    const result = await checkContract(RPC_URL);

    expect(result.state).toBe('operational');
    expect(result.detail).toMatch(/CCZMIVUB/);
    expect(result.detail).toMatch(/55000/);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(RPC_URL);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ jsonrpc: '2.0', method: 'getLedgerEntries' });
    expect(body.params.keys).toEqual([expectedLedgerKey()]);
  });

  it('returns down when the contract instance is missing', async () => {
    mockFetch.mockResolvedValueOnce(ledgerEntriesResponse(undefined, 55000));

    const result = await checkContract(RPC_URL);

    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/not found on-chain/i);
  });

  it('returns degraded with the exact paused detail for a paused contract', async () => {
    mockFetch.mockResolvedValueOnce(ledgerEntriesResponse(contractInstanceXdr(true), 55000));

    const result = await checkContract(RPC_URL);

    expect(result.state).toBe('degraded');
    expect(result.detail).toBe('paused');
  });

  it('returns down for an invalid contract ID', async () => {
    const original = site.contractId;
    site.contractId = 'NOT_A_CONTRACT';
    try {
      const result = await checkContract(RPC_URL);
      expect(result.state).toBe('down');
      expect(result.detail).toMatch(/not a valid Stellar contract address/i);
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      site.contractId = original;
    }
  });

  it('returns down when rpcUrl is empty', async () => {
    const result = await checkContract('');
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/RPC URL required/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns down on non-2xx HTTP', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));
    const result = await checkContract(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/500/);
  });

  it('returns down on malformed JSON', async () => {
    const badRes = {
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('bad'); },
    } as unknown as Response;
    mockFetch.mockResolvedValueOnce(badRes);
    const result = await checkContract(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Malformed JSON/);
  });

  it('returns down on JSON-RPC error', async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse({ jsonrpc: '2.0', id: 2, error: { code: -32700, message: 'Parse error' } }),
    );
    const result = await checkContract(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/-32700/);
  });

  it('returns down on a malformed contract instance entry', async () => {
    mockFetch.mockResolvedValueOnce(ledgerEntriesResponse('not-valid-xdr', 55000));
    const result = await checkContract(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Malformed contract instance response/);
  });

  it('returns down on network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const result = await checkContract(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/Network error/);
  });

  it('returns down with timeout message on AbortError', async () => {
    mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    const result = await checkContract(RPC_URL);
    expect(result.state).toBe('down');
    expect(result.detail).toMatch(/timed out/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// aggregateState
// ─────────────────────────────────────────────────────────────────────────────

describe('aggregateState', () => {
  it('returns operational when all results are operational', () => {
    const results = [
      { state: 'operational' as const, latencyMs: 100, detail: '' },
      { state: 'operational' as const, latencyMs: 200, detail: '' },
    ];
    expect(aggregateState(results)).toBe('operational');
  });

  it('returns degraded when any result is degraded (none down)', () => {
    const results = [
      { state: 'operational' as const, latencyMs: 100, detail: '' },
      { state: 'degraded' as const, latencyMs: 2500, detail: '' },
    ];
    expect(aggregateState(results)).toBe('degraded');
  });

  it('returns down when any result is down', () => {
    const results = [
      { state: 'operational' as const, latencyMs: 100, detail: '' },
      { state: 'degraded' as const, latencyMs: 2500, detail: '' },
      { state: 'down' as const, latencyMs: 5001, detail: '' },
    ];
    expect(aggregateState(results)).toBe('down');
  });

  it('returns down even if other results are operational', () => {
    const results = [
      { state: 'operational' as const, latencyMs: 100, detail: '' },
      { state: 'down' as const, latencyMs: 5001, detail: '' },
    ];
    expect(aggregateState(results)).toBe('down');
  });

  it('returns operational for empty array', () => {
    expect(aggregateState([])).toBe('operational');
  });
});
