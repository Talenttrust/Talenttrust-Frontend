import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { WalletProvider, useWallet } from './WalletProvider';
import * as freighter from '@/lib/stellar/freighter';
import * as network from '@/lib/stellar/network';

vi.mock('@/lib/stellar/freighter');
vi.mock('@/lib/stellar/network');

describe('WalletProvider reducer', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <WalletProvider>{children}</WalletProvider>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(network.expectedPassphrase).mockReturnValue('Test SDF Network ; September 2015');
  });

  it('transitions from disconnected to connecting on connect', async () => {
    vi.mocked(freighter.isInstalled).mockResolvedValue(true);
    vi.mocked(freighter.requestAccessSafe).mockResolvedValue({ address: 'GTEST123' });
    vi.mocked(freighter.getNetworkPassphrase).mockResolvedValue('Test SDF Network ; September 2015');

    const { result } = renderHook(() => useWallet(), { wrapper });

    expect(result.current.state.type).toBe('disconnected');

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state.type).toBe('connected');
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
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(result.current.state.type).toBe('connected');
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
});
