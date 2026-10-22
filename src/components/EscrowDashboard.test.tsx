import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EscrowContract } from '@/lib/api';
import { ToastProvider } from '@/components/toast/ToastProvider';
import { EscrowDashboard } from './EscrowDashboard';

// Minimal stand-in for the App Router: replace() updates useSearchParams()
const nav = vi.hoisted(() => {
  let params = new URLSearchParams();
  const listeners = new Set<() => void>();
  return {
    get: () => params,
    set(search: string) {
      params = new URLSearchParams(search);
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    replace: vi.fn(),
  };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/contracts',
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => useSyncExternalStore(nav.subscribe, nav.get),
}));

const fetchMock = vi.fn();

const contract = (over: Partial<EscrowContract> = {}): EscrowContract => ({
  id: 7,
  title: 'Website redesign',
  client: 'GCLIENTXXXX',
  freelancer: 'GFREELANCERYYYY',
  token: 'USDC',
  milestones: [
    { index: 0, title: 'Design', amount: 300, released: false },
    { index: 1, title: 'Build', amount: 700, released: false },
  ],
  totalAmount: 1000,
  fundedAmount: 0,
  releasedAmount: 0,
  status: 'Created',
  reputationIssued: false,
  ...over,
});

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body } as Response);
const fail = (status: number, message: string) => ({
  ok: false,
  status,
  json: async () => ({ message }),
} as Response);

const renderDashboard = () =>
  render(
    <ToastProvider>
      <EscrowDashboard />
    </ToastProvider>,
  );

/** Mock the initial list load and return the contract it shows. */
const primeList = async (c: EscrowContract) => {
  fetchMock.mockResolvedValueOnce(ok({ data: [c] }));
  renderDashboard();
  await screen.findByRole('heading', { name: `#${c.id} ${c.title}` });
};

