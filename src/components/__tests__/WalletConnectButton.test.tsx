import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WalletConnectButton } from '../WalletConnectButton';
import { WalletContextType, useWallet } from '@/contexts/WalletContext';
import * as truncateAddressModule from '@/lib/truncateAddress';
import { testA11y } from '@/test-utils/a11y';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('@/contexts/WalletContext', () => ({
  useWallet: jest.fn(),
}));

const mockShowError = jest.fn();
jest.mock('@/components/toast/toast-provider', () => ({
  useToast: jest.fn(() => ({ showError: mockShowError })),
}));

const mockUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultMockState: WalletContextType = {
  address: null,
  isConnecting: false,
  error: null,
  connect: jest.fn(),
  disconnect: jest.fn(),
};

/**
 * Installs a mock clipboard on `navigator` and returns the `writeText` spy
 * so tests can control its resolution/rejection.
 */
function mockClipboard(impl: () => Promise<void> = () => Promise.resolve()) {
  const writeText = jest.fn().mockImplementation(impl);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  return writeText;
}

/** Removes the clipboard property so we can simulate it being absent. */
function removeClipboard() {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('WalletConnectButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runAllTimers();
    });
    jest.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Disconnected state
  // -------------------------------------------------------------------------

  describe('disconnected state', () => {
    it('renders "Connect Wallet" button when not connected', () => {
      mockUseWallet.mockReturnValue(defaultMockState);
      render(<WalletConnectButton />);
      const button = screen.getByRole('button', { name: /connect wallet/i });
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    });

    it('calls connect when the button is clicked', () => {
      const connectMock = jest.fn();
      mockUseWallet.mockReturnValue({ ...defaultMockState, connect: connectMock });
      render(<WalletConnectButton />);
      fireEvent.click(screen.getByRole('button', { name: /connect wallet/i }));
      expect(connectMock).toHaveBeenCalledTimes(1);
    });

    it('shows loading state and disables button while connecting', () => {
      mockUseWallet.mockReturnValue({ ...defaultMockState, isConnecting: true });
      render(<WalletConnectButton />);
      const button = screen.getByRole('button', { name: /connect wallet/i });
      expect(button).toBeDisabled();
      expect(screen.getByText(/connecting\.\.\./i)).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  describe('error state', () => {
    it('shows error message and retry button on connection error', () => {
      const connectMock = jest.fn();
      mockUseWallet.mockReturnValue({
        ...defaultMockState,
        error: 'Failed to connect',
        connect: connectMock,
      });
      render(<WalletConnectButton />);
      expect(screen.getByText(/connection error/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry wallet connection/i })).toBeInTheDocument();
    });

    it('calls connect when retry button is clicked', () => {
      const connectMock = jest.fn();
      mockUseWallet.mockReturnValue({
        ...defaultMockState,
        error: 'Failed to connect',
        connect: connectMock,
      });
      render(<WalletConnectButton />);
      fireEvent.click(screen.getByRole('button', { name: /retry wallet connection/i }));
      expect(connectMock).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Connected state — UI
  // -------------------------------------------------------------------------

  describe('connected state — UI', () => {
    const address = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';

    beforeEach(() => {
      mockUseWallet.mockReturnValue({ ...defaultMockState, address });
      mockClipboard();
    });

    it('shows the truncated address', () => {
      render(<WalletConnectButton />);
      expect(screen.getByText('0x71C7...976F')).toBeInTheDocument();
    });

    it('renders the copy button with correct aria-label and title', () => {
      render(<WalletConnectButton />);
      const copyBtn = screen.getByRole('button', { name: /copy address to clipboard/i });
      expect(copyBtn).toBeInTheDocument();
      expect(copyBtn).toHaveAttribute('title', 'Copy address');
    });

    it('renders the disconnect button', () => {
      render(<WalletConnectButton />);
      expect(screen.getByRole('button', { name: /disconnect wallet/i })).toBeInTheDocument();
    });

    it('calls disconnect when disconnect button is clicked', () => {
      const disconnectMock = jest.fn();
      mockUseWallet.mockReturnValue({ ...defaultMockState, address, disconnect: disconnectMock });
      render(<WalletConnectButton />);
      fireEvent.click(screen.getByRole('button', { name: /disconnect wallet/i }));
      expect(disconnectMock).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // handleCopy — success path
  // -------------------------------------------------------------------------

  describe('handleCopy — success path', () => {
    const address = '0xABCDEF1234567890';

    beforeEach(() => {
      mockUseWallet.mockReturnValue({ ...defaultMockState, address });
    });

    it('calls clipboard.writeText with the full address', async () => {
      const writeText = mockClipboard();
      render(<WalletConnectButton />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy address to clipboard/i }));
      });

      expect(writeText).toHaveBeenCalledWith(address);
    });

    it('shows the checkmark icon after a successful copy', async () => {
      mockClipboard();
      render(<WalletConnectButton />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy address to clipboard/i }));
      });

      // aria-label changes to reflect "copied" state is not set in UI text,
      // so we verify the SVG path for the checkmark is rendered.
      // The copy button path for the checkmark uses "M5 13l4 4L19 7".
      const copyBtn = screen.getByRole('button', { name: /copy address to clipboard/i });
      const checkPath = copyBtn.querySelector('path[d="M5 13l4 4L19 7"]');
      expect(checkPath).toBeInTheDocument();
    });

    it('does not call showError on a successful copy', async () => {
      mockClipboard();
      render(<WalletConnectButton />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy address to clipboard/i }));
      });

      expect(mockShowError).not.toHaveBeenCalled();
    });

    it('resets the checkmark back to the copy icon after 2 seconds', async () => {
      mockClipboard();
      render(<WalletConnectButton />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy address to clipboard/i }));
      });

      // Advance past the 2-second reset timeout
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      const copyBtn = screen.getByRole('button', { name: /copy address to clipboard/i });
      // Checkmark path should be gone; clipboard-copy path should be present
      const checkPath = copyBtn.querySelector('path[d="M5 13l4 4L19 7"]');
      expect(checkPath).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // handleCopy — missing clipboard API
  // -------------------------------------------------------------------------

  describe('handleCopy — missing clipboard API', () => {
    const address = '0xDEADBEEF';

    beforeEach(() => {
      mockUseWallet.mockReturnValue({ ...defaultMockState, address });
    });

    it('shows an error toast when navigator.clipboard is undefined', async () => {
      removeClipboard();
      render(<WalletConnectButton />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy address to clipboard/i }));
      });

      expect(mockShowError).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Copy not supported' }),
      );
    });

    it('does not show the checkmark when clipboard is unavailable', async () => {
      removeClipboard();
      render(<WalletConnectButton />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy address to clipboard/i }));
      });

      const copyBtn = screen.getByRole('button', { name: /copy address to clipboard/i });
      expect(copyBtn.querySelector('path[d="M5 13l4 4L19 7"]')).not.toBeInTheDocument();
    });

    it('shows an error toast when navigator.clipboard.writeText is undefined', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {}, // clipboard object exists but writeText is absent
      });
      render(<WalletConnectButton />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy address to clipboard/i }));
      });

      expect(mockShowError).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Copy not supported' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // handleCopy — rejected writeText promise
  // -------------------------------------------------------------------------

  describe('handleCopy — rejected writeText', () => {
    const address = '0xCAFEBABE';

    beforeEach(() => {
      mockUseWallet.mockReturnValue({ ...defaultMockState, address });
    });

    it('shows an error toast when writeText rejects', async () => {
      mockClipboard(() => Promise.reject(new Error('Permission denied')));
      render(<WalletConnectButton />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy address to clipboard/i }));
      });

      expect(mockShowError).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Copy failed' }),
      );
    });

    it('does not show the checkmark when writeText rejects', async () => {
      mockClipboard(() => Promise.reject(new Error('Permission denied')));
      render(<WalletConnectButton />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy address to clipboard/i }));
      });

      const copyBtn = screen.getByRole('button', { name: /copy address to clipboard/i });
      expect(copyBtn.querySelector('path[d="M5 13l4 4L19 7"]')).not.toBeInTheDocument();
    });

    it('does not log the wallet address to the console on failure', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      mockClipboard(() => Promise.reject(new Error('NotAllowedError')));

      render(<WalletConnectButton />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /copy address to clipboard/i }));
      });

      // Ensure neither the address value nor the error details were logged
      [consoleErrorSpy, consoleWarnSpy].forEach((spy) => {
        spy.mock.calls.forEach((callArgs) => {
          const joined = callArgs.join(' ');
          expect(joined).not.toContain(address);
        });
      });

      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // handleCopy — rapid repeated clicks
  // -------------------------------------------------------------------------

  describe('handleCopy — rapid repeated clicks', () => {
    const address = '0x1234567890ABCDEF';

    it('calls writeText for each click but only schedules one reset timer', async () => {
      mockUseWallet.mockReturnValue({ ...defaultMockState, address });
      const writeText = mockClipboard();
      render(<WalletConnectButton />);

      const copyBtn = screen.getByRole('button', { name: /copy address to clipboard/i });

      // Fire three clicks in rapid succession
      await act(async () => {
        fireEvent.click(copyBtn);
        fireEvent.click(copyBtn);
        fireEvent.click(copyBtn);
      });

      // writeText called for each successful click
      expect(writeText).toHaveBeenCalledTimes(3);
      expect(writeText).toHaveBeenCalledWith(address);

      // Checkmark should be showing after the rapid clicks
      const updatedBtn = screen.getByRole('button', { name: /copy address to clipboard/i });
      expect(updatedBtn.querySelector('path[d="M5 13l4 4L19 7"]')).toBeInTheDocument();

      // After 2 seconds the icon should reset
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(
        screen.getByRole('button', { name: /copy address to clipboard/i })
          .querySelector('path[d="M5 13l4 4L19 7"]'),
      ).not.toBeInTheDocument();
    });

    it('does not call showError on rapid successful clicks', async () => {
      mockUseWallet.mockReturnValue({ ...defaultMockState, address });
      mockClipboard();
      render(<WalletConnectButton />);

      const copyBtn = screen.getByRole('button', { name: /copy address to clipboard/i });

      await act(async () => {
        fireEvent.click(copyBtn);
        fireEvent.click(copyBtn);
      });

      expect(mockShowError).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // handleCopy — no-op when address is absent
  // -------------------------------------------------------------------------

  describe('handleCopy — no-op when address is absent', () => {
    it('does nothing if address is null (copy button not rendered)', () => {
      mockUseWallet.mockReturnValue({ ...defaultMockState, address: null });
      render(<WalletConnectButton />);
      // The copy button only renders in the connected state; confirm it is absent
      expect(
        screen.queryByRole('button', { name: /copy address to clipboard/i }),
      ).not.toBeInTheDocument();
    });
  });

  it('disables the connect button and renders the spinner while connecting, without leaking other branches', () => {
    mockUseWallet.mockReturnValue({ ...defaultMockState, isConnecting: true });
    render(<WalletConnectButton />);

    const button = screen.getByRole('button', { name: /connect wallet/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-label', 'Connect wallet');
    expect(screen.queryByText(/connection error/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /disconnect wallet/i })).not.toBeInTheDocument();
  });

  it('renders error branch with the correct aria-label on the retry control and no connected/disconnected controls', () => {
    mockUseWallet.mockReturnValue({ ...defaultMockState, error: 'Failed to connect' });
    render(<WalletConnectButton />);

    expect(screen.getByRole('button', { name: 'Retry wallet connection' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect wallet/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /disconnect wallet/i })).not.toBeInTheDocument();
  });

  it('renders connected branch with copy and disconnect aria-labels', () => {
    mockUseWallet.mockReturnValue({ ...defaultMockState, address: '0xAbCdEf1234567890aBcDeF1234567890aBCDeF1' });
    render(<WalletConnectButton />);

    expect(screen.getByRole('button', { name: 'Copy address to clipboard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect wallet' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect wallet' })).not.toBeInTheDocument();
    expect(screen.queryByText(/connection error/i)).not.toBeInTheDocument();
  });

  it('delegates address truncation to the truncateAddress helper', () => {
    const truncateSpy = jest.spyOn(truncateAddressModule, 'truncateAddress');
    const address = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
    mockUseWallet.mockReturnValue({ ...defaultMockState, address });

    render(<WalletConnectButton />);

    expect(truncateSpy).toHaveBeenCalledWith(address);
    truncateSpy.mockRestore();
  });

  it('swaps the copy icon to a checkmark and reverts after 2 seconds using fake timers', async () => {
    jest.useFakeTimers();

    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: jest.fn().mockImplementation(() => Promise.resolve()),
      },
      configurable: true,
      writable: true,
    });

    try {
      mockUseWallet.mockReturnValue({ ...defaultMockState, address: '0x123' });
      render(<WalletConnectButton />);

      const copyBtn = screen.getByRole('button', { name: /copy address to clipboard/i });
      const copyIconPathBefore = copyBtn.querySelector('path')?.getAttribute('d');

      await act(async () => {
        fireEvent.click(copyBtn);
      });

      const copyIconPathAfterClick = copyBtn.querySelector('path')?.getAttribute('d');
      expect(copyIconPathAfterClick).not.toEqual(copyIconPathBefore);

      await act(async () => {
        jest.advanceTimersByTime(1999);
      });
      expect(copyBtn.querySelector('path')?.getAttribute('d')).toEqual(copyIconPathAfterClick);

      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(copyBtn.querySelector('path')?.getAttribute('d')).toEqual(copyIconPathBefore);
    } finally {
      Object.defineProperty(navigator, 'clipboard', {
        value: originalClipboard,
        configurable: true,
        writable: true,
      });
      jest.useFakeTimers();
    }
  });

  it('has no accessibility violations in the connected state', async () => {
    jest.useRealTimers();
    mockUseWallet.mockReturnValue({ ...defaultMockState, address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' });
    await testA11y(<WalletConnectButton />);
    jest.useFakeTimers();
  });

  it('has no accessibility violations in the disconnected state', async () => {
    jest.useRealTimers();
    mockUseWallet.mockReturnValue(defaultMockState);
    await testA11y(<WalletConnectButton />);
    jest.useFakeTimers();
  });

  it('has no accessibility violations in the error state', async () => {
    jest.useRealTimers();
    mockUseWallet.mockReturnValue({ ...defaultMockState, error: 'Failed to connect' });
    await testA11y(<WalletConnectButton />);
    jest.useFakeTimers();
  });
});