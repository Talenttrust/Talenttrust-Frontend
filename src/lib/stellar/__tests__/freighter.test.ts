import { afterEach, describe, expect, it, vi } from 'vitest';
import * as freighterApi from '@stellar/freighter-api';
import * as freighter from '../freighter';
import * as freighterWallet from '../freighterWallet';

vi.mock('@stellar/freighter-api', () => ({
  getAddress: vi.fn(),
  getNetworkDetails: vi.fn(),
  signTransaction: vi.fn(),
  isConnected: vi.fn(),
  getNetwork: vi.fn(),
  requestAccess: vi.fn(),
  isAllowed: vi.fn(),
}));

const api = vi.mocked(freighterApi);

describe('freighter adapter', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getAddress', () => {
    it('returns address string if present', async () => {
      api.getAddress.mockResolvedValue({ address: 'GABC' } as never);
      const result = await freighter.getAddress();
      expect(result).toBe('GABC');
    });
    it('returns null if not connected', async () => {
      api.getAddress.mockRejectedValue(new Error('not connected'));
      const result = await freighter.getAddress();
      expect(result).toBeNull();
    });
    it('handles address as string', async () => {
      api.getAddress.mockResolvedValue('GDEF' as never);
      const result = await freighter.getAddress();
      expect(result).toBe('GDEF');
    });
  });

  describe('getNetworkPassphrase', () => {
    it('returns passphrase if available', async () => {
      api.getNetworkDetails.mockResolvedValue({ networkPassphrase: 'foo' } as never);
      const result = await freighter.getNetworkPassphrase();
      expect(result).toBe('foo');
    });
    it('returns empty string on error', async () => {
      api.getNetworkDetails.mockRejectedValue(new Error('fail'));
      const result = await freighter.getNetworkPassphrase();
      expect(result).toBe('');
    });
  });

  describe('signTransaction', () => {
    it('returns signed XDR if present', async () => {
      api.signTransaction.mockResolvedValue({ signedTxXdr: 'xdr' } as never);
      const result = await freighter.signTransaction('x', { networkPassphrase: 'foo' });
      expect(result).toBe('xdr');
    });
    it('throws on empty signature', async () => {
      api.signTransaction.mockResolvedValue({} as never);
      await expect(freighter.signTransaction('x', { networkPassphrase: 'foo' })).rejects.toThrow(
        'empty signed transaction',
      );
    });

    it('propagates wallet signing errors', async () => {
      api.signTransaction.mockRejectedValue(new Error('User rejected'));
      await expect(freighter.signTransaction('x', { networkPassphrase: 'foo' })).rejects.toThrow(
        'User rejected',
      );
    });
  });
});

describe('freighterWallet SSR guards', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('avoids Freighter calls during SSR', async () => {
    vi.stubGlobal('window', undefined);

    expect(await freighterWallet.isInstalled()).toBe(false);
    expect(await freighterWallet.getAddressSafe()).toBe('');
    expect(await freighterWallet.getNetworkPassphrase()).toBe('');
    expect(await freighterWallet.requestAccessSafe()).toEqual({ address: '', error: 'SSR: window not available' });
    expect(await freighterWallet.signTransactionSafe('xdr')).toEqual({
      signedXdr: '',
      error: 'SSR: window not available',
    });
    expect(await freighterWallet.isAllowedSafe()).toBe(false);

    expect(api.isConnected).not.toHaveBeenCalled();
    expect(api.getAddress).not.toHaveBeenCalled();
    expect(api.getNetwork).not.toHaveBeenCalled();
    expect(api.requestAccess).not.toHaveBeenCalled();
    expect(api.signTransaction).not.toHaveBeenCalled();
    expect(api.isAllowed).not.toHaveBeenCalled();
  });
});
