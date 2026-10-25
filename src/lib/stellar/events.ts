import { scValToNative, type rpc, type xdr } from '@stellar/stellar-sdk';
import { site } from '../site';
import { getRpcServer } from './rpc';

/** ~24h of ledgers at a 5s close time. */
export const EVENT_LOOKBACK_LEDGERS = 17_280;
export const DEFAULT_EVENT_LIMIT = 10;
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const STROOPS_PER_XLM = BigInt(10_000_000);

interface EventMeta {
  /** Stable dedupe key: event id + paging token. */
  key: string;
  id: string;
  pagingToken: string;
  ledger: number;
  closedAt: string;
  txHash: string;
}

export type ActivityEvent = EventMeta &
  (
    | { type: 'created'; escrowId: bigint; client: string; freelancer: string; total: bigint }
    | { type: 'deposit'; escrowId: bigint; amount: bigint }
    | { type: 'release'; escrowId: bigint; index: number; amount: bigint }
    | { type: 'dispute'; escrowId: bigint; caller: string }
    | { type: 'resolved'; escrowId: bigint; toFreelancer: bigint; toClient: bigint }
    | { type: 'cancel'; escrowId: bigint; refund: bigint }
    | { type: 'rep'; escrowId: bigint; freelancer: string; rating: number }
    | { type: 'unknown'; topic: string; topics: unknown[]; value: unknown }
  );

export type ActivityEventType = ActivityEvent['type'];

/** The subset of `rpc.Api.EventResponse` the decoder relies on. */
export type RawContractEvent = Pick<rpc.Api.EventResponse, 'id' | 'ledger' | 'ledgerClosedAt' | 'txHash' | 'topic' | 'value'> & {
  pagingToken?: string;
};

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
  throw new TypeError('Expected an integer');
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  throw new TypeError('Expected a number');
}

function toAddress(value: unknown): string {
  if (typeof value === 'string' && value.length > 0) return value;
  throw new TypeError('Expected an address');
}

function toTuple(value: unknown, length: number): unknown[] {
  if (Array.isArray(value) && value.length === length) return value;
  throw new TypeError(`Expected a ${length}-tuple`);
}

function safeNative(value: xdr.ScVal): unknown {
  try {
    return scValToNative(value);
  } catch {
    return null;
  }
}

/** Decode a raw Soroban contract event into a typed activity event. Never throws. */
export function decodeEvent(raw: RawContractEvent): ActivityEvent {
  const pagingToken = raw.pagingToken ?? raw.id;
  const meta: EventMeta = {
    key: `${raw.id}:${pagingToken}`,
    id: raw.id,
    pagingToken,
    ledger: raw.ledger,
    closedAt: raw.ledgerClosedAt,
    txHash: raw.txHash,
  };
  const topics = (raw.topic ?? []).map(safeNative);
  const value = raw.value ? safeNative(raw.value) : null;
  const topic = typeof topics[0] === 'string' ? topics[0] : '';

  try {
    switch (topic) {
      case 'created': {
        const [client, freelancer, total] = toTuple(value, 3);
        return { ...meta, type: 'created', escrowId: toBigInt(topics[1]), client: toAddress(client), freelancer: toAddress(freelancer), total: toBigInt(total) };
      }
      case 'deposit':
        return { ...meta, type: 'deposit', escrowId: toBigInt(topics[1]), amount: toBigInt(value) };
      case 'release': {
        const [index, amount] = toTuple(value, 2);
        return { ...meta, type: 'release', escrowId: toBigInt(topics[1]), index: toNumber(index), amount: toBigInt(amount) };
      }
      case 'dispute':
        return { ...meta, type: 'dispute', escrowId: toBigInt(topics[1]), caller: toAddress(value) };
      case 'resolved': {
        const [toFreelancer, toClient] = toTuple(value, 2);
        return { ...meta, type: 'resolved', escrowId: toBigInt(topics[1]), toFreelancer: toBigInt(toFreelancer), toClient: toBigInt(toClient) };
      }
      case 'cancel':
        return { ...meta, type: 'cancel', escrowId: toBigInt(topics[1]), refund: toBigInt(value) };
      case 'rep': {
        const [freelancer, rating] = toTuple(value, 2);
        return { ...meta, type: 'rep', escrowId: toBigInt(topics[1]), freelancer: toAddress(freelancer), rating: toNumber(rating) };
      }
    }
  } catch {
    // Malformed payload for a known topic: fall through to the passthrough.
  }
  return { ...meta, type: 'unknown', topic: topic || 'event', topics, value };
}

