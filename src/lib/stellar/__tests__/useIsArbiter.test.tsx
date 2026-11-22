import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsArbiter } from '@/lib/stellar/useIsArbiter';
import { WalletProvider } from '@/components/wallet/WalletProvider';
import * as adminLib from '@/lib/stellar/admin';
import * as freighterWallet from '@/lib/stellar/freighterWallet';
import * as freighter from '@/lib/stellar/freighter';
import * as network from '@/lib/stellar/network';

const ADMIN = 'GADMINAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const USER = 'GUSERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

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

vi.mock('@/lib/stellar/admin');
vi.mock('@/lib/stellar/freighterWallet');
vi.mock('@/lib/stellar/freighter');
vi.mock('@/lib/stellar/network');

describe('useIsArbiter', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WalletProvider>{children}</WalletProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockWatcherCallback = null;
    localStorage.clear();
    vi.mocked(adminLib.readAdmin).mockResolvedValue(ADMIN);
    vi.mocked(network.expectedPassphrase).mockReturnValue('Test SDF Network ; September 2015');
    vi.mocked(freighterWallet.isInstalled).mockResolvedValue(true);
    vi.mocked(freighterWallet.isAllowedSafe).mockResolvedValue(false);
    vi.mocked(freighterWallet.getAddressSafe).mockResolvedValue('');
    vi.mocked(freighterWallet.getNetworkPassphrase).mockResolvedValue('Test SDF Network ; September 2015');
  });

  it('updates arbiter status when account changes in Freighter without reload', async () => {
    const { result } = renderHook(() => useIsArbiter(), { wrapper });

    // Initially disconnected
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(result.current).toBe(false);

    // Switch account to non-admin USER
    await act(async () => {
      mockWatcherCallback!({
        address: USER,
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
    });
    expect(result.current).toBe(false);

    // Switch account to ADMIN in Freighter
    await act(async () => {
      mockWatcherCallback!({
        address: ADMIN,
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
    });

    // Reactively detects arbiter without reload
    expect(result.current).toBe(true);
  });

  it('falls back to getAddress when used outside WalletProvider', async () => {
    vi.mocked(freighter.getAddress).mockResolvedValue(ADMIN);

    const { result } = renderHook(() => useIsArbiter());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current).toBe(true);
    expect(freighter.getAddress).toHaveBeenCalled();
  });
});