describe('EscrowDashboard toasts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  it('shows a success toast after a mocked successful release', async () => {
    const funded = contract({ fundedAmount: 1000 });
    const released = contract({ fundedAmount: 1000, releasedAmount: 300, milestones: [{ index: 0, title: 'Design', amount: 300, released: true }, { index: 1, title: 'Build', amount: 700, released: false }] });
    await primeList(funded);

    fetchMock.mockResolvedValueOnce(ok({ data: released }));
    fetchMock.mockResolvedValueOnce(ok({ data: [released] }));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Release next' }));

    expect(await screen.findByText('Escrow #7: milestone released')).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toContain('/api/v1/contracts/7/milestones/0/release');
  });

  it('shows an error toast with the API message after a 409', async () => {
    await primeList(contract({ fundedAmount: 1000 }));
    fetchMock.mockResolvedValueOnce(fail(409, 'Milestone already released'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Release next' }));

    const alert = screen.getByRole('alert');
    expect(await within(alert).findByText('Milestone already released')).toBeInTheDocument();
    expect(screen.queryByText('Escrow #7: milestone released')).not.toBeInTheDocument();
  });

  it('keeps a previous error toast visible when the next action succeeds', async () => {
    await primeList(contract({ fundedAmount: 1000 }));
    fetchMock.mockResolvedValueOnce(fail(409, 'Milestone already released'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Release next' }));
    await within(screen.getByRole('alert')).findByText('Milestone already released');

    const funded = contract({ fundedAmount: 1000 });
    fetchMock.mockResolvedValueOnce(ok({ data: funded }));
    fetchMock.mockResolvedValueOnce(ok({ data: [funded] }));
    await user.click(screen.getByRole('button', { name: 'Dispute' }));

    // A second action must not erase the failed first one.
    expect(await screen.findByText('Escrow #7 disputed')).toBeInTheDocument();
    expect(within(screen.getByRole('alert')).getByText('Milestone already released')).toBeInTheDocument();
  });

  it('shows an error toast when the action request hits a network error', async () => {
    await primeList(contract({ fundedAmount: 1000 }));
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Release next' }));

    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument();
    expect(screen.queryByText(/Could not reach the API/)).not.toBeInTheDocument();
  });

  it('shows an error toast when creating an escrow with invalid input (400)', async () => {
    fetchMock.mockResolvedValueOnce(ok({ data: [] }));
    renderDashboard();
    await screen.findByText('No escrows yet. Create the first one.');

    fetchMock.mockResolvedValueOnce(fail(400, 'Invalid milestones'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Create escrow' }));

    const alert = screen.getByRole('alert');
    expect(await within(alert).findByText('Invalid milestones')).toBeInTheDocument();
  });

  it('shows a success toast and a View escrow action after creating an escrow', async () => {
    fetchMock.mockResolvedValueOnce(ok({ data: [] }));
    renderDashboard();
    await screen.findByText('No escrows yet. Create the first one.');

    const created = contract();
    fetchMock.mockResolvedValueOnce(ok({ data: created }));
    fetchMock.mockResolvedValueOnce(ok({ data: [created] }));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Create escrow' }));

    expect(await screen.findByText('Escrow #7 created')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View escrow' })).toBeInTheDocument();
  });

  it('shows a success toast after funding', async () => {
    const funded = contract({ fundedAmount: 1000 });
    await primeList(contract());
    fetchMock.mockResolvedValueOnce(ok({ data: funded }));
    fetchMock.mockResolvedValueOnce(ok({ data: [funded] }));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Fund 1000 USDC' }));

    expect(await screen.findByText('Escrow #7 funded')).toBeInTheDocument();
  });

  it('shows a success toast after disputing', async () => {
    await primeList(contract());
    const disputed = contract({ status: 'Disputed' });
    fetchMock.mockResolvedValueOnce(ok({ data: disputed }));
    fetchMock.mockResolvedValueOnce(ok({ data: [disputed] }));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Dispute' }));

    expect(await screen.findByText('Escrow #7 disputed')).toBeInTheDocument();
  });

  it('shows a success toast after cancelling', async () => {
    await primeList(contract());
    const cancelled = contract({ status: 'Cancelled' });
    fetchMock.mockResolvedValueOnce(ok({ data: cancelled }));
    fetchMock.mockResolvedValueOnce(ok({ data: [cancelled] }));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Escrow #7 cancelled')).toBeInTheDocument();
  });

  it('shows a success toast after resolving a dispute', async () => {
    await primeList(contract({ status: 'Disputed' }));
    fetchMock.mockResolvedValueOnce(ok({ data: contract({ status: 'Resolved', releasedAmount: 500 }) }));
    fetchMock.mockResolvedValueOnce(ok({ data: [contract({ status: 'Resolved', releasedAmount: 500 })] }));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Resolve 50/50' }));

    expect(await screen.findByText('Escrow #7 resolved')).toBeInTheDocument();
  });

  it('shows a success toast after rating and sends the chosen rating', async () => {
    await primeList(contract({ status: 'Completed' }));
    fetchMock.mockResolvedValueOnce(ok({ data: { address: 'GFREELANCERYYYY', completedContracts: 1, totalRating: 4, averageRating: 4 } }));
    fetchMock.mockResolvedValueOnce(ok({ data: [contract({ status: 'Completed', reputationIssued: true })] }));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '4' }));

    expect(await screen.findByText('Rating submitted for escrow #7')).toBeInTheDocument();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ rating: 4 });
  });

  it('keeps a failed list load inline instead of a toast', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderDashboard();

    expect(await screen.findByText(/Could not reach the API: Failed to fetch/)).toBeInTheDocument();
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
  });

  it('shows the empty state when the API returns no escrows', async () => {
    fetchMock.mockResolvedValueOnce(ok({ data: [] }));
    renderDashboard();

    expect(await screen.findByText('No escrows yet. Create the first one.')).toBeInTheDocument();
  });
});
