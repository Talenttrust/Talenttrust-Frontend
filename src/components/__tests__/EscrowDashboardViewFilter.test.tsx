import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EscrowDashboard } from '@/components/EscrowDashboard';
import { escrow } from '@/test/fixtures';

const WALLET = 'GWALLETAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const { nav, wallet } = vi.hoisted(() => ({
  nav: { search: '', replace: vi.fn() },
  wallet: { address: null as string | null },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/contracts',
  useRouter: () => ({ replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock('@/lib/stellar/freighter', () => ({ getAddress: () => Promise.resolve(wallet.address) }));
vi.mock('@/lib/stellar/useIsArbiter', () => ({ useIsArbiter: () => false }));

const fetchMock = vi.fn();
const contracts = [
  escrow(1, { title: 'Mine as client', client: WALLET }),
  escrow(2, { title: 'Mine as freelancer', freelancer: WALLET }),
  escrow(3, { title: 'Someone else' }),
];

const urls = () => fetchMock.mock.calls.map(([url]) => String(url).replace(/^https?:\/\/[^/]+/, ''));

const renderAt = async (search: string, address: string | null) => {
  nav.search = search;
  wallet.address = address;
  render(<EscrowDashboard />);
  await screen.findByRole('heading', { name: 'Escrows' });
  await waitFor(() => expect(document.querySelector('.skeleton-cards')).toBeNull());
};

beforeEach(() => {
  nav.replace.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ data: contracts }), { headers: { 'content-type': 'application/json' } })),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EscrowDashboard view filter', () => {
  it('reads ?view=client from the URL, pre-filters by party and shows only client escrows', async () => {
    await renderAt('view=client', WALLET);

    await waitFor(() => expect(urls()).toContain(`/api/v1/contracts?party=${WALLET}`));
    expect(screen.getByRole('radio', { name: 'As client' })).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1));
    expect(screen.getByRole('heading', { name: /#1 Mine as client/ })).toBeInTheDocument();
    expect(screen.getByText('You are the client')).toBeInTheDocument();
  });

  it('defaults to All for a missing or invalid view', async () => {
    await renderAt('view=bogus', WALLET);

    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
    expect(urls().every((u) => !u.includes('party='))).toBe(true);
  });

  it('persists the selection in the URL', async () => {
    await renderAt('', WALLET);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByRole('radio', { name: 'As freelancer' })).not.toHaveAttribute('aria-disabled'));
    await user.click(screen.getByRole('radio', { name: 'As freelancer' }));
    expect(nav.replace).toHaveBeenLastCalledWith('/contracts?view=freelancer', { scroll: false });
  });

  it('shows the role chip for each party and none for unrelated escrows', async () => {
    await renderAt('', WALLET);

    await waitFor(() => expect(screen.getByText('You are the freelancer')).toBeInTheDocument());
    expect(screen.getByText('You are the client')).toBeInTheDocument();
    expect(screen.getAllByText(/You are the/)).toHaveLength(2);
  });

  it('shows a view-specific empty state', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ data: [] }), { headers: { 'content-type': 'application/json' } })),
    );
    await renderAt('view=freelancer', WALLET);

    expect(await screen.findByText('You have no escrows as freelancer yet.')).toBeInTheDocument();
  });

  it('disables the role options and fetches everything without a wallet', async () => {
    await renderAt('view=client', null);

    expect(screen.getByRole('radio', { name: /^As client/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
    expect(urls().every((u) => !u.includes('party='))).toBe(true);
    expect(screen.queryByText(/You are the/)).not.toBeInTheDocument();
  });
});
