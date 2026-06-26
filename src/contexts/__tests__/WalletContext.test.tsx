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
    act(() => {
      jest.runOnlyPendingTimers();
    });
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

  /**
   * WalletProvider Idle Auto-Disconnect Test Scenarios
   * 
   * 1. Expiry: The wallet should automatically disconnect and trigger a "Session expired"
   *    toast status announcement after the specified idleTimeout duration is exceeded without activity.
   * 2. Reset on Activity: Triggering user activity events (pointermove, keydown, visibilitychange,
   *    mousedown, touchstart) should reset the inactivity timer and prevent disconnection.
   * 3. Disabled Timeout (idleTimeout = 0): If idleTimeout is set to 0 or less, the auto-disconnect
   *    timer and activity listeners are disabled.
   * 4. Cleanup on Unmount: All registered window event listeners and the active setTimeout timer
   *    must be cleaned up when the WalletProvider is unmounted.
   * 5. Cleanup on idleTimeout Transition: When idleTimeout dynamically changes to 0 or less,
   *    all registered window event listeners must be removed and active timers cleared.
   */
  describe('Idle auto-disconnect', () => {
    const IDLE_TIMEOUT = 5000;

    /**
     * Scenario 1: Expiry
     * Verifies that the wallet automatically disconnects after the idle timeout
     * period and triggers a "Session expired" toast with proper a11y announcements.
     */
    it('automatically disconnects after idle period and triggers an accessible toast', async () => {
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

      // Assert the visible toast (using role status/alert)
      expect(screen.getByRole('status')).toHaveTextContent('Session expired');

      // Validate a11y: Assert the screen-reader-only polite toast announcement region
      const politeAnnouncer = document.querySelector('[aria-live="polite"]');
      expect(politeAnnouncer).toBeInTheDocument();
      expect(politeAnnouncer).toHaveTextContent('Session expired. You have been disconnected due to inactivity.');
    });

    /**
     * Scenario 2: Reset on user activity
     * Asserts that simulated activity on any of the registered events resets the timer
     * and prevents automatic disconnection.
     */
    const activityEvents = [
      { name: 'pointermove', fire: () => fireEvent.pointerMove(window) },
      { name: 'keydown', fire: () => fireEvent.keyDown(window) },
      { name: 'visibilitychange', fire: () => fireEvent(window, new Event('visibilitychange')) },
      { name: 'mousedown', fire: () => fireEvent.mouseDown(window) },
      { name: 'touchstart', fire: () => fireEvent.touchStart(window) }
    ];

    activityEvents.forEach(({ name, fire }) => {
      it(`resets the timer and prevents disconnect on ${name} activity`, async () => {
        renderWithProviders(<WalletConsumer />, IDLE_TIMEOUT);

        // Connect first
        await act(async () => {
          screen.getByTestId('connect-btn').click();
        });
        await act(async () => {
          jest.advanceTimersByTime(1000);
        });

        // Advance time by half of IDLE_TIMEOUT
        await act(async () => {
          jest.advanceTimersByTime(IDLE_TIMEOUT / 2);
        });

        // Simulate activity for the event
        await act(async () => {
          fire();
        });

        // Advance time by another half of IDLE_TIMEOUT (if no reset, it would expire now)
        await act(async () => {
          jest.advanceTimersByTime(IDLE_TIMEOUT / 2);
        });

        // Should still be connected because timer was reset
        expect(screen.getByTestId('address')).toHaveTextContent('0x71C7656EC7ab88b098defB751B7401B5f6d8976F');

        // Advance time by full IDLE_TIMEOUT from activity to verify it eventually disconnects
        await act(async () => {
          jest.advanceTimersByTime(IDLE_TIMEOUT / 2);
        });

        // Now it should be disconnected
        expect(screen.getByTestId('address')).toHaveTextContent('No address');
      });
    });

    /**
     * Scenario 3: Disabled timeout (idleTimeout is 0)
     * Asserts that the wallet does not disconnect and no activity event listeners are
     * registered if idleTimeout is set to 0.
     */
    it('does not disconnect and does not register listeners if idleTimeout is 0', async () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      
      renderWithProviders(<WalletConsumer />, 0);

      // Connect first
      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      // No activity listeners should have been added for the window
      const events = ['pointermove', 'keydown', 'visibilitychange', 'mousedown', 'touchstart'];
      events.forEach(event => {
        expect(addEventListenerSpy).not.toHaveBeenCalledWith(event, expect.any(Function), expect.any(Object));
      });

      // Advance time by a long period
      await act(async () => {
        jest.advanceTimersByTime(100000);
      });

      // Should still be connected
      expect(screen.getByTestId('address')).toHaveTextContent('0x71C7656EC7ab88b098defB751B7401B5f6d8976F');
      
      addEventListenerSpy.mockRestore();
    });

    /**
     * Scenario 4: Cleanup on unmount
     * Verifies that all 5 registered activity event listeners are removed on unmount.
     */
    it('cleans up all 5 event listeners on unmount', async () => {
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
      
      const events = ['pointermove', 'keydown', 'visibilitychange', 'mousedown', 'touchstart'];
      events.forEach(event => {
        expect(removeEventListenerSpy).toHaveBeenCalledWith(event, expect.any(Function));
      });
      
      removeEventListenerSpy.mockRestore();
    });

    /**
     * Scenario 5: Cleanup on idleTimeout transition
     * Verifies that dynamically setting idleTimeout to 0 cleans up listeners and timers.
     */
    it('cleans up listeners and timer when idleTimeout transitions to 0', async () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      
      const { rerender } = render(
        <PreferencesProvider>
          <ToastProvider>
            <WalletProvider idleTimeout={IDLE_TIMEOUT}>
              <WalletConsumer />
            </WalletProvider>
          </ToastProvider>
        </PreferencesProvider>
      );

      // Connect first to add listeners
      await act(async () => {
        screen.getByTestId('connect-btn').click();
      });
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });

      // Clear addEventListenerSpy calls so we can count new calls
      addEventListenerSpy.mockClear();

      // Now rerender with idleTimeout = 0
      await act(async () => {
        rerender(
          <PreferencesProvider>
            <ToastProvider>
              <WalletProvider idleTimeout={0}>
                <WalletConsumer />
              </WalletProvider>
            </ToastProvider>
          </PreferencesProvider>
        );
      });

      // Check that all 5 listeners were removed
      const events = ['pointermove', 'keydown', 'visibilitychange', 'mousedown', 'touchstart'];
      events.forEach(event => {
        expect(removeEventListenerSpy).toHaveBeenCalledWith(event, expect.any(Function));
      });

      // And no new listeners were added
      events.forEach(event => {
        expect(addEventListenerSpy).not.toHaveBeenCalledWith(event, expect.any(Function), expect.any(Object));
      });

      // Advance time by a long period to verify it does not disconnect
      await act(async () => {
        jest.advanceTimersByTime(100000);
      });
      expect(screen.getByTestId('address')).toHaveTextContent('0x71C7656EC7ab88b098defB751B7401B5f6d8976F');

      removeEventListenerSpy.mockRestore();
      addEventListenerSpy.mockRestore();
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
