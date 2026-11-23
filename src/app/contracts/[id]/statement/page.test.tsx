import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import type { EscrowContract } from '@/lib/api';

const notFoundMock = vi.fn(() => {
  throw Object.assign(new Error('NEXT_NOT_FOUND'), { digest: 'NEXT_NOT_FOUND' });
});

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  usePathname: () => '/contracts/7/statement',
}));

import StatementPage from '@/app/contracts/[id]/statement/page';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const contract = (over: Partial<EscrowContract> = {}): EscrowContract => ({
  id: 7,
  title: 'Website redesign',
  client: 'GCLIENT',
  freelancer: 'GFREE',
  token: 'XLM',
  milestones: [{ index: 0, title: 'Design', amount: 1000, released: true }],
  totalAmount: 1000,
  fundedAmount: 1000,
  releasedAmount: 1000,
  status: 'Completed',
  reputationIssued: false,
  createdAt: '2026-01-02T10:00:00.000Z',
  updatedAt: '2026-01-05T12:30:00.000Z',
  ...over,
});

const renderPage = async (id: string) => {
  const ui = await StatementPage({ params: Promise.resolve({ id }) });
  return render(ui);
};

beforeEach(() => {
  notFoundMock.mockClear();
  vi.restoreAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe('StatementPage', () => {
  it('renders the ledger for a completed escrow', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: contract() })));
    await renderPage('7');
    expect(screen.getByRole('heading', { name: /#7 website redesign/i })).toBeInTheDocument();
    expect(screen.getByText(/milestone 1: design/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /print \/ save as pdf/i })).toBeInTheDocument();
    for (const name of ['Download CSV', 'Download JSON']) {
      expect(screen.getByRole('button', { name }).closest('.statement-toolbar')).not.toBeNull();
    }
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not fetch and calls notFound for an invalid id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(renderPage('abc')).rejects.toThrow();
    expect(notFoundMock).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch and calls notFound for a negative id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(renderPage('-3')).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls notFound when the API returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'contract_not_found' }, 404)));
    await expect(renderPage('999')).rejects.toThrow();
    expect(notFoundMock).toHaveBeenCalled();
  });

  it('throws a clear error on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'boom' }, 500)));
    await expect(renderPage('7')).rejects.toThrow(/Failed to load contract \(500\)/);
  });

  it('calls notFound when the payload has no data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({})));
    await expect(renderPage('7')).rejects.toThrow();
    expect(notFoundMock).toHaveBeenCalled();
  });

  it('shows In progress for a funded escrow', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: contract({ status: 'Funded', releasedAmount: 0, milestones: [{ index: 0, title: 'Design', amount: 1000, released: false }] }) })));
    await renderPage('7');
    expect(screen.getAllByText(/in progress/i).length).toBeGreaterThan(0);
  });

  it('flags inconsistent ledger amounts while keeping download controls available', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: contract({ releasedAmount: 900, milestones: [{ index: 0, title: 'Design', amount: 900, released: true }] }) })));
    await renderPage('7');
    expect(screen.getByRole('alert')).toHaveTextContent('Ledger minus budget: -100 XLM');
    expect(screen.getByRole('alert')).toHaveTextContent('Check the ledger');
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeEnabled();
  });

  it('shows invalid arithmetic without misleading NaN or Infinity values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: contract({ milestones: [{ index: 0, title: 'Design', amount: NaN, released: true }] }) }) }));
    await renderPage('7');
    expect(screen.getByRole('alert')).toHaveTextContent('One or more amounts are invalid');
    expect(screen.getByRole('alert')).not.toHaveTextContent('NaN');
  });

  it('uses existing print rules to hide the toolbar and both downloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: contract() })));
    await renderPage('7');
    expect(screen.getByRole('button', { name: 'Download CSV' }).closest('.statement-toolbar')).not.toBeNull();
    const css = readFileSync('src/app/globals.css', 'utf8');
    expect(css).toMatch(/@media print\s*\{[^}]*\.statement-toolbar[^}]*display:\s*none\s*!important/);
  });

  it.each([undefined, 'invalid-date'])('handles missing or invalid statement dates (%s)', async (date) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: contract({ createdAt: date, updatedAt: date }) })));
    await renderPage('7');
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('renders an empty zero-budget ledger without a mismatch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: contract({ totalAmount: 0, fundedAmount: 0, releasedAmount: 0, milestones: [] }) })));
    await renderPage('7');
    expect(screen.getByText('No payouts recorded yet.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([null, '2026-02-01T09:00:00.000Z'])('renders dispute metadata with optional resolution time (%s)', async (resolvedAt) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: contract({ status: 'Resolved', releasedAmount: 0, milestones: [], dispute: { raisedBy: 'GSYNTHETIC', reason: 'scope', freelancerBps: 5000, resolvedAt } }) })));
    await renderPage('7');
    expect(screen.getByText('Dispute raised by')).toBeInTheDocument();
    expect(screen.getByText('GSYNTHETIC')).toBeInTheDocument();
    expect(Boolean(screen.queryByText('Dispute resolved'))).toBe(Boolean(resolvedAt));
  });
});
