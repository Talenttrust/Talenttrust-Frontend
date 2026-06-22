import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider, useToast } from './toast-provider';

function ToastHarness() {
  const { showError, showSuccess } = useToast();

  return (
    <div>
      <button
        onClick={() =>
          showSuccess({
            title: 'Milestone released',
            description: 'Funds are on the way.',
            duration: 2000,
          })
        }
        type="button"
      >
        Trigger success
      </button>
      <button
        onClick={() =>
          showError({
            title: 'Wallet not connected',
            description: 'Connect a wallet first.',
            duration: 2000,
          })
        }
        type="button"
      >
        Trigger error
      </button>
    </div>
  );
}

describe('ToastProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('renders success toasts and announces them in a polite live region', () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger success/i }));

    expect(screen.getByRole('status')).toHaveTextContent('Milestone released');
    expect(screen.getByLabelText('Notifications')).toHaveTextContent('Funds are on the way.');
    expect(screen.getByText(/Milestone released\. Funds are on the way\./i)).toHaveAttribute('aria-live', 'polite');
  });

  it('renders error toasts and announces them in an assertive live region', () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger error/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Wallet not connected');
    expect(screen.getByText(/Wallet not connected\. Connect a wallet first\./i)).toHaveAttribute('aria-live', 'assertive');
  });

  it('dismisses a toast when the dismiss button is clicked', async () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger success/i }));
    fireEvent.click(screen.getByRole('button', { name: /dismiss success notification/i }));

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('automatically dismisses toasts after their duration', async () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger success/i }));

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('pauses auto-dismiss while a toast is hovered and restarts after the pointer leaves', async () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger success/i }));

    const toast = screen.getByRole('status');
    fireEvent.mouseEnter(toast);

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Milestone released');

    fireEvent.mouseLeave(toast);

    act(() => {
      jest.advanceTimersByTime(1999);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Milestone released');

    act(() => {
      jest.advanceTimersByTime(1);
    });

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('pauses auto-dismiss while the dismiss button is focused and still allows manual dismissal', async () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger success/i }));

    const dismissButton = screen.getByRole('button', { name: /dismiss success notification/i });
    fireEvent.focus(dismissButton);

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('status')).toHaveTextContent('Milestone released');

    fireEvent.click(dismissButton);

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('restarts auto-dismiss after keyboard focus leaves the toast', async () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger error/i }));

    const dismissButton = screen.getByRole('button', { name: /dismiss error notification/i });
    fireEvent.focus(dismissButton);

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Wallet not connected');

    fireEvent.blur(dismissButton);

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('keeps a hovered toast visible while other stacked toasts keep their timers', async () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger success/i }));
    fireEvent.click(screen.getByRole('button', { name: /trigger error/i }));

    fireEvent.mouseEnter(screen.getByRole('status'));

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    expect(screen.getByRole('status')).toHaveTextContent('Milestone released');

    fireEvent.mouseLeave(screen.getByRole('status'));

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });
});
