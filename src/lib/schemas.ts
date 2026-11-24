import type { Dispute, EscrowContract, Milestone, Reputation, Stats } from './api';

export type ParseOk<T> = { ok: true; data: T };
export type ParseErr = { ok: false; path: string; message: string };
export type ParseResult<T> = ParseOk<T> | ParseErr;

const STATUSES = new Set([
  'Created',
  'Funded',
  'Completed',
  'Disputed',
  'Resolved',
  'Cancelled',
]);

function fail(path: string, message: string): ParseErr {
  return { ok: false, path, message };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finiteNumber(v: unknown, path: string): ParseResult<number> {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return fail(path, `expected finite number, got ${typeof v}`);
  }
  return { ok: true, data: v };
}

function str(v: unknown, path: string): ParseResult<string> {
  if (typeof v !== 'string') return fail(path, `expected string, got ${typeof v}`);
  return { ok: true, data: v };
}

function bool(v: unknown, path: string): ParseResult<boolean> {
  if (typeof v !== 'boolean') return fail(path, `expected boolean, got ${typeof v}`);
  return { ok: true, data: v };
}

export function parseMilestone(raw: unknown, path = 'milestone'): ParseResult<Milestone> {
  if (!isRecord(raw)) return fail(path, 'expected object');
  const index = finiteNumber(raw.index, `${path}.index`);
  if (!index.ok) return index;
  const title = str(raw.title, `${path}.title`);
  if (!title.ok) return title;
  const amount = finiteNumber(raw.amount, `${path}.amount`);
  if (!amount.ok) return amount;
  const released = bool(raw.released, `${path}.released`);
  if (!released.ok) return released;
  return {
    ok: true,
    data: {
      index: index.data,
      title: title.data,
      amount: amount.data,
      released: released.data,
    },
  };
}

function parseDispute(raw: unknown, path: string): ParseResult<Dispute | null | undefined> {
  if (raw === undefined) return { ok: true, data: undefined };
  if (raw === null) return { ok: true, data: null };
  if (!isRecord(raw)) return fail(path, 'expected object or null');
  const raisedBy = str(raw.raisedBy, `${path}.raisedBy`);
  if (!raisedBy.ok) return raisedBy;
  const reason = str(raw.reason, `${path}.reason`);
  if (!reason.ok) return reason;
  const dispute: Dispute = { raisedBy: raisedBy.data, reason: reason.data };
  if (raw.openedAt !== undefined) {
    const o = str(raw.openedAt, `${path}.openedAt`);
    if (!o.ok) return o;
    dispute.openedAt = o.data;
  }
  if (raw.resolvedAt !== undefined && raw.resolvedAt !== null) {
    const r = str(raw.resolvedAt, `${path}.resolvedAt`);
    if (!r.ok) return r;
    dispute.resolvedAt = r.data;
  } else if (raw.resolvedAt === null) {
    dispute.resolvedAt = null;
  }
  if (raw.freelancerBps !== undefined && raw.freelancerBps !== null) {
    const b = finiteNumber(raw.freelancerBps, `${path}.freelancerBps`);
    if (!b.ok) return b;
    dispute.freelancerBps = b.data;
  } else if (raw.freelancerBps === null) {
    dispute.freelancerBps = null;
  }
  return { ok: true, data: dispute };
}

