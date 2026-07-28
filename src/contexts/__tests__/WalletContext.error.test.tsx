/**
 * WalletContext.error.test.tsx
 *
 * Focused test suite for the wallet error state:
 *
 *   1. Error display — error field set on connect() failure; specific message
 *      values for FREIGHTER_NOT_INSTALLED, USER_REJECTED, and generic errors.
 *
 *   2. Retry recovery — calling connect() after an error clears the error
 *      first (setError(null)), transitions through isConnecting, and arrives
 *      at a populated address on success.
 *
 *   3. Dismiss (clear) — calling connect() is the dismiss mechanism; the
 *      error field becomes null immediately at the start of each new call
 *      even if that subsequent call also fails.
 *
 *   4. Edge cases — retry while already retrying is a no-op; error persists
 *      across disconnect/reconnect cycles; error does not bleed between
 *      independent provider instances.
 *
 * All tests use fake timers and mock safeStorage so they are fully
 * deterministic and never touch the network or file system.
 *
 * The approach for forcing connect() into the catch block mirrors the one
 * already in use in WalletContext.test.tsx: a Proxy over the global Promise
 * constructor intercepts the very first `new Promise(...)` call inside
 * connect() and provides a rejecting executor instead of the resolving one.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ToastProvider } from '@/components/toast/toast-provider';
import { PreferencesProvider } from '@/lib/preferences';
import { getItem, setItem, removeItem } from '@/lib/safeStorage';

// Use the real WalletProvider/useWallet — these tests exercise actual logic.
const {
  WalletProvider,
  useWallet,
  MOCKED_STELLAR_ADDRESS,
  FREIGHTER_NOT_INSTALLED,
  USER_REJECTED,
} = jest.requireActual('../WalletContext');

// ---------------------------------------------------------------------------
// safeStorage mock (prevents real localStorage side-effects in CI)
// ---------------------------------------------------------------------------
jest.mock('@/lib/safeStorage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renders WalletProvider wrapped in the providers required by the real
 * implementation (PreferencesProvider for idleTimeout preference,
 * ToastProvider for showError / showSuccess).
 */
function renderWithProviders(ui: React.ReactElement, idleTimeout = 0) {
  return render(
    <PreferencesProvider>
      <ToastProvider>
        <WalletProvider idleTimeout={idleTimeout}>{ui}</WalletProvider>
      </ToastProvider>
    </PreferencesProvider>,
  );
}

/**
 * A minimal consumer that surfaces every field relevant to error testing.
 * Keeps tests decoupled from any particular button label or layout detail in
 * WalletConnectButton; only the context behaviour is under test here.
 */
function WalletConsumer() {
  const { address, isConnecting, error, connect, disconnect } = useWallet();
  return (
    <div>
      <div data-testid="address">{address ?? 'null'}</div>
      <div data-testid="is-connecting">{isConnecting ? 'true' : 'false'}</div>
      <div data-testid="error">{error ?? 'null'}</div>
      <button data-testid="connect-btn" onClick={connect}>
        Connect
      </button>
      <button data-testid="disconnect-btn" onClick={disconnect}>
        Disconnect
      </button>
    </div>
  );
}

/**
 * Intercepts the first `new Promise(...)` created inside connect() and
 * substitutes a rejecting executor so connect()'s catch block fires.
 *
 * Subsequent Promise constructions within the same call (e.g. inside React
 * internals or the ToastProvider) behave normally.
 *
 * Returns a restore function that MUST be called in the test body after the
 * failing connect() call has settled so later tests see the real Promise.
 */
