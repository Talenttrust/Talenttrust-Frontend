// src/contexts/__tests__/WalletContext.test.tsx
// Import React and testing utilities
import React from 'react';
import { render, act, screen } from '@testing-library/react';
import { ToastProvider } from '@/components/toast/toast-provider';
// Ensure we get the real implementation of WalletContext, bypassing any prior mocks
const { WalletProvider, useWallet } = jest.requireActual('@/contexts/WalletContext');

jest.mock('@/lib/safeStorage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('@stellar/freighter-api', () => ({
  requestAccess: jest.fn(),
}));
import { requestAccess } from '@stellar/freighter-api';

const MockComponent = () => {
  const { address, connect, disconnect } = useWallet();
  return (
    <div>
      <span data-testid="address">{address ?? 'null'}</span>
      <button onClick={connect}>Connect</button>
      <button onClick={disconnect}>Disconnect</button>
    </div>
  );
};

describe('WalletContext persistence', () => {
  const { getItem, setItem, removeItem } = require('@/lib/safeStorage');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    localStorage.clear();
    (requestAccess as jest.Mock).mockReset();
    (requestAccess as jest.Mock).mockResolvedValue({ address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' });
    Object.defineProperty(window, 'freighter', {
      value: {},
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('rehydrates address from safeStorage on mount', () => {
    (getItem as jest.Mock).mockReturnValue('0xABC');
    render(
      <WalletProvider idleTimeout={0}>
        <MockComponent />
      </WalletProvider>
    );
    expect(screen.getByTestId('address')).toHaveTextContent('0xABC');
    expect(getItem).toHaveBeenCalledWith('wallet_connected_address');
  });

  test('connect stores address in safeStorage', async () => {
    (getItem as jest.Mock).mockReturnValue(null);
    render(
      <WalletProvider idleTimeout={0}>
        <MockComponent />
      </WalletProvider>
    );
    act(() => {
      screen.getByText('Connect').click();
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('address')).toHaveTextContent(
      '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
    );
    expect(setItem).toHaveBeenCalledWith(
      'wallet_connected_address',
      '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
    );
  });

  test('disconnect clears address from safeStorage', async () => {
    (getItem as jest.Mock).mockReturnValue(null);
    render(
      <WalletProvider idleTimeout={0}>
        <MockComponent />
      </WalletProvider>
    );
    act(() => {
      screen.getByText('Connect').click();
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    act(() => {
      screen.getByText('Disconnect').click();
    });
    expect(screen.getByTestId('address')).toHaveTextContent('null');
    expect(removeItem).toHaveBeenCalledWith('wallet_connected_address');
  });

  test('idle timeout disconnects and clears storage', async () => {
    (getItem as jest.Mock).mockReturnValue(null);
    render(
      <ToastProvider>
        <WalletProvider idleTimeout={2000}>
          <MockComponent />
        </WalletProvider>
      </ToastProvider>
    );
    act(() => {
      screen.getByText('Connect').click();
    });
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('address')).toHaveTextContent('null');
    expect(removeItem).toHaveBeenCalledWith('wallet_connected_address');
  });
});
