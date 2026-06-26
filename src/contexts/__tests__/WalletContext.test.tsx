import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WalletProvider, useWallet, FREIGHTER_NOT_INSTALLED, USER_REJECTED } from '../WalletContext';
import { ToastProvider } from '@/components/toast/toast-provider';
import { PreferencesProvider } from '@/lib/preferences';
import { resetCache } from '@/lib/safeStorage';

// Remove the global mock for this test file
jest.unmock('@/contexts/WalletContext');

// Mock Freighter API
jest.mock('@stellar/freighter-api', () => ({
  requestAccess: jest.fn(),
}));

import { requestAccess } from '@stellar/freighter-api';

const STORAGE_KEY = 'talenttrust-wallet-address';
const MOCK_STELLAR_ADDRESS = 'GDZES2J2CZOZ5WJX5WJX5WJX5WJX5WJX5WJX5WJX5WJX5WJX5WJX5WJX';

const mockRequestAccess = requestAccess as jest.Mock;

// Test consumer component
function WalletConsumer() {
  const { address, isConnecting, error, connect, disconnect } = useWallet();

  return (
    <div>
      <div data-testid="address">{address || 'No address'}</div>
      <div data-testid="is-connecting">{isConnecting ? 'Connecting' : 'Not connecting'}</div>
      <div data-testid="error">{error || 'No error'}</div>
      <button data-testid="connect-btn" onClick={connect}>Connect Wallet</button>
      <button data-testid="disconnect-btn" onClick={disconnect}>Disconnect Wallet</button>
    </div>
  );
}

const renderWithProviders = (ui: React.ReactElement, idleTimeout?: number) => {
  return render(
    <PreferencesProvider>
      <ToastProvider>
        <WalletProvider idleTimeout={idleTimeout}>
          {ui}
        </WalletProvider>
      </ToastProvider>
    </PreferencesProvider>
  );
};