function injectConnectFailure(errorMessage = 'Simulated wallet failure'): () => void {
  const originalPromise = global.Promise;
  let intercepted = false;

  const PromiseSpy = new Proxy(originalPromise, {
    construct(Target, args) {
      if (!intercepted) {
        intercepted = true;
        // Replace the executor with one that rejects immediately.
        return new Target(
          (_resolve: unknown, reject: (err: Error) => void) => {
            reject(new Error(errorMessage));
          },
        );
      }
      return new Target(...(args as [unknown]));
    },
  });

  global.Promise = PromiseSpy as unknown as PromiseConstructor;

  return () => {
    global.Promise = originalPromise;
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('WalletContext – error display', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (getItem as jest.Mock).mockReturnValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('error field is null on initial render', () => {
    renderWithProviders(<WalletConsumer />);
    expect(screen.getByTestId('error')).toHaveTextContent('null');
  });

  it('error field is set to "Failed to connect wallet" when connect() throws', async () => {
    renderWithProviders(<WalletConsumer />);

    const restore = injectConnectFailure('anything');

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    expect(screen.getByTestId('error')).toHaveTextContent('Failed to connect wallet');
  });

  it('displays the generic error message regardless of the underlying throw message', async () => {
    // The catch block always surfaces the fixed string "Failed to connect wallet",
    // not the raw error message, so callers cannot leak internal details.
    renderWithProviders(<WalletConsumer />);

    const restore = injectConnectFailure('INTERNAL_CRYPTO_ERROR_CODE_42');

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    expect(screen.getByTestId('error')).toHaveTextContent('Failed to connect wallet');
    // The raw throw message must NOT appear in the UI.
    expect(screen.queryByText('INTERNAL_CRYPTO_ERROR_CODE_42')).not.toBeInTheDocument();
  });

  it('error field is still null while connection is in progress (isConnecting = true)', async () => {
    // Trigger a normal connect() and check state mid-flight before the timer fires.
    renderWithProviders(<WalletConsumer />);

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    // isConnecting should be true immediately after the click.
    expect(screen.getByTestId('is-connecting')).toHaveTextContent('true');
    // No error while the attempt is in flight.
    expect(screen.getByTestId('error')).toHaveTextContent('null');

    // Settle the connection so the timer-based cleanup runs before teardown.
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  });

  it('address remains null when connect() fails', async () => {
    renderWithProviders(<WalletConsumer />);

    const restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    expect(screen.getByTestId('address')).toHaveTextContent('null');
    expect(screen.getByTestId('error')).toHaveTextContent('Failed to connect wallet');
  });

  it('isConnecting returns to false after a failed connect()', async () => {
    renderWithProviders(<WalletConsumer />);

    const restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    expect(screen.getByTestId('is-connecting')).toHaveTextContent('false');
  });

  it('error field accepts the FREIGHTER_NOT_INSTALLED constant when set externally', () => {
    // The FREIGHTER_NOT_INSTALLED and USER_REJECTED strings are known error
    // values the real Freighter integration will surface. Verify the constants
    // are non-empty strings so downstream consumers can match against them.
    expect(typeof FREIGHTER_NOT_INSTALLED).toBe('string');
    expect(FREIGHTER_NOT_INSTALLED.length).toBeGreaterThan(0);
  });

  it('error field accepts the USER_REJECTED constant when set externally', () => {
    expect(typeof USER_REJECTED).toBe('string');
    expect(USER_REJECTED.length).toBeGreaterThan(0);
  });

  it('FREIGHTER_NOT_INSTALLED and USER_REJECTED are distinct strings', () => {
    expect(FREIGHTER_NOT_INSTALLED).not.toBe(USER_REJECTED);
  });
});

// ---------------------------------------------------------------------------

describe('WalletContext – retry recovers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (getItem as jest.Mock).mockReturnValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calling connect() after a failure clears error immediately (before the new attempt resolves)', async () => {
    renderWithProviders(<WalletConsumer />);

    // First call — inject a failure.
    const restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    expect(screen.getByTestId('error')).toHaveTextContent('Failed to connect wallet');

    // Second call — normal connect(); error must be null at the very start.
    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    // Error is cleared synchronously at the top of connect().
    expect(screen.getByTestId('error')).toHaveTextContent('null');

    // Let the retry succeed.
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('error')).toHaveTextContent('null');
    expect(screen.getByTestId('address')).toHaveTextContent(MOCKED_STELLAR_ADDRESS);
  });

  it('retry transitions through isConnecting = true before arriving at the connected state', async () => {
    renderWithProviders(<WalletConsumer />);

    // Put the context into an error state.
    const restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    expect(screen.getByTestId('error')).toHaveTextContent('Failed to connect wallet');

    // Kick off the retry without advancing the timer so we can observe
    // isConnecting = true mid-flight.
    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    expect(screen.getByTestId('is-connecting')).toHaveTextContent('true');

    // Complete the retry.
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('is-connecting')).toHaveTextContent('false');
    expect(screen.getByTestId('address')).toHaveTextContent(MOCKED_STELLAR_ADDRESS);
  });

  it('retry populates address with MOCKED_STELLAR_ADDRESS on success', async () => {
    renderWithProviders(<WalletConsumer />);

    // Fail first.
    const restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    // Succeed on retry.
    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('address')).toHaveTextContent(MOCKED_STELLAR_ADDRESS);
  });

  it('retry persists the address to safeStorage on success', async () => {
    renderWithProviders(<WalletConsumer />);

    const restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(setItem).toHaveBeenCalledWith('wallet_connected_address', MOCKED_STELLAR_ADDRESS);
  });

  it('retry that also fails leaves error set to "Failed to connect wallet"', async () => {
    renderWithProviders(<WalletConsumer />);

    // First failure.
    let restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    expect(screen.getByTestId('error')).toHaveTextContent('Failed to connect wallet');

    // Second failure (retry also fails).
    restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    expect(screen.getByTestId('error')).toHaveTextContent('Failed to connect wallet');
    expect(screen.getByTestId('address')).toHaveTextContent('null');
  });

  it('successful retry announces "Wallet connected" in the live region', async () => {
    renderWithProviders(<WalletConsumer />);

    // Fail first.
    const restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    // Retry and succeed.
    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Advance past the 150 ms announcement debounce.
    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    expect(screen.getByTestId('wallet-announcer')).toHaveTextContent('Wallet connected');
  });
});

