import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WalletProvider, useWallet } from '../WalletContext';
import { ToastProvider } from '@/components/toast/toast-provider';
import { PreferencesProvider } from '@/lib/preferences';

// Remove the global mock for this test file
jest.unmock('@/contexts/WalletContext');

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
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
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
      expect(screen.getByTestId('address')).toHaveTextContent('0x71C7656EC7ab88b098defB751B7401B5f6d8976F');
      expect(screen.getByTestId('is-connecting')).toHaveTextContent('Not connecting');
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

      expect(screen.getByTestId('address')).toHaveTextContent('0x71C7656EC7ab88b098defB751B7401B5f6d8976F');

      // Disconnect
      await act(async () => {
        disconnectBtn.click();
      });

      expect(screen.getByTestId('address')).toHaveTextContent('No address');
    });

    it('resets error on a new connect() call', async () => {
      renderWithProviders(<WalletConsumer />);

      const connectBtn = screen.getByTestId('connect-btn');

      // Connect successfully
      await act(async () => {
        connectBtn.click();
      });

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      expect(screen.getByTestId('error')).toHaveTextContent('No error');

      // Connect again - error should still be cleared
      await act(async () => {
        connectBtn.click();
      });

      expect(screen.getByTestId('error')).toHaveTextContent('No error');

      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      expect(screen.getByTestId('error')).toHaveTextContent('No error');
    });
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
      expect(screen.getByTestId('address')).toHaveTextContent('0x71C7656EC7ab88b098defB751B7401B5f6d8976F');

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
      expect(screen.getByTestId('address')).toHaveTextContent('0x71C7656EC7ab88b098defB751B7401B5f6d8976F');

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
      expect(screen.getByTestId('address')).toHaveTextContent('0x71C7656EC7ab88b098defB751B7401B5f6d8976F');
    });

    it('cleans up listeners and timer on unmount', async () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      const { unmount } = renderWithProviders(<WalletConsumer />, IDLE_TIMEOUT);
      
      // Connect first to trigger the effect that adds listeners
      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      unmount();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      
      removeEventListenerSpy.mockRestore();
    });
  });

  describe('useWallet() outside provider', () => {
    it('throws error when called outside WalletProvider', () => {
      // Suppress console.error for this test
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
