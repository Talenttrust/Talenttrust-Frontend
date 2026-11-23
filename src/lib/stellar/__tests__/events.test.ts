import { describe, expect, it, vi } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
import {
  buildEscrowEventFilter,
  compareEventsAsc,
  decodeEvent,
  describeEvent,
  encodeEscrowTopic,
  EVENT_LOOKBACK_LEDGERS,
  fetchEscrowEvents,
  fetchEventsSince,
  fetchRecentEvents,
  formatXlm,
  isCursorError,
  type FetchRecentEventsOptions,
} from '@/lib/stellar/events';
import { EVENT_XDR, FIXTURE_CLIENT, FIXTURE_FREELANCER, rawEvent } from '@/test/eventFixtures';

describe('decodeEvent', () => {
  it.each([
    ['created', { type: 'created', escrowId: BigInt(4), client: FIXTURE_CLIENT, freelancer: FIXTURE_FREELANCER, total: BigInt(3_000_000_000) }, 'Escrow #4 created for 300 XLM between GDKI…WNMX and GBRP…OX2H'],
    ['deposit', { type: 'deposit', escrowId: BigInt(4), amount: BigInt(1_500_000_000) }, 'Escrow #4 funded with 150 XLM'],
    ['release', { type: 'release', escrowId: BigInt(4), index: 0, amount: BigInt(1_000_000_000) }, 'Escrow #4 released milestone 1 (100 XLM)'],
    ['dispute', { type: 'dispute', escrowId: BigInt(4), caller: FIXTURE_CLIENT }, 'Escrow #4 disputed by GDKI…WNMX'],
    ['resolved', { type: 'resolved', escrowId: BigInt(4), toFreelancer: BigInt(250_000_000), toClient: BigInt(5_000_000) }, 'Escrow #4 resolved: 25 XLM to freelancer, 0.5 XLM to client'],
    ['cancel', { type: 'cancel', escrowId: BigInt(5), refund: BigInt(1_234_567) }, 'Escrow #5 cancelled, 0.1234567 XLM refunded'],
    ['rep', { type: 'rep', escrowId: BigInt(4), freelancer: FIXTURE_FREELANCER, rating: 5 }, 'Freelancer GBRP…OX2H rated 5/5 on escrow #4'],
  ] as const)('decodes a recorded %s event', (kind, expected, sentence) => {
    const event = decodeEvent(rawEvent(kind));
    expect(event).toMatchObject(expected);
    expect(describeEvent(event)).toBe(sentence);
  });

  it('passes unknown topics through', () => {
    const event = decodeEvent(rawEvent('unknown'));
    expect(event).toMatchObject({ type: 'unknown', topic: 'paused', topics: ['paused'], value: true });
    expect(describeEvent(event)).toBe('Contract emitted "paused"');
  });

  it('falls back to unknown when a known topic carries an invalid payload', () => {
    const event = decodeEvent(rawEvent('deposit', { value: xdr.ScVal.scvVec([]) }));
    expect(event.type).toBe('unknown');
  });

  it('handles events without topics', () => {
    expect(decodeEvent(rawEvent('deposit', { topic: [] }))).toMatchObject({ type: 'unknown', topic: 'event' });
  });

  it('builds a dedupe key from the id and paging token', () => {
    expect(decodeEvent(rawEvent('deposit', { id: 'a', pagingToken: 'p' })).key).toBe('a:p');
    expect(decodeEvent(rawEvent('deposit', { id: 'a' })).key).toBe('a:a');
  });
});

describe('formatXlm', () => {
  it.each([
    [BigInt(0), '0 XLM'],
    [BigInt(1), '0.0000001 XLM'],
    [BigInt(1_500_000_000), '150 XLM'],
    [BigInt(12_345_678_900_000), '1,234,567.89 XLM'],
    [BigInt(-5_000_000), '-0.5 XLM'],
  ])('formats %s stroops', (stroops, expected) => {
    expect(formatXlm(stroops)).toBe(expected);
  });
});

function fakeServer(pages: Array<{ events: unknown[]; cursor?: string }>, latest = 6_000_000) {
  const getEvents = vi.fn();
  pages.forEach((page) => getEvents.mockResolvedValueOnce(page));
  const server = { getLatestLedger: vi.fn().mockResolvedValue({ sequence: latest }), getEvents };
  return server as typeof server & NonNullable<FetchRecentEventsOptions['server']>;
}