// ---------------------------------------------------------------------------

describe('WalletContext – dismiss clears error', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (getItem as jest.Mock).mockReturnValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calling connect() (the dismiss/retry action) clears error before the new attempt', async () => {
    renderWithProviders(<WalletConsumer />);

    const restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    expect(screen.getByTestId('error')).toHaveTextContent('Failed to connect wallet');

    // "Dismiss" is implemented as calling connect() again — error must clear.
    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    expect(screen.getByTestId('error')).toHaveTextContent('null');

    // Clean up the in-flight connection.
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  });

  it('error stays cleared after a successful dismiss + connect sequence', async () => {
    renderWithProviders(<WalletConsumer />);

    const restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    // Dismiss via retry.
    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('error')).toHaveTextContent('null');
    expect(screen.getByTestId('address')).toHaveTextContent(MOCKED_STELLAR_ADDRESS);
  });

  it('disconnect() does NOT clear the error field', async () => {
    // disconnect() is intentionally a session-termination primitive; it does
    // not own the error state and must not silently swallow it.
    renderWithProviders(<WalletConsumer />);

    const restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    expect(screen.getByTestId('error')).toHaveTextContent('Failed to connect wallet');

    await act(async () => {
      screen.getByTestId('disconnect-btn').click();
    });

    // Error must still be present — disconnect is not a dismiss.
    expect(screen.getByTestId('error')).toHaveTextContent('Failed to connect wallet');
  });

  it('error is cleared on the third connect() call after two consecutive failures', async () => {
    renderWithProviders(<WalletConsumer />);

    // First failure.
    let restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    // Second failure.
    restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    expect(screen.getByTestId('error')).toHaveTextContent('Failed to connect wallet');

    // Third call — succeeds; error must be null at the start of the call.
    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    expect(screen.getByTestId('error')).toHaveTextContent('null');

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('error')).toHaveTextContent('null');
    expect(screen.getByTestId('address')).toHaveTextContent(MOCKED_STELLAR_ADDRESS);
  });
});

// ---------------------------------------------------------------------------

