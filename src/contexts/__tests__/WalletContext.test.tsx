// src/contexts/__tests__/WalletContext.test.tsx
// Import React and testing utilities
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WalletProvider, useWallet, MOCKED_STELLAR_ADDRESS } from '../WalletContext';
import { isValidStellarAddress } from '@/lib/stellarAddress';
import { render, act, screen } from '@testing-library/react';
import { ToastProvider } from '@/components/toast/toast-provider';
import { resetCache } from '@/lib/safeStorage';
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

describe('WalletContext persistence', () => {
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
    delete (global as Record<string, unknown>).requestAccess;
    jest.useRealTimers();
  });

  describe('connect()', () => {
    it('sets isConnecting to true initially and resolves with address', async () => {
      renderWithProviders(<WalletConsumer />);

      const connectBtn = screen.getByTestId('connect-btn');
      expect(screen.getByTestId('is-connecting')).toHaveTextContent('Not connecting');
      expect(screen.getByTestId('address')).toHaveTextContent('No address');

      await act(async () => {
        connectBtn.click();
      });

      // isConnecting should be true immediately after click
      expect(screen.getByTestId('is-connecting')).toHaveTextContent('Connecting');

      // Fast-forward time to resolve the simulated delay
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      // After delay, address should be set and isConnecting should be false
      expect(screen.getByTestId('address')).toHaveTextContent(MOCKED_STELLAR_ADDRESS);
      expect(screen.getByTestId('is-connecting')).toHaveTextContent('Not connecting');
    });

    it('sets a valid Stellar G-address that passes isValidStellarAddress', async () => {
      renderWithProviders(<WalletConsumer />);

      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      expect(isValidStellarAddress(screen.getByTestId('address').textContent)).toBe(true);
    });
  });

  describe('disconnect()', () => {
    it('clears the address', async () => {
      renderWithProviders(<WalletConsumer />);

      const connectBtn = screen.getByTestId('connect-btn');
      const disconnectBtn = screen.getByTestId('disconnect-btn');

      // Connect first
      await act(async () => {
        connectBtn.click();
      });

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      expect(screen.getByTestId('address')).toHaveTextContent(MOCKED_STELLAR_ADDRESS);

      // Disconnect
      await act(async () => {
        disconnectBtn.click();
      });

      expect(screen.getByTestId('address')).toHaveTextContent('No address');
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
      MOCK_ADDRESS
    );
  });

  describe('Idle auto-disconnect', () => {
    const IDLE_TIMEOUT = 5000;

    it('automatically disconnects after idle period', async () => {
      renderWithProviders(<WalletConsumer />, IDLE_TIMEOUT);

      // Connect first
      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByTestId('address')).toHaveTextContent(MOCKED_STELLAR_ADDRESS);

      // Advance time by IDLE_TIMEOUT
      await act(async () => {
        jest.advanceTimersByTime(IDLE_TIMEOUT);
      });

      // Should be disconnected
      expect(screen.getByTestId('address')).toHaveTextContent('No address');
      expect(screen.getByRole('status')).toHaveTextContent('Session expired');
    });

    it('resets the timer on user activity', async () => {
      renderWithProviders(<WalletConsumer />, IDLE_TIMEOUT);

      // Connect first
      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      // Advance time by half IDLE_TIMEOUT
      await act(async () => {
        jest.advanceTimersByTime(IDLE_TIMEOUT / 2);
      });

      // Simulate activity
      await act(async () => {
        fireEvent.pointerMove(window);
      });

      // Advance time by another half IDLE_TIMEOUT
      await act(async () => {
        jest.advanceTimersByTime(IDLE_TIMEOUT / 2);
      });

      // Should still be connected because timer was reset
      expect(screen.getByTestId('address')).toHaveTextContent(MOCKED_STELLAR_ADDRESS);

      // Advance time by full IDLE_TIMEOUT from activity
      await act(async () => {
        jest.advanceTimersByTime(IDLE_TIMEOUT / 2);
      });

      // Now it should be disconnected
      expect(screen.getByTestId('address')).toHaveTextContent('No address');
    });

    it('does not disconnect if idleTimeout is 0', async () => {
      renderWithProviders(<WalletConsumer />, 0);

      // Connect first
      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      // Advance time by a long period
      await act(async () => {
        jest.advanceTimersByTime(100000);
      });

      // Should still be connected
      expect(screen.getByTestId('address')).toHaveTextContent(MOCKED_STELLAR_ADDRESS);
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
