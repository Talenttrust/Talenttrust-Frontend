import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError, parseRetryAfter, unwrapContract } from '@/lib/api';

describe('parseRetryAfter', () => {
  it('returns null for missing or invalid values', () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter(undefined)).toBeNull();
    expect(parseRetryAfter('')).toBeNull();
    expect(parseRetryAfter('   ')).toBeNull();
    expect(parseRetryAfter('invalid-value')).toBeNull();
    expect(parseRetryAfter('-5')).toBeNull();
  });

  it('parses delta-seconds into milliseconds', () => {
    expect(parseRetryAfter('0')).toBe(0);
    expect(parseRetryAfter('2')).toBe(2000);
    expect(parseRetryAfter(' 120 ')).toBe(120000);
  });

  it('parses HTTP date values relative to now and clamps past dates to 0', () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    const future = new Date(now + 3000).toUTCString();
    const past = new Date(now - 5000).toUTCString();

    expect(parseRetryAfter(future, now)).toBe(3000);
    expect(parseRetryAfter(past, now)).toBe(0);
  });
});

describe('api client hardening', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const jsonResponse = (body: unknown, status = 200, extraHeaders?: Record<string, string>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...extraHeaders },
    });

  it('returns parsed data on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ ok: true })));
    await expect(api('/x')).resolves.toEqual({ ok: true });
  });

  it('maps a hung request to kind: timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
      ),
    );
    const p = api('/x', { timeoutMs: 1000, retries: 0 });
    const assertion = expect(p).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(1100);
    await assertion;
  });

  it('maps an offline rejection to kind: network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const p = api('/x');
    const assertion = expect(p).rejects.toMatchObject({ kind: 'network' });
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
  });

  it('keeps backend code on an http error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'over_funded', message: 'nope' }, 409)));
    await expect(api('/x', { method: 'POST' })).rejects.toMatchObject({
      kind: 'http',
      status: 409,
      code: 'over_funded',
    });
  });

  it('uses friendly copy for known backend codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid_status', message: 'nope' }, 409)));
    await expect(api('/x', { method: 'POST' })).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiError && /not allowed/i.test(e.userMessage),
    );
  });

  it('retries a 503 GET twice then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse({ error: 'unavailable' }, 503))
      .mockResolvedValueOnce(jsonResponse({ data: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    const p = api('/x');
    await vi.advanceTimersByTimeAsync(3000);
    await expect(p).resolves.toEqual({ data: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a POST 503', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'unavailable' }, 503));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/x', { method: 'POST' })).rejects.toMatchObject({ kind: 'http', status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 429 GET honoring Retry-After seconds header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate_limited' }, 429, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(jsonResponse({ data: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    const p = api('/x');
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toEqual({ data: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caps Retry-After delay at 5000ms', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate_limited' }, 429, { 'Retry-After': '60' }))
      .mockResolvedValueOnce(jsonResponse({ data: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    const p = api('/x');
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toEqual({ data: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a 429 GET honoring Retry-After HTTP date header', async () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    vi.setSystemTime(now);
    const retryAt = new Date(now + 3000).toUTCString();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'rate_limited' }, 429, { 'Retry-After': retryAt }))
      .mockResolvedValueOnce(jsonResponse({ data: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    const p = api('/x');
    await vi.advanceTimersByTimeAsync(2999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toEqual({ data: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a POST 429 even with Retry-After', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'rate_limited' }, 429, { 'Retry-After': '1' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api('/x', { method: 'POST' })).rejects.toMatchObject({ kind: 'http', status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts with kind: aborted and never resolves data', async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const p = api('/x', { signal: controller.signal });
    const assertion = expect(p).rejects.toMatchObject({ kind: 'aborted' });
    controller.abort();
    await assertion;
  });

  it('never surfaces a raw fetch error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const p = api('/x');
    const assertion = p.catch((e) => {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).userMessage).not.toContain('Failed to fetch');
    });
    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
  });
});

describe('unwrapContract', () => {
  it('returns null for null, undefined, and non-object primitives', () => {
    expect(unwrapContract(null)).toBeNull();
    expect(unwrapContract(undefined)).toBeNull();
    expect(unwrapContract('')).toBeNull();
    expect(unwrapContract(123)).toBeNull();
    expect(unwrapContract(true)).toBeNull();
  });

  it('returns null for empty or unrelated objects', () => {
    expect(unwrapContract({})).toBeNull();
    expect(unwrapContract({ foo: 'bar' })).toBeNull();
    expect(unwrapContract([])).toBeNull();
  });

  it('rejects payloads with an id but without a status property', () => {
    expect(unwrapContract({ id: 1 })).toBeNull();
    expect(unwrapContract({ id: 42, title: 'No status' })).toBeNull();
  });

  it('unwraps top-level contract object when id and status are present', () => {
    const payload = {
      id: 1,
      status: 'Created' as const,
      title: 'Audit escrow',
    };
    expect(unwrapContract(payload)).toEqual(payload);
  });

  it('unwraps nested contract from { data: ... }', () => {
    const contract = {
      id: 2,
      status: 'Funded' as const,
      title: 'Dev milestone',
    };
    expect(unwrapContract({ data: contract })).toEqual(contract);
  });

  it('returns null when nested data is null, primitive, or lacks a valid id', () => {
    expect(unwrapContract({ data: null })).toBeNull();
    expect(unwrapContract({ data: 'not-an-object' })).toBeNull();
    expect(unwrapContract({ data: {} })).toBeNull();
    expect(unwrapContract({ data: { title: 'Missing id' } })).toBeNull();
    expect(unwrapContract({ data: { id: 'invalid-id' } })).toBeNull();
  });
});