describe('WalletContext', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetCache();
    localStorage.clear();
    mockRequestAccess.mockReset();
    Object.defineProperty(window, 'freighter', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    try {
      act(() => {
        jest.runOnlyPendingTimers();
      });
    } catch {
      // Ignore if timers are not faked (e.g. rehydration tests)
    }
    jest.useRealTimers();
  });

  describe('connect()', () => {
    it('connects successfully with Freighter', async () => {
      mockRequestAccess.mockResolvedValue({ address: MOCK_STELLAR_ADDRESS });

      renderWithProviders(<WalletConsumer />);

      expect(screen.getByTestId('address')).toHaveTextContent('No address');
      expect(screen.getByTestId('is-connecting')).toHaveTextContent('Not connecting');

      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });

      expect(screen.getByTestId('address')).toHaveTextContent(MOCK_STELLAR_ADDRESS);
      expect(screen.getByTestId('is-connecting')).toHaveTextContent('Not connecting');
      expect(screen.getByTestId('error')).toHaveTextContent('No error');
      expect(localStorage.getItem(STORAGE_KEY)).toBe(MOCK_STELLAR_ADDRESS);
    });

    it('sets isConnecting during the connect process', async () => {
      let resolvePromise: (value: { address: string }) => void;
      const connectPromise = new Promise<{ address: string }>((resolve) => {
        resolvePromise = resolve;
      });
      mockRequestAccess.mockReturnValue(connectPromise);

      renderWithProviders(<WalletConsumer />);

      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });

      expect(screen.getByTestId('is-connecting')).toHaveTextContent('Connecting');

      await act(async () => {
        resolvePromise!({ address: MOCK_STELLAR_ADDRESS });
      });

      expect(screen.getByTestId('is-connecting')).toHaveTextContent('Not connecting');
      expect(screen.getByTestId('address')).toHaveTextContent(MOCK_STELLAR_ADDRESS);
    });

    it('shows error when Freighter is not installed', async () => {
      Object.defineProperty(window, 'freighter', { value: false });

      renderWithProviders(<WalletConsumer />);

      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });

      expect(screen.getByTestId('error')).toHaveTextContent(FREIGHTER_NOT_INSTALLED);
      expect(screen.getByTestId('address')).toHaveTextContent('No address');
      expect(screen.getByTestId('is-connecting')).toHaveTextContent('Not connecting');
      expect(mockRequestAccess).not.toHaveBeenCalled();
    });

    it('shows error when window.freighter is undefined', async () => {
      Object.defineProperty(window, 'freighter', { value: undefined });

      renderWithProviders(<WalletConsumer />);

      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });

      expect(screen.getByTestId('error')).toHaveTextContent(FREIGHTER_NOT_INSTALLED);
      expect(mockRequestAccess).not.toHaveBeenCalled();
    });

    it('shows error when user rejects connection', async () => {
      mockRequestAccess.mockResolvedValue({ address: '', error: { code: -1, message: 'User rejected' } });

      renderWithProviders(<WalletConsumer />);

      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });

      expect(screen.getByTestId('error')).toHaveTextContent(USER_REJECTED);
      expect(screen.getByTestId('address')).toHaveTextContent('No address');
      expect(screen.getByTestId('is-connecting')).toHaveTextContent('Not connecting');
    });

    it('shows error when requestAccess returns empty address without error', async () => {
      mockRequestAccess.mockResolvedValue({ address: '' });

      renderWithProviders(<WalletConsumer />);

      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });

      expect(screen.getByTestId('error')).toHaveTextContent(USER_REJECTED);
    });

    it('resets error on a new connect() call', async () => {
      mockRequestAccess
        .mockRejectedValueOnce(new Error('Some error'))
        .mockResolvedValue({ address: MOCK_STELLAR_ADDRESS });

      renderWithProviders(<WalletConsumer />);

      // Failed attempt
      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });

      expect(screen.getByTestId('error')).toHaveTextContent('Some error');

      // Successful re-attempt - error should be cleared
      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });

      expect(screen.getByTestId('error')).toHaveTextContent('No error');
      expect(screen.getByTestId('address')).toHaveTextContent(MOCK_STELLAR_ADDRESS);
    });

    it('handles unexpected errors gracefully', async () => {
      mockRequestAccess.mockRejectedValue(new Error('Network failure'));

      renderWithProviders(<WalletConsumer />);

      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });

      expect(screen.getByTestId('error')).toHaveTextContent('Network failure');
    });
  });

  describe('disconnect()', () => {
    it('clears the address and localStorage', async () => {
      mockRequestAccess.mockResolvedValue({ address: MOCK_STELLAR_ADDRESS });

      renderWithProviders(<WalletConsumer />);

      // Connect first
      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });

      expect(screen.getByTestId('address')).toHaveTextContent(MOCK_STELLAR_ADDRESS);
      expect(localStorage.getItem(STORAGE_KEY)).toBe(MOCK_STELLAR_ADDRESS);

      // Disconnect
      await act(async () => {
        screen.getByTestId('disconnect-btn').click();
      });

      expect(screen.getByTestId('address')).toHaveTextContent('No address');
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('can be called when not connected without error', async () => {
      renderWithProviders(<WalletConsumer />);

      await act(async () => {
        screen.getByTestId('disconnect-btn').click();
      });

      expect(screen.getByTestId('address')).toHaveTextContent('No address');
    });
  });

  describe('localStorage rehydration', () => {
    beforeEach(() => {
      // Don't use fake timers for rehydration tests to avoid timing issues
      jest.useRealTimers();
    });

    it('rehydrates address from localStorage on mount', () => {
      localStorage.setItem(STORAGE_KEY, MOCK_STELLAR_ADDRESS);

      renderWithProviders(<WalletConsumer />);

      expect(screen.getByTestId('address')).toHaveTextContent(MOCK_STELLAR_ADDRESS);
    });

    it('shows no address when localStorage is empty', () => {
      renderWithProviders(<WalletConsumer />);

      expect(screen.getByTestId('address')).toHaveTextContent('No address');
    });

    it('does not show an error during rehydration', () => {
      localStorage.setItem(STORAGE_KEY, MOCK_STELLAR_ADDRESS);

      renderWithProviders(<WalletConsumer />);

      expect(screen.getByTestId('error')).toHaveTextContent('No error');
    });
  });

  describe('Idle auto-disconnect', () => {
    const IDLE_TIMEOUT = 5000;

    beforeEach(() => {
      mockRequestAccess.mockResolvedValue({ address: MOCK_STELLAR_ADDRESS });
    });

    it('automatically disconnects after idle period', async () => {
      renderWithProviders(<WalletConsumer />, IDLE_TIMEOUT);

      // Connect
      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });
      expect(screen.getByTestId('address')).toHaveTextContent(MOCK_STELLAR_ADDRESS);

      // Advance time by IDLE_TIMEOUT
      await act(async () => {
        jest.advanceTimersByTime(IDLE_TIMEOUT);
      });

      expect(screen.getByTestId('address')).toHaveTextContent('No address');
      expect(screen.getByRole('status')).toHaveTextContent('Session expired');
    });

    it('resets the timer on user activity', async () => {
      renderWithProviders(<WalletConsumer />, IDLE_TIMEOUT);

      // Connect
      await act(async () => {
        screen.getByTestId('connect-btn').click();
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
      expect(screen.getByTestId('address')).toHaveTextContent(MOCK_STELLAR_ADDRESS);

      // Advance time by full IDLE_TIMEOUT from activity
      await act(async () => {
        jest.advanceTimersByTime(IDLE_TIMEOUT);
      });

      // Now it should be disconnected
      expect(screen.getByTestId('address')).toHaveTextContent('No address');
    });

    it('does not disconnect if idleTimeout is 0', async () => {
      renderWithProviders(<WalletConsumer />, 0);

      // Connect
      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });

      // Advance time by a long period
      await act(async () => {
        jest.advanceTimersByTime(100000);
      });

      // Should still be connected
      expect(screen.getByTestId('address')).toHaveTextContent(MOCK_STELLAR_ADDRESS);
    });

    it('cleans up listeners and timer on unmount', async () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      const { unmount } = renderWithProviders(<WalletConsumer />, IDLE_TIMEOUT);

      // Connect first to trigger the effect that adds listeners
      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });

    it('clears localStorage on idle disconnect', async () => {
      renderWithProviders(<WalletConsumer />, IDLE_TIMEOUT);

      // Connect
      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });
      expect(localStorage.getItem(STORAGE_KEY)).toBe(MOCK_STELLAR_ADDRESS);

      // Advance time to trigger disconnect
      await act(async () => {
        jest.advanceTimersByTime(IDLE_TIMEOUT);
      });

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('useWallet() outside provider', () => {
    it('throws error when called outside WalletProvider', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();

      function ComponentWithoutProvider() {
        const successContent = <div>Should not render</div>;
        let content: React.ReactNode;
        try {
          useWallet();
          content = successContent;
        } catch (err) {
          content = <div data-testid="error-message">{(err as Error).message}</div>;
        }
        return <>{content}</>;
      }

      render(<ComponentWithoutProvider />);
      expect(screen.getByTestId('error-message')).toHaveTextContent('useWallet must be used within a WalletProvider');

      consoleError.mockRestore();
    });
  });
});
