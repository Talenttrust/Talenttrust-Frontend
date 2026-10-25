import { describe, expect, it, vi } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
import {
  decodeEvent,
  describeEvent,
  EVENT_LOOKBACK_LEDGERS,
  fetchRecentEvents,
  formatXlm,
  type FetchRecentEventsOptions,
} from '@/lib/stellar/events';
import { FIXTURE_CLIENT, FIXTURE_FREELANCER, rawEvent } from '@/test/eventFixtures';

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
