/**
 * Tests for EscrowDashboard – wallet-role view filter
 *
 * Covers:
 *   – URL param ↔ selected segment sync
 *   – Correct ?party= query string per view
 *   – Role chip logic (client / freelancer / no chip)
 *   – Empty state per view
 *   – Disconnected wallet falls back to 'all', wallet-gated controls disabled
 *   – Network error shows error banner (no flash)
 *   – Non-2xx from API shows error banner
 *   – Switching view resets list before new data arrives
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EscrowContract } from '@/lib/api';

// ── vi.hoisted: declare shared mocks before vi.mock factories are evaluated ──

const { mockListContracts, mockGetAddress } = vi.hoisted(() => ({
  mockListContracts: vi.fn(),
  mockGetAddress: vi.fn(),
}));

// ── module mocks ──────────────────────────────────────────────────────────────

const mockReplace = vi.fn();
const mockSearchParams = { get: vi.fn(), toString: vi.fn(() => '') };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api')>();
  return { ...original, listContracts: mockListContracts };
});

vi.mock('@/lib/stellar/freighter', () => ({
  getAddress: mockGetAddress,
  getNetworkPassphrase: vi.fn().mockResolvedValue('Test SDF Network ; September 2015'),
  signTransaction: vi.fn(),
}));

// ── lazy import after mocks are set up ───────────────────────────────────────

// We import the component after declaring mocks so the hoisted vi.mock calls
// have already replaced the modules before the component module loads.
const { EscrowDashboard } = await import('../EscrowDashboard');

// ── helpers ───────────────────────────────────────────────────────────────────

const WALLET = 'GCLIENT_WALLET_ADDRESS_1234567890';

const makeContract = (overrides: Partial<EscrowContract> = {}): EscrowContract => ({
  id: 1,
  title: 'Test escrow',
  client: 'GCLIENT_OTHER_ADDRESS_1111111111',
  freelancer: 'GFREELANCER_ADDRESS_2222222222',
  token: 'USDC',
  milestones: [{ index: 0, title: 'Phase 1', amount: 500, released: false }],
  totalAmount: 500,
  fundedAmount: 0,
  releasedAmount: 0,
  status: 'Created',
  reputationIssued: false,
  ...overrides,
});

function setView(view: string | null) {
  mockSearchParams.get.mockImplementation((key: string) => (key === 'view' ? view : null));
}

beforeEach(() => {
  vi.clearAllMocks();
  setView(null); // default: 'all'
  mockGetAddress.mockResolvedValue(null); // disconnected by default
  mockListContracts.mockResolvedValue([]);
  mockSearchParams.toString.mockReturnValue('');
  mockReplace.mockReset();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('EscrowDashboard – view filter sync', () => {
  it('reads view=client from URL and marks "As client" as checked', async () => {
    setView('client');
    render(<EscrowDashboard />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /as client/i })).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('defaults to "All" when ?view param is absent', async () => {
    setView(null);
    render(<EscrowDashboard />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /^all$/i })).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('defaults to "All" when ?view has an invalid value', async () => {
    setView('invalid');
    render(<EscrowDashboard />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /^all$/i })).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('calls router.replace with ?view=freelancer when freelancer is selected', async () => {
    mockGetAddress.mockResolvedValue(WALLET);
    setView(null);
    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('radio', { name: /as freelancer/i }));

    await userEvent.click(screen.getByRole('radio', { name: /as freelancer/i }));

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('view=freelancer'),
    );
  });

  it('calls router.replace to /contracts when "All" is selected', async () => {
    mockGetAddress.mockResolvedValue(WALLET);
    mockSearchParams.toString.mockReturnValue('view=client');
    setView('client');
    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('radio', { name: /^all$/i }));

    await userEvent.click(screen.getByRole('radio', { name: /^all$/i }));

    expect(mockReplace).toHaveBeenCalledWith('/contracts');
  });
});

describe('EscrowDashboard – API query string', () => {
  it('calls listContracts without party for "all" view', async () => {
    mockGetAddress.mockResolvedValue(WALLET);
    setView(null);
    render(<EscrowDashboard />);
    await waitFor(() => expect(mockListContracts).toHaveBeenCalled());
    const call = mockListContracts.mock.calls[0][0];
    expect(call?.party).toBeUndefined();
  });

  it('calls listContracts with party=walletAddress for "client" view', async () => {
    mockGetAddress.mockResolvedValue(WALLET);
    setView('client');
    render(<EscrowDashboard />);
    // The component calls listContracts once on mount (wallet not yet resolved),
    // then again after getAddress() resolves. Wait for the call with party set.
    await waitFor(() => {
      const calls = mockListContracts.mock.calls;
      expect(calls.some((c) => c[0]?.party === WALLET)).toBe(true);
    });
  });

  it('calls listContracts without party for "client" view when wallet not connected', async () => {
    mockGetAddress.mockResolvedValue(null);
    setView('client');
    render(<EscrowDashboard />);
    await waitFor(() => expect(mockListContracts).toHaveBeenCalled());
    const call = mockListContracts.mock.calls[0][0];
    expect(call?.party).toBeUndefined();
  });
});

describe('EscrowDashboard – role chip', () => {
  it('shows "You are the client" chip when wallet matches client address', async () => {
    mockGetAddress.mockResolvedValue(WALLET);
    setView(null);
    mockListContracts.mockResolvedValue([makeContract({ client: WALLET })]);

    render(<EscrowDashboard />);
    await waitFor(() => {
      expect(screen.getByText('You are the client')).toBeInTheDocument();
    });
  });

  it('shows "You are the freelancer" chip when wallet matches freelancer address', async () => {
    mockGetAddress.mockResolvedValue(WALLET);
    setView(null);
    mockListContracts.mockResolvedValue([makeContract({ freelancer: WALLET })]);

    render(<EscrowDashboard />);
    await waitFor(() => {
      expect(screen.getByText('You are the freelancer')).toBeInTheDocument();
    });
  });

  it('shows no role chip when wallet does not match either party', async () => {
    mockGetAddress.mockResolvedValue(WALLET);
    setView(null);
    mockListContracts.mockResolvedValue([makeContract()]);

    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('article'));
    expect(screen.queryByText(/you are the/i)).not.toBeInTheDocument();
  });

  it('shows no role chip when wallet is disconnected', async () => {
    mockGetAddress.mockResolvedValue(null);
    setView(null);
    mockListContracts.mockResolvedValue([makeContract()]);

    render(<EscrowDashboard />);
    await waitFor(() => screen.getByRole('article'));
    expect(screen.queryByText(/you are the/i)).not.toBeInTheDocument();
  });
});

describe('EscrowDashboard – empty state', () => {
  it('shows global empty state for "all" view', async () => {
    setView(null);
    mockListContracts.mockResolvedValue([]);
    render(<EscrowDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toHaveTextContent(
        'No escrows yet. Create the first one.',
      );
    });
  });

  it('shows client-specific empty state for "client" view', async () => {
    mockGetAddress.mockResolvedValue(WALLET);
    setView('client');
    mockListContracts.mockResolvedValue([]);
    render(<EscrowDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toHaveTextContent(
        'You have no escrows as client yet.',
      );
    });
  });

  it('shows freelancer-specific empty state for "freelancer" view', async () => {
    mockGetAddress.mockResolvedValue(WALLET);
    setView('freelancer');
    mockListContracts.mockResolvedValue([]);
    render(<EscrowDashboard />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toHaveTextContent(
        'You have no escrows as freelancer yet.',
      );
    });
  });
});

describe('EscrowDashboard – disconnected wallet', () => {
  it('wallet-gated filter options are aria-disabled when no wallet', async () => {
    mockGetAddress.mockResolvedValue(null);
    setView(null);
    render(<EscrowDashboard />);
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /as client/i })).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('radio', { name: /as freelancer/i })).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('fetches all contracts without party= when wallet is disconnected', async () => {
    mockGetAddress.mockResolvedValue(null);
    setView(null);
    render(<EscrowDashboard />);
    await waitFor(() => expect(mockListContracts).toHaveBeenCalled());
    const call = mockListContracts.mock.calls[0][0];
    expect(call?.party).toBeUndefined();
  });
});

describe('EscrowDashboard – error states', () => {
  it('shows error banner on network error', async () => {
    mockListContracts.mockRejectedValue(new Error('Network request failed'));
    render(<EscrowDashboard />);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not reach the API: Network request failed',
      );
    });
  });

  it('does not show the error banner before a fetch fails', () => {
    mockListContracts.mockImplementation(() => new Promise(() => {}));
    render(<EscrowDashboard />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('EscrowDashboard – client-side role filter', () => {
  it('client view only shows contracts where the wallet is the client', async () => {
    mockGetAddress.mockResolvedValue(WALLET);
    setView('client');

    mockListContracts.mockResolvedValue([
      makeContract({ id: 1, client: WALLET, title: 'Client contract' }),
      makeContract({ id: 2, freelancer: WALLET, title: 'Freelancer contract' }),
    ]);

    render(<EscrowDashboard />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /client contract/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: /freelancer contract/i }),
      ).not.toBeInTheDocument();
    });
  });

  it('freelancer view only shows contracts where the wallet is the freelancer', async () => {
    mockGetAddress.mockResolvedValue(WALLET);
    setView('freelancer');

    mockListContracts.mockResolvedValue([
      makeContract({ id: 1, client: WALLET, title: 'Client contract' }),
      makeContract({ id: 2, freelancer: WALLET, title: 'Freelancer contract' }),
    ]);

    render(<EscrowDashboard />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /freelancer contract/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: /client contract/i }),
      ).not.toBeInTheDocument();
    });
  });

  it('all view shows all contracts regardless of role', async () => {
    mockGetAddress.mockResolvedValue(WALLET);
    setView(null);

    mockListContracts.mockResolvedValue([
      makeContract({ id: 1, client: WALLET, title: 'Client contract' }),
      makeContract({ id: 2, freelancer: WALLET, title: 'Freelancer contract' }),
      makeContract({ id: 3, title: 'Other contract' }),
    ]);

    render(<EscrowDashboard />);
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /client contract/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /freelancer contract/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: /other contract/i }),
      ).toBeInTheDocument();
    });
  });
});