describe('fetchRecentEvents', () => {
  it('queries the last ~24h for the escrow contract and returns newest first', async () => {
    const server = fakeServer([
      { events: [rawEvent('created', { ledger: 10 }), rawEvent('deposit', { ledger: 20 })], cursor: 'c1' },
    ]);

    const events = await fetchRecentEvents({ server, contractId: 'CTEST' });

    expect(server.getEvents).toHaveBeenCalledWith({
      startLedger: 6_000_000 - EVENT_LOOKBACK_LEDGERS,
      filters: [{ type: 'contract', contractIds: ['CTEST'] }],
      limit: 100,
    });
    expect(events.map((e) => e.type)).toEqual(['deposit', 'created']);
  });

  it('pages through the window and keeps only the latest events', async () => {
    const first = Array.from({ length: 100 }, (_, i) => rawEvent('deposit', { ledger: 100 + i }));
    const second = [rawEvent('release', { ledger: 500 }), rawEvent('rep', { ledger: 501 })];
    const server = fakeServer([
      { events: first, cursor: 'c1' },
      { events: second, cursor: 'c2' },
    ]);

    const events = await fetchRecentEvents({ server, limit: 3 });

    expect(server.getEvents).toHaveBeenLastCalledWith({ cursor: 'c1', filters: expect.any(Array), limit: 100 });
    expect(events.map((e) => e.ledger)).toEqual([501, 500, 199]);
  });

  it('clamps the start ledger on young networks', async () => {
    const server = fakeServer([{ events: [] }], 100);
    await fetchRecentEvents({ server });
    expect(server.getEvents.mock.calls[0][0]).toMatchObject({ startLedger: 1 });
  });

  it('returns an empty list when there is no activity', async () => {
    await expect(fetchRecentEvents({ server: fakeServer([{ events: [] }]) })).resolves.toEqual([]);
  });

  it.each([0, -1, 1.5, 101, Number.NaN])('rejects an invalid limit (%s)', async (limit) => {
    const server = fakeServer([]);
    await expect(fetchRecentEvents({ server, limit })).rejects.toBeInstanceOf(RangeError);
    expect(server.getLatestLedger).not.toHaveBeenCalled();
  });

  it('propagates network errors', async () => {
    const server = fakeServer([]);
    server.getLatestLedger.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchRecentEvents({ server })).rejects.toThrow('Failed to fetch');
  });

  it('propagates non-2xx RPC responses', async () => {
    const server = fakeServer([]);
    server.getEvents.mockRejectedValue(Object.assign(new Error('Request failed with status code 503'), { response: { status: 503 } }));
    await expect(fetchRecentEvents({ server })).rejects.toMatchObject({ response: { status: 503 } });
  });

  it('rejects malformed responses', async () => {
    const server = fakeServer([{ events: undefined as unknown as unknown[] }]);
    await expect(fetchRecentEvents({ server })).rejects.toThrow('Malformed getEvents response');
  });
});

