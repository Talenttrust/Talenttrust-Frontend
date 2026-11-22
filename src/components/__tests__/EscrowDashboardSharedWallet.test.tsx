import { render, screen, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EscrowDashboard } from '@/components/EscrowDashboard';
import { WalletProvider } from '@/components/wallet/WalletProvider';
import { escrow } from '@/test/fixtures';
import * as freighterWallet from '@/lib/stellar/freighterWallet';
import * as network from '@/lib/stellar/network';

const CLIENT = 'GCLIENTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const FREELANCER = 'GFREELANCERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

let mockWatcherCallback: ((params: {
  address?: string;
  network?: string;
  networkPassphrase?: string;
  error?: unknown;
}) => void) | null = null;

const mockWatch = vi.fn((cb) => {
  mockWatcherCallback = cb;
  return {};
});
const mockStop = vi.fn();

vi.mock('@stellar/freighter-api', () => ({
  WatchWalletChanges: class {
    watch = mockWatch;
    stop = mockStop;
  },
}));

vi.mock('@/lib/stellar/freighterWallet');
vi.mock('@/lib/stellar/network');

vi.mock('next/navigation', () => ({
  usePathname: () => '/contracts',
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/lib/stellar/useIsArbiter', () => ({ useIsArbiter: () => false }));

const contracts = [
  escrow(1, { title: 'Contract 1', client: CLIENT }),
  escrow(2, { title: 'Contract 2', freelancer: FREELANCER }),
  escrow(3, { title: 'Contract 3' }),
];

describe('EscrowDashboard with shared WalletProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWatcherCallback = null;
    localStorage.clear();
    vi.mocked(network.expectedPassphrase).mockReturnValue('Test SDF Network ; September 2015');
    vi.mocked(freighterWallet.isInstalled).mockResolvedValue(true);
    vi.mocked(freighterWallet.isAllowedSafe).mockResolvedValue(false);
    vi.mocked(freighterWallet.getAddressSafe).mockResolvedValue('');
    vi.mocked(freighterWallet.getNetworkPassphrase).mockResolvedValue('Test SDF Network ; September 2015');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: contracts }), {
          headers: { 'content-type': 'application/json' },
        })
      )
    );
  });

  it('updates role chips when Freighter account changes via WatchWalletChanges without reload', async () => {
    render(
      <WalletProvider>
        <EscrowDashboard />
      </WalletProvider>
    );

    await screen.findByRole('heading', { name: 'Escrows' });
    await waitFor(() => expect(document.querySelector('.skeleton-cards')).toBeNull());

    // Initially disconnected: role options disabled
    expect(screen.getByRole('radio', { name: /^As client/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText('You are the client')).not.toBeInTheDocument();
    expect(screen.queryByText('You are the freelancer')).not.toBeInTheDocument();

    // Account change to CLIENT in Freighter
    expect(mockWatcherCallback).toBeTypeOf('function');
    await act(async () => {
      mockWatcherCallback!({
        address: CLIENT,
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
    });

    // Role options become enabled and CLIENT role chip appears
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'As client' })).not.toHaveAttribute('aria-disabled');
    });
    expect(screen.getByText('You are the client')).toBeInTheDocument();
    expect(screen.queryByText('You are the freelancer')).not.toBeInTheDocument();

    // Account switch in Freighter to FREELANCER
    await act(async () => {
      mockWatcherCallback!({
        address: FREELANCER,
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
    });

    // Dashboard reacts immediately: CLIENT chip gone, FREELANCER chip displayed
    await waitFor(() => {
      expect(screen.queryByText('You are the client')).not.toBeInTheDocument();
    });
    expect(screen.getByText('You are the freelancer')).toBeInTheDocument();
  });
});
