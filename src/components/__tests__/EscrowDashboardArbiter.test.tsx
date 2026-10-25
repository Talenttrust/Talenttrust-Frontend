import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EscrowDashboard } from '@/components/EscrowDashboard';
import { escrow } from '@/test/fixtures';

const arbiter = vi.hoisted(() => ({ value: false as boolean | null }));
vi.mock('@/lib/stellar/useIsArbiter', () => ({ useIsArbiter: () => arbiter.value }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/contracts',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const disputed = escrow(9, {
  title: 'Logo',
  status: 'Disputed',
  totalAmount: 1000,
  fundedAmount: 1000,
  releasedAmount: 200,
  dispute: { raisedBy: 'GCLIENT9', reason: 'Late', openedAt: '2026-10-02T10:00:00.000Z' },
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation((_url: unknown, init?: RequestInit) =>
    init?.method === 'POST' ? json({ data: { ...disputed, status: 'Resolved' } }) : json({ data: [disputed] }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EscrowDashboard dispute resolution gate', () => {
  it('shows a waiting notice instead of resolution controls for non-arbiters', async () => {
    arbiter.value = false;
    render(<EscrowDashboard />);

    expect(await screen.findByText('Awaiting arbiter decision')).toBeInTheDocument();
    expect(screen.getByLabelText('Dispute opened')).toHaveAttribute('dateTime', '2026-10-02T10:00:00.000Z');
    expect(screen.queryByRole('button', { name: /resolve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review resolution' })).not.toBeInTheDocument();
  });

  it('lets the arbiter choose a split and sends it as basis points', async () => {
    arbiter.value = true;
    render(<EscrowDashboard />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '75%' }));
    expect(screen.getByText('Freelancer receives').nextElementSibling).toHaveTextContent('600 XLM');
    await user.click(screen.getByRole('button', { name: 'Review resolution' }));
    await user.click(screen.getByRole('button', { name: 'Confirm resolution' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
      expect(post?.[0]).toContain('/api/v1/contracts/9/resolve');
      expect(JSON.parse((post?.[1] as RequestInit).body as string)).toEqual({ freelancerBps: 7500 });
    });
  });
});
