import { site } from './site';

export interface Milestone {
  index: number;
  title: string;
  amount: number;
  released: boolean;
}

export interface Dispute {
  raisedBy: string;
  reason: string;
  openedAt: string;
  freelancerBps?: number;
  resolvedAt?: string;
}

export interface EscrowContract {
  id: number;
  title: string;
  client: string;
  freelancer: string;
  token: string;
  milestones: Milestone[];
  totalAmount: number;
  fundedAmount: number;
  releasedAmount: number;
  status: 'Created' | 'Funded' | 'Completed' | 'Disputed' | 'Resolved' | 'Cancelled';
  reputationIssued: boolean;
  dispute?: Dispute;
  createdAt: string;
  updatedAt: string;
}

export interface Reputation {
  address: string;
  completedContracts: number;
  totalRating: number;
  averageRating: number;
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${site.apiUrl}${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface ContractFetchResult {
  ok: true;
  contract: EscrowContract;
}

export interface ContractFetchNotFound {
  ok: false;
  notFound: true;
}

export type ContractFetch = ContractFetchResult | ContractFetchNotFound;

export function parsePositiveInteger(id: string | undefined): number | null {
  if (!id) return null;
  if (!/^\d+$/.test(id)) return null;
  const num = Number(id);
  if (!Number.isSafeInteger(num) || num <= 0) return null;
  return num;
}

export async function fetchContract(id: number): Promise<ContractFetch> {
  const res = await fetch(`${site.apiUrl}/api/v1/contracts/${id}`, { cache: 'no-store' });
  if (res.status === 404) {
    return { ok: false, notFound: true };
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message || `Request failed (${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    throw new Error('Empty contract response');
  }
  return { ok: true, contract: data as EscrowContract };
}