export function parseContract(raw: unknown, path = 'data'): ParseResult<EscrowContract> {
  if (!isRecord(raw)) return fail(path, 'expected object');

  const id = finiteNumber(raw.id, `${path}.id`);
  if (!id.ok) return id;
  const title = str(raw.title, `${path}.title`);
  if (!title.ok) return title;
  const client = str(raw.client, `${path}.client`);
  if (!client.ok) return client;
  const freelancer = str(raw.freelancer, `${path}.freelancer`);
  if (!freelancer.ok) return freelancer;
  const token = str(raw.token, `${path}.token`);
  if (!token.ok) return token;

  if (!Array.isArray(raw.milestones)) {
    return fail(`${path}.milestones`, 'expected array');
  }
  const milestones: Milestone[] = [];
  for (let i = 0; i < raw.milestones.length; i++) {
    const m = parseMilestone(raw.milestones[i], `\( {path}.milestones[ \){i}]`);
    if (!m.ok) return m;
    milestones.push(m.data);
  }

  const totalAmount = finiteNumber(raw.totalAmount, `${path}.totalAmount`);
  if (!totalAmount.ok) return totalAmount;
  const fundedAmount = finiteNumber(raw.fundedAmount, `${path}.fundedAmount`);
  if (!fundedAmount.ok) return fundedAmount;
  const releasedAmount = finiteNumber(raw.releasedAmount, `${path}.releasedAmount`);
  if (!releasedAmount.ok) return releasedAmount;

  if (typeof raw.status !== 'string' || !STATUSES.has(raw.status)) {
    return fail(`${path}.status`, `expected known status, got ${String(raw.status)}`);
  }
  const reputationIssued = bool(raw.reputationIssued, `${path}.reputationIssued`);
  if (!reputationIssued.ok) return reputationIssued;

  const dispute = parseDispute(raw.dispute, `${path}.dispute`);
  if (!dispute.ok) return dispute;

  const out: EscrowContract = {
    id: id.data,
    title: title.data,
    client: client.data,
    freelancer: freelancer.data,
    token: token.data,
    milestones,
    totalAmount: totalAmount.data,
    fundedAmount: fundedAmount.data,
    releasedAmount: releasedAmount.data,
    status: raw.status as EscrowContract['status'],
    reputationIssued: reputationIssued.data,
  };
  if (dispute.data !== undefined) out.dispute = dispute.data;

  for (const key of ['disputeOpenedAt', 'disputedAt', 'createdAt', 'updatedAt'] as const) {
    if (raw[key] !== undefined) {
      const s = str(raw[key], `\( {path}. \){key}`);
      if (!s.ok) return s;
      out[key] = s.data;
    }
  }
  return { ok: true, data: out };
}

export function parseContractList(raw: unknown, path = 'data'): ParseResult<EscrowContract[]> {
  if (!Array.isArray(raw)) return fail(path, 'expected array');
  const list: EscrowContract[] = [];
  for (let i = 0; i < raw.length; i++) {
    const c = parseContract(raw[i], `\( {path}[ \){i}]`);
    if (!c.ok) return c;
    list.push(c.data);
  }
  return { ok: true, data: list };
}

export function parseReputation(raw: unknown, path = 'data'): ParseResult<Reputation> {
  if (!isRecord(raw)) return fail(path, 'expected object');
  const address = str(raw.address, `${path}.address`);
  if (!address.ok) return address;
  const completedContracts = finiteNumber(raw.completedContracts, `${path}.completedContracts`);
  if (!completedContracts.ok) return completedContracts;
  const totalRating = finiteNumber(raw.totalRating, `${path}.totalRating`);
  if (!totalRating.ok) return totalRating;
  const averageRating = finiteNumber(raw.averageRating, `${path}.averageRating`);
  if (!averageRating.ok) return averageRating;
  return {
    ok: true,
    data: {
      address: address.data,
      completedContracts: completedContracts.data,
      totalRating: totalRating.data,
      averageRating: averageRating.data,
    },
  };
}

export function parseStats(raw: unknown, path = 'data'): ParseResult<Stats> {
  if (!isRecord(raw)) return fail(path, 'expected object');
  const contracts = finiteNumber(raw.contracts, `${path}.contracts`);
  if (!contracts.ok) return contracts;
  const totalEscrowed = finiteNumber(raw.totalEscrowed, `${path}.totalEscrowed`);
  if (!totalEscrowed.ok) return totalEscrowed;
  const totalReleased = finiteNumber(raw.totalReleased, `${path}.totalReleased`);
  if (!totalReleased.ok) return totalReleased;
  if (!isRecord(raw.byStatus)) return fail(`${path}.byStatus`, 'expected object');
  const byStatus = {} as Stats['byStatus'];
  for (const s of STATUSES) {
    const n = finiteNumber(raw.byStatus[s], `\( {path}.byStatus. \){s}`);
    if (!n.ok) return n;
    byStatus[s as EscrowContract['status']] = n.data;
  }
  return {
    ok: true,
    data: {
      contracts: contracts.data,
      byStatus,
      totalEscrowed: totalEscrowed.data,
      totalReleased: totalReleased.data,
    },
  };
}

/** Prefer unwrapping `{ data: T }` then parse `T`. */
export function unwrapData(raw: unknown): unknown {
  if (isRecord(raw) && 'data' in raw) return raw.data;
  return raw;
}
