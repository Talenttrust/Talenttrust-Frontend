import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WalletProvider, useWallet } from './WalletProvider';
import * as freighter from '@/lib/stellar/freighterWallet';
import * as network from '@/lib/stellar/network';

let mockWatchCallback: ((params: {
  address?: string;
  network?: string;
  networkPassphrase?: string;
  error?: unknown;
}) => void) | null = null;

const mockWatch = vi.fn((cb) => {
  mockWatchCallback = cb;
  return {};
});
const mockStop = vi.fn();

vi.mock('@/lib/stellar/freighterWallet');
vi.mock('@/lib/stellar/network');

vi.mock('@stellar/freighter-api', () => ({
  WatchWalletChanges: class {
    watch = mockWatch;
    stop = mockStop;
  },
}));

describe('WalletProvider', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WalletProvider>{children}</WalletProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    mockWatchCallback = null;
    localStorage.clear();
    vi.mocked(network.expectedPassphrase).mockReturnValue('Test SDF Network ; September 2015');
  });

  it('transitions from disconnected to connecting on connect', async () => {
    vi.mocked(freighter.isInstalled).mockResolvedValue(true);
    vi.mocked(freighter.requestAccessSafe).mockResolvedValue({ address: 'GTEST123' });
    vi.mocked(freighter.getNetworkPassphrase).mockResolvedValue('Test SDF Network ; September 2015');

    const { result } = renderHook(() => useWallet(), { wrapper });

    expect(result.current.state.type).toBe('disconnected');
    expect(result.current.address).toBeNull();

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state.type).toBe('connected');
    expect(result.current.address).toBe('GTEST123');
  });

  it('transitions to error when user rejects access', async () => {
    vi.mocked(freighter.isInstalled).mockResolvedValue(true);
    vi.mocked(freighter.requestAccessSafe).mockResolvedValue({ address: '', error: 'User rejected' });

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state.type).toBe('error');
    expect((result.current.state as { type: 'error'; message: string }).message).toBe('User rejected');
    expect(result.current.error).toBe('User rejected');
  });

  it('transitions to wrong-network when network mismatch', async () => {
    vi.mocked(freighter.isInstalled).mockResolvedValue(true);
    vi.mocked(freighter.requestAccessSafe).mockResolvedValue({ address: 'GTEST123' });
    vi.mocked(freighter.getNetworkPassphrase).mockResolvedValue('Public Global Stellar Network ; September 2015');

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state.type).toBe('wrong-network');
    expect(result.current.address).toBe('GTEST123');
  });

  it('transitions from connected to disconnected on disconnect', async () => {
    vi.mocked(freighter.isInstalled).mockResolvedValue(true);
    vi.mocked(freighter.requestAccessSafe).mockResolvedValue({ address: 'GTEST123' });
    vi.mocked(freighter.getNetworkPassphrase).mockResolvedValue('Test SDF Network ; September 2015');

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state.type).toBe('connected');

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.state.type).toBe('disconnected');
    expect(result.current.address).toBeNull();
    expect(localStorage.getItem('tt.wallet.autoconnect')).toBeNull();
  });

  it('auto-restores session on mount when flag is set', async () => {
    localStorage.setItem('tt.wallet.autoconnect', '1');
    vi.mocked(freighter.isInstalled).mockResolvedValue(true);
    vi.mocked(freighter.isAllowedSafe).mockResolvedValue(true);
    vi.mocked(freighter.getAddressSafe).mockResolvedValue('GTEST123');
    vi.mocked(freighter.getNetworkPassphrase).mockResolvedValue('Test SDF Network ; September 2015');

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(result.current.state.type).toBe('connected');
    expect(result.current.address).toBe('GTEST123');
  });

  it('handles extension locked error', async () => {
    vi.mocked(freighter.isInstalled).mockResolvedValue(true);
    vi.mocked(freighter.requestAccessSafe).mockResolvedValue({ address: '', error: 'Extension is locked' });

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state.type).toBe('error');
    expect((result.current.state as { type: 'error'; message: string }).message).toBe('Extension is locked');
  });

  it('reacts to Freighter account changes via WatchWalletChanges without reload', async () => {
    vi.mocked(freighter.isInstalled).mockResolvedValue(true);
    vi.mocked(freighter.requestAccessSafe).mockResolvedValue({ address: 'GTEST123' });
    vi.mocked(freighter.getNetworkPassphrase).mockResolvedValue('Test SDF Network ; September 2015');

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.address).toBe('GTEST123');

    // Simulate account change in Freighter
    expect(mockWatch).toHaveBeenCalled();
    expect(mockWatchCallback).toBeTypeOf('function');

    act(() => {
      mockWatchCallback!({
        address: 'GNEWACCOUNT999',
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
    });

    expect(result.current.state.type).toBe('connected');
    expect(result.current.address).toBe('GNEWACCOUNT999');
  });

  it('reacts to Freighter network changes to wrong-network and back via WatchWalletChanges', async () => {
    vi.mocked(freighter.isInstalled).mockResolvedValue(true);
    vi.mocked(freighter.requestAccessSafe).mockResolvedValue({ address: 'GTEST123' });
    vi.mocked(freighter.getNetworkPassphrase).mockResolvedValue('Test SDF Network ; September 2015');

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.state.type).toBe('connected');

    // Switch to public network (network mismatch)
    act(() => {
      mockWatchCallback!({
        address: 'GTEST123',
        network: 'PUBLIC',
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      });
    });

    expect(result.current.state.type).toBe('wrong-network');
    expect(result.current.address).toBe('GTEST123');

    // Switch back to testnet
    act(() => {
      mockWatchCallback!({
        address: 'GTEST123',
        network: 'TESTNET',
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
    });

    expect(result.current.state.type).toBe('connected');
  });

  it('cleans up watcher subscription on unmount', () => {
    const { unmount } = renderHook(() => useWallet(), { wrapper });
    expect(mockWatch).toHaveBeenCalled();

    unmount();

    expect(mockStop).toHaveBeenCalled();
  });

  it('exposes signTx helper and signs transaction successfully', async () => {
    vi.mocked(freighter.signTransactionSafe).mockResolvedValue({
      signedXdr: 'signed_envelope_xdr_data',
    });

    const { result } = renderHook(() => useWallet(), { wrapper });

    let signed: string = '';
    await act(async () => {
      signed = await result.current.signTx('raw_xdr', 'Test SDF Network ; September 2015');
    });

    expect(signed).toBe('signed_envelope_xdr_data');
    expect(freighter.signTransactionSafe).toHaveBeenCalledWith('raw_xdr', {
      networkPassphrase: 'Test SDF Network ; September 2015',
    });
  });

  it('throws error when signTx fails or returns no signed XDR', async () => {
    vi.mocked(freighter.signTransactionSafe).mockResolvedValue({
      signedXdr: '',
      error: 'User declined signature',
    });

    const { result } = renderHook(() => useWallet(), { wrapper });

    await expect(
      result.current.signTx('raw_xdr', 'Test SDF Network ; September 2015')
    ).rejects.toThrow('User declined signature');
  });

  it('guards all localStorage access with try/catch when storage throws', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: Access is denied');
    });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError: Access is denied');
    });

    vi.mocked(freighter.isInstalled).mockResolvedValue(true);
    vi.mocked(freighter.requestAccessSafe).mockResolvedValue({ address: 'GTEST123' });
    vi.mocked(freighter.getNetworkPassphrase).mockResolvedValue('Test SDF Network ; September 2015');

    const { result } = renderHook(() => useWallet(), { wrapper });

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state.type).toBe('connected');

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.state.type).toBe('disconnected');

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });
});
