import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/toast/ToastProvider';
import type { EscrowContract } from '@/lib/api';
import { ArbiterConsole, sortDisputesOldestFirst } from './ArbiterConsole';

const mocks = vi.hoisted(() => ({
  isArbiter: null as boolean | null,
  wallet: null as { address?: string | null; connect?: () => Promise<void> } | null,
  listContracts: vi.fn(),
  api: vi.fn(),
}));

vi.mock('@/lib/stellar/useIsArbiter', () => ({
  useIsArbiter: () => mocks.isArbiter,
}));

vi.mock('@/components/wallet/WalletProvider', () => ({
  useOptionalWallet: () => mocks.wallet,
}));

vi.mock('@/lib/api', () => ({
  listContracts: (...args: unknown[]) => mocks.listContracts(...args),
  api: (...args: unknown[]) => mocks.api(...args),
}));

const ADMIN = 'GADMIN';
const OTHER = 'GNOTADMIN';

function contract(id: number, overrides: Partial<EscrowContract> = {}): EscrowContract {
  return {
    id,
    title: `Escrow ${id}`,
    client: 'GCLIENT',
    freelancer: 'GFREELANCER',
    token: 'USDC',
    milestones: [{ index: 1, title: 'Build', amount: 1000, released: false }],
    totalAmount: 1000,
    fundedAmount: 1000,
    releasedAmount: 200,
    status: 'Disputed',
    reputationIssued: false,
    dispute: {
      raisedBy: 'GCLIENT',
      reason: `Reason ${id}`,
      openedAt: '2026-11-21T12:00:00.000Z',
    },
    ...overrides,
  };
}

function renderConsole() {
  return render(
    <ToastProvider>
      <ArbiterConsole />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-23T12:00:00.000Z'));
  mocks.isArbiter = null;
  mocks.wallet = { address: ADMIN, connect: vi.fn().mockResolvedValue(undefined) };
  mocks.listContracts.mockReset().mockResolvedValue([]);
  mocks.api.mockReset().mockResolvedValue({ data: {} });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('ArbiterConsole gating', () => {
  it('shows a loading state while the admin check is pending', () => {
    renderConsole();
    expect(screen.getByText(/checking arbiter access/i)).toBeInTheDocument();
    expect(mocks.listContracts).not.toHaveBeenCalled();
  });

  it('prompts a disconnected user to connect a wallet', () => {
    mocks.isArbiter = false;
    mocks.wallet = null;
    renderConsole();
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(mocks.listContracts).not.toHaveBeenCalled();
  });

  it('rejects a connected non-arbiter without revealing disputes', () => {
    mocks.isArbiter = false;
    mocks.wallet = { address: OTHER };
    renderConsole();
    expect(screen.getByText(/not authorized/i)).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(mocks.listContracts).not.toHaveBeenCalled();
  });
});

describe('ArbiterConsole dispute list', () => {
  it('shows an empty state for an arbiter with no open disputes', async () => {
    mocks.isArbiter = true;
    renderConsole();
    expect(await screen.findByText(/no open disputes/i)).toBeInTheDocument();
    expect(mocks.listContracts).toHaveBeenCalledWith({ status: 'Disputed' });
  });

  it('shows an error state when the list request fails', async () => {
    mocks.isArbiter = true;
    mocks.listContracts.mockRejectedValue(new Error('API offline'));
    renderConsole();
    expect(await screen.findByText(/could not load disputes: API offline/i)).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('orders disputes oldest first and shows reason, raised-by, age and held amount', async () => {
    mocks.isArbiter = true;
    mocks.listContracts.mockResolvedValue([
      contract(3, { disputeOpenedAt: '2026-11-20T12:00:00.000Z', dispute: undefined }),
      contract(1, { dispute: { raisedBy: 'GFIRST', reason: 'Oldest claim', openedAt: '2026-11-18T12:00:00.000Z' } }),
      contract(2, { disputedAt: '2026-11-19T12:00:00.000Z', dispute: undefined }),
    ]);
    renderConsole();

    await screen.findByRole('heading', { name: /escrow #3/i });
    const titles = screen.getAllByRole('article').map((article) =>
      within(article).getByRole('heading', { level: 2 }).textContent,
    );
    expect(titles).toEqual([
      'Escrow #1: Escrow 1',
      'Escrow #2: Escrow 2',
      'Escrow #3: Escrow 3',
    ]);

    const oldest = screen.getAllByRole('article')[0];
    expect(within(oldest).getByText('Oldest claim')).toBeInTheDocument();
    expect(within(oldest).getByText(/GFIRST/)).toBeInTheDocument();
    expect(within(oldest).getByText('5d ago')).toBeInTheDocument();
    expect(within(oldest).getByText('800 USDC')).toBeInTheDocument();
  });

  it('removes a resolved dispute and shows a success toast', async () => {
    const user = userEvent.setup();
    mocks.isArbiter = true;
    mocks.listContracts.mockResolvedValue([contract(1), contract(2)]);
    renderConsole();

    const first = await screen.findByRole('article', { name: /escrow #1/i });
    await user.click(within(first).getByRole('button', { name: '75%' }));
    await user.click(within(first).getByRole('button', { name: /review resolution/i }));
    await user.click(within(first).getByRole('button', { name: /confirm resolution/i }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /escrow #1/i })).not.toBeInTheDocument(),
    );
    expect(await screen.findByText('Escrow #1 resolved')).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledWith('/api/v1/contracts/1/resolve', {
      method: 'POST',
      body: { freelancerBps: 7500 },
    });
    expect(screen.getByRole('article', { name: /escrow #2/i })).toBeInTheDocument();
  });

  it('keeps the dispute visible and reports a resolve failure inline', async () => {
    const user = userEvent.setup();
    mocks.isArbiter = true;
    mocks.listContracts.mockResolvedValue([contract(1)]);
    mocks.api.mockRejectedValue(new Error('Invalid split'));
    renderConsole();

    const first = await screen.findByRole('article', { name: /escrow #1/i });
    await user.click(within(first).getByRole('button', { name: /review resolution/i }));
    await user.click(within(first).getByRole('button', { name: /confirm resolution/i }));

    expect(await within(first).findByRole('alert')).toHaveTextContent('Invalid split');
    expect(screen.getByRole('article', { name: /escrow #1/i })).toBeInTheDocument();
  });
});

describe('sortDisputesOldestFirst', () => {
  it('places missing or invalid dispute dates last', () => {
    const sorted = sortDisputesOldestFirst([
      contract(1, { disputeOpenedAt: undefined, dispute: undefined, disputedAt: undefined }),
      contract(2, { dispute: { raisedBy: 'G', reason: 'r', openedAt: '2026-11-19T12:00:00.000Z' } }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual([2, 1]);
  });
});