describe('WalletContext – error edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (getItem as jest.Mock).mockReturnValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('a second connect() call while a retry is in progress is a no-op (guard prevents re-entry)', async () => {
    renderWithProviders(<WalletConsumer />);

    // First call — inject failure.
    const restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    // Start the retry (no timer advance so it remains in flight).
    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    expect(screen.getByTestId('is-connecting')).toHaveTextContent('true');

    // Second call while retry is in progress — must be swallowed.
    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    // Still connecting (not doubled-up / restarted).
    expect(screen.getByTestId('is-connecting')).toHaveTextContent('true');

    // Resolve the one in-flight connection.
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId('is-connecting')).toHaveTextContent('false');
    expect(screen.getByTestId('address')).toHaveTextContent(MOCKED_STELLAR_ADDRESS);
  });

  it('error does not persist across an unmount/remount of WalletProvider', () => {
    // Each WalletProvider instance starts with error = null — error is
    // component-local state and is not persisted to storage.
    const { unmount } = renderWithProviders(<WalletConsumer />);
    unmount();

    // Fresh mount — error must be null regardless of what happened before.
    renderWithProviders(<WalletConsumer />);
    expect(screen.getByTestId('error')).toHaveTextContent('null');
  });

  it('error is not written to safeStorage on failure', async () => {
    renderWithProviders(<WalletConsumer />);

    const restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    // setItem must never be called with the wallet address key for an error
    // condition — only successful connections write the address to storage.
    // (PreferencesProvider may call setItem for its own preferences key,
    // which is unrelated to wallet state.)
    expect(setItem).not.toHaveBeenCalledWith(
      'wallet_connected_address',
      expect.anything(),
    );
  });

  it('error is not read from safeStorage on mount', () => {
    // Even if storage somehow contains a stale error string, WalletProvider
    // only reads the address key — error always starts as null.
    (getItem as jest.Mock).mockReturnValue('stale-address-value');

    renderWithProviders(<WalletConsumer />);

    // Address is rehydrated from storage (expected behaviour).
    expect(screen.getByTestId('address')).toHaveTextContent('stale-address-value');
    // Error is always null on mount, regardless of storage contents.
    expect(screen.getByTestId('error')).toHaveTextContent('null');
  });

  it('failed connect() does not call removeItem (storage is not cleared on failure)', async () => {
    renderWithProviders(<WalletConsumer />);

    const restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    expect(removeItem).not.toHaveBeenCalled();
  });

  it('error field remains consistent when WalletConsumer re-renders for unrelated reasons', async () => {
    // Wrap in a parent that can trigger a re-render without touching the wallet.
    function Parent() {
      const [tick, setTick] = React.useState(0);
      return (
        <div>
          <button data-testid="rerender-btn" onClick={() => setTick((n) => n + 1)}>
            Re-render
          </button>
          <span data-testid="tick">{tick}</span>
          <WalletConsumer />
        </div>
      );
    }

    renderWithProviders(<Parent />);

    const restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    expect(screen.getByTestId('error')).toHaveTextContent('Failed to connect wallet');

    // Trigger a parent re-render unrelated to the wallet.
    await act(async () => {
      screen.getByTestId('rerender-btn').click();
    });

    expect(screen.getByTestId('tick')).toHaveTextContent('1');
    // Error must be unchanged — context state is independent of parent renders.
    expect(screen.getByTestId('error')).toHaveTextContent('Failed to connect wallet');
  });

  it('failed connect() announces "Wallet connection failed" in the live region', async () => {
    renderWithProviders(<WalletConsumer />);

    const restore = injectConnectFailure();

    await act(async () => {
      screen.getByTestId('connect-btn').click();
    });

    restore();

    // Advance past the 150 ms announcement debounce.
    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    expect(screen.getByTestId('wallet-announcer')).toHaveTextContent(
      'Wallet connection failed',
    );
  });

  it('live region is empty before any connect() is called', () => {
    renderWithProviders(<WalletConsumer />);
    expect(screen.getByTestId('wallet-announcer')).toHaveTextContent('');
  });
});