/** Format stroops as XLM, trimming trailing zeros ("1500000000" -> "150"). */
export function formatXlm(stroops: bigint): string {
  const negative = stroops < BigInt(0);
  const abs = negative ? -stroops : stroops;
  const whole = abs / STROOPS_PER_XLM;
  const fraction = (abs % STROOPS_PER_XLM).toString().padStart(7, '0').replace(/0+$/, '');
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''} XLM`;
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 4)}…${address.slice(-4)}` : address;
}

/** Human sentence for an event, e.g. "Escrow #4 funded with 150 XLM". */
export function describeEvent(event: ActivityEvent): string {
  switch (event.type) {
    case 'created':
      return `Escrow #${event.escrowId} created for ${formatXlm(event.total)} between ${shortAddress(event.client)} and ${shortAddress(event.freelancer)}`;
    case 'deposit':
      return `Escrow #${event.escrowId} funded with ${formatXlm(event.amount)}`;
    case 'release':
      return `Escrow #${event.escrowId} released milestone ${event.index + 1} (${formatXlm(event.amount)})`;
    case 'dispute':
      return `Escrow #${event.escrowId} disputed by ${shortAddress(event.caller)}`;
    case 'resolved':
      return `Escrow #${event.escrowId} resolved: ${formatXlm(event.toFreelancer)} to freelancer, ${formatXlm(event.toClient)} to client`;
    case 'cancel':
      return `Escrow #${event.escrowId} cancelled, ${formatXlm(event.refund)} refunded`;
    case 'rep':
      return `Freelancer ${shortAddress(event.freelancer)} rated ${event.rating}/5 on escrow #${event.escrowId}`;
    case 'unknown':
      return `Contract emitted "${event.topic}"`;
  }
}

/** Newest first; ties broken by event id (which is ordered within a ledger). */
export function compareEventsDesc(a: ActivityEvent, b: ActivityEvent): number {
  if (a.ledger !== b.ledger) return b.ledger - a.ledger;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

export interface FetchRecentEventsOptions {
  limit?: number;
  server?: Pick<rpc.Server, 'getLatestLedger' | 'getEvents'>;
  contractId?: string;
}

/**
 * Fetch the most recent escrow contract events from the last ~24h, newest first.
 * `getEvents` pages forward from the start ledger, so we walk every page and keep the tail.
 */
export async function fetchRecentEvents({
  limit = DEFAULT_EVENT_LIMIT,
  server = getRpcServer(),
  contractId = site.contractId,
}: FetchRecentEventsOptions = {}): Promise<ActivityEvent[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_SIZE) {
    throw new RangeError(`limit must be an integer between 1 and ${PAGE_SIZE}`);
  }

  const { sequence } = await server.getLatestLedger();
  const filters: rpc.Api.EventFilter[] = [{ type: 'contract', contractIds: [contractId] }];
  const startLedger = Math.max(1, sequence - EVENT_LOOKBACK_LEDGERS);

  let tail: RawContractEvent[] = [];
  let page = await server.getEvents({ startLedger, filters, limit: PAGE_SIZE });
  for (let i = 0; ; i++) {
    const events = Array.isArray(page?.events) ? page.events : null;
    if (!events) throw new Error('Malformed getEvents response');
    tail = [...tail, ...events].slice(-limit);
    if (events.length < PAGE_SIZE || !page.cursor || i + 1 >= MAX_PAGES) break;
    page = await server.getEvents({ cursor: page.cursor, filters, limit: PAGE_SIZE });
  }

  return tail.map(decodeEvent).sort(compareEventsDesc);
}