describe('fetchEventsSince', () => {
  it('backfills on the first tick and makes a single cursor getEvents call on the second tick', async () => {
    const server = fakeServer([
      { events: [rawEvent('created', { ledger: 10 }), rawEvent('deposit', { ledger: 20 })], cursor: 'c1' },
      { events: [rawEvent('release', { ledger: 30 })], cursor: 'c2' },
    ]);

    const first = await fetchEventsSince({ server, contractId: 'CTEST' });
    expect(first.cursor).toBe('c1');
    expect(first.events.map((e) => e.type)).toEqual(['deposit', 'created']);
    expect(server.getLatestLedger).toHaveBeenCalledTimes(1);
    expect(server.getEvents).toHaveBeenCalledTimes(1);

    const second = await fetchEventsSince({ server, contractId: 'CTEST', cursor: first.cursor });
    expect(second.cursor).toBe('c2');
    expect(second.events.map((e) => e.type)).toEqual(['release']);
    expect(server.getLatestLedger).toHaveBeenCalledTimes(1);
    expect(server.getEvents).toHaveBeenCalledTimes(2);
    expect(server.getEvents).toHaveBeenLastCalledWith({
      cursor: 'c1',
      filters: [{ type: 'contract', contractIds: ['CTEST'] }],
      limit: 100,
    });
  });

  it('uses an explicit startLedger without calling getLatestLedger', async () => {
    const server = fakeServer([{ events: [rawEvent('deposit', { ledger: 55 })], cursor: 'c55' }]);

    const result = await fetchEventsSince({ server, contractId: 'CTEST', startLedger: 50 });

    expect(server.getLatestLedger).not.toHaveBeenCalled();
    expect(server.getEvents).toHaveBeenCalledWith({
      startLedger: 50,
      filters: [{ type: 'contract', contractIds: ['CTEST'] }],
      limit: 100,
    });
    expect(result.cursor).toBe('c55');
    expect(result.events).toHaveLength(1);
  });

  it('preserves the previous cursor when an incremental poll returns no cursor', async () => {
    const server = fakeServer([{ events: [] }]);

    const result = await fetchEventsSince({ server, cursor: 'c1' });

    expect(server.getLatestLedger).not.toHaveBeenCalled();
    expect(server.getEvents).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ events: [], cursor: 'c1' });
  });

  it('pages forward from a cursor and retains only the newest limit events', async () => {
    const first = Array.from({ length: 100 }, (_, i) => rawEvent('deposit', { ledger: 200 + i }));
    const second = [rawEvent('release', { ledger: 400 }), rawEvent('rep', { ledger: 401 })];
    const server = fakeServer([
      { events: first, cursor: 'c2' },
      { events: second, cursor: 'c3' },
    ]);

    const result = await fetchEventsSince({ server, cursor: 'c1', limit: 2 });

    expect(server.getLatestLedger).not.toHaveBeenCalled();
    expect(server.getEvents).toHaveBeenCalledTimes(2);
    expect(result.cursor).toBe('c3');
    expect(result.events.map((e) => e.ledger)).toEqual([401, 400]);
  });
});

describe('isCursorError', () => {
  it('identifies expired or invalid cursor errors', () => {
    expect(isCursorError(Object.assign(new Error('Invalid params'), { code: -32602 }))).toBe(true);
    expect(isCursorError(Object.assign(new Error('Invalid request'), { code: -32600 }))).toBe(true);
    expect(isCursorError(Object.assign(new Error('Bad Request'), { response: { status: 400 } }))).toBe(true);
    expect(isCursorError(new Error('cursor is too old'))).toBe(true);
  });

  it('ignores non-cursor errors', () => {
    expect(isCursorError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isCursorError(Object.assign(new Error('Service Unavailable'), { response: { status: 503 } }))).toBe(false);
    expect(isCursorError(null)).toBe(false);
    expect(isCursorError('cursor')).toBe(false);
  });
});

describe('fetchEscrowEvents', () => {
  const escrowTopic = (id: number) => [
    xdr.ScVal.fromXDR(EVENT_XDR.deposit.topic[0], 'base64'),
    xdr.ScVal.scvU64(BigInt(id)),
  ];

  it('encodes the escrow id as a u64 ScVal', () => {
    expect(encodeEscrowTopic(4)).toBe('AAAABQAAAAAAAAAE');
    expect(encodeEscrowTopic(4n)).toBe('AAAABQAAAAAAAAAE');
    expect(encodeEscrowTopic('4')).toBe('AAAABQAAAAAAAAAE');
  });

  it('builds a [symbol, escrow id] topic filter', () => {
    expect(buildEscrowEventFilter(4, 'CTEST')).toEqual({
      type: 'contract',
      contractIds: ['CTEST'],
      topics: [['*'], ['AAAABQAAAAAAAAAE']],
    });
  });

  it('queries only the requested escrow within the lookback window', async () => {
    const server = fakeServer([{ events: [rawEvent('deposit', { ledger: 100 })], cursor: 'c1' }], 6_000_000);

    const events = await fetchEscrowEvents(4, { server, contractId: 'CTEST' });

    expect(server.getEvents).toHaveBeenCalledWith({
      startLedger: 6_000_000 - EVENT_LOOKBACK_LEDGERS,
      filters: [
        {
          type: 'contract',
          contractIds: ['CTEST'],
          topics: [['*'], ['AAAABQAAAAAAAAAE']],
        },
      ],
      limit: 100,
    });
    expect(events.map((event) => event.type)).toEqual(['deposit']);
  });

  it('clamps the start ledger on young networks', async () => {
    const server = fakeServer([{ events: [] }], 100);
    await fetchEscrowEvents(4, { server });
    expect(server.getEvents.mock.calls[0][0]).toMatchObject({ startLedger: 1 });
  });

  it('follows cursor pagination and returns events oldest first', async () => {
    const first = Array.from({ length: 100 }, (_, i) => rawEvent('deposit', { ledger: 100 + i, id: `a-${i}` }));
    const second = [rawEvent('release', { ledger: 400 }), rawEvent('rep', { ledger: 401 })];
    const server = fakeServer(
      [
        { events: first, cursor: 'c1' },
        { events: second, cursor: 'c2' },
      ],
      6_000_000,
    );

    const events = await fetchEscrowEvents(4, { server, contractId: 'CTEST' });

    expect(server.getEvents).toHaveBeenCalledTimes(2);
    expect(server.getEvents).toHaveBeenLastCalledWith({
      cursor: 'c1',
      filters: expect.any(Array),
      limit: 100,
    });
    expect(events[0].ledger).toBe(100);
    expect(events[events.length - 1].ledger).toBe(401);
    expect(events.map((event) => event.ledger)).toEqual(
      [...events.map((event) => event.ledger)].sort((a, b) => a - b),
    );
  });

  it('de-duplicates events that appear on more than one page', async () => {
    const repeated = rawEvent('deposit', { ledger: 200, id: 'same' });
    const first = [
      ...Array.from({ length: 99 }, (_, i) => rawEvent('deposit', { ledger: 100 + i, id: `a-${i}` })),
      repeated,
    ];
    const second = [repeated, rawEvent('release', { ledger: 300 })];
    const server = fakeServer(
      [
        { events: first, cursor: 'c1' },
        { events: second, cursor: 'c2' },
      ],
      6_000_000,
    );

    const events = await fetchEscrowEvents(4, { server, contractId: 'CTEST' });

    expect(events.filter((event) => event.id === 'same')).toHaveLength(1);
  });

  it('drops events that belong to a different escrow', async () => {
    const server = fakeServer([
      {
        events: [
          rawEvent('deposit', { ledger: 10 }),
          rawEvent('deposit', { ledger: 11, topic: escrowTopic(5) }),
        ],
      },
    ]);

    const events = await fetchEscrowEvents(4, { server, contractId: 'CTEST' });

    expect(events.map((event) => ('escrowId' in event ? event.escrowId : null))).toEqual([BigInt(4)]);
  });

  it('propagates RPC failures', async () => {
    const server = fakeServer([]);
    server.getEvents.mockRejectedValue(new Error('RPC down'));

    await expect(fetchEscrowEvents(4, { server })).rejects.toThrow('RPC down');
  });

  it('rejects malformed responses', async () => {
    const server = fakeServer([{ events: undefined as unknown as unknown[] }]);
    await expect(fetchEscrowEvents(4, { server })).rejects.toThrow('Malformed getEvents response');
  });

  it('rejects invalid escrow ids and lookback values', async () => {
    const server = fakeServer([]);

    await expect(fetchEscrowEvents(-1, { server })).rejects.toBeInstanceOf(RangeError);
    await expect(fetchEscrowEvents('abc', { server })).rejects.toBeInstanceOf(TypeError);
    await expect(fetchEscrowEvents(4, { server, lookbackLedgers: -1 })).rejects.toBeInstanceOf(RangeError);
    expect(server.getEvents).not.toHaveBeenCalled();
  });
});

describe('compareEventsAsc', () => {
  it('orders by ledger then event id', () => {
    const older = decodeEvent(rawEvent('deposit', { ledger: 10, id: 'a' }));
    const later = decodeEvent(rawEvent('deposit', { ledger: 20, id: 'b' }));
    expect([later, older].sort(compareEventsAsc).map((event) => event.ledger)).toEqual([10, 20]);
  });
});
