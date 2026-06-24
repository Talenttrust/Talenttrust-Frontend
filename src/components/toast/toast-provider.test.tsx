import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { PreferencesProvider } from '@/lib/preferences';
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
    act(() => {
      jest.clearAllTimers();
    });
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

  it('generates unique ids for rapid toast creation', () => {
    const ids: string[] = [];

    function RapidToastHarness() {
      const { showSuccess } = useToast();

      return (
        <div>
          <button
            onClick={() => {
              const id = showSuccess({ title: 'Toast 1' });
              ids.push(id);
            }}
            type="button"
          >
            Create toast 1
          </button>
          <button
            onClick={() => {
              const id = showSuccess({ title: 'Toast 2' });
              ids.push(id);
            }}
            type="button"
          >
            Create toast 2
          </button>
          <button
            onClick={() => {
              const id = showSuccess({ title: 'Toast 3' });
              ids.push(id);
            }}
            type="button"
          >
            Create toast 3
          </button>
        </div>
      );
    }

    render(
      <ToastProvider>
        <RapidToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /create toast 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /create toast 2/i }));
    fireEvent.click(screen.getByRole('button', { name: /create toast 3/i }));

    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(3);
    expect(uniqueIds.size).toBe(3);
    expect(ids.every((id) => id.startsWith('toast-'))).toBe(true);
  });

  it('does not create duplicate toasts under StrictMode double invocation', () => {
    const ids: string[] = [];

    function StrictModeHarness() {
      const { showSuccess } = useToast();

      return (
        <div>
          <button
            onClick={() => {
              const id = showSuccess({ title: 'StrictMode toast' });
              ids.push(id);
            }}
            type="button"
          >
            Create toast
          </button>
        </div>
      );
    }

    render(
      <StrictMode>
        <ToastProvider>
          <StrictModeHarness />
        </ToastProvider>
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole('button', { name: /create toast/i }));

    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(1);
    expect(uniqueIds.size).toBe(1);
  });

  it('pauses auto-dismiss while a toast is hovered', async () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger success/i }));

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    fireEvent.mouseEnter(screen.getByRole('status'));

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByRole('status'));

    act(() => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('pauses auto-dismiss while a toast is focused', async () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger success/i }));

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    fireEvent.focus(screen.getByRole('button', { name: /dismiss success notification/i }));

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.blur(screen.getByRole('button', { name: /dismiss success notification/i }));

    act(() => {
      jest.advanceTimersByTime(500);
    });

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('dismisses toast by returned id', async () => {
    let returnedId: string | null = null;

    function DismissByIdHarness() {
      const { showSuccess, dismissToast } = useToast();

      return (
        <div>
          <button
            onClick={() => {
              returnedId = showSuccess({ title: 'Dismissible toast' });
            }}
            type="button"
          >
            Create toast
          </button>
          <button
            onClick={() => {
              if (returnedId) {
                dismissToast(returnedId);
              }
            }}
            type="button"
          >
            Dismiss by id
          </button>
        </div>
      );
    }

    render(
      <ToastProvider>
        <DismissByIdHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /create toast/i }));
    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /dismiss by id/i }));

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });
});

describe('quietMode', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('suppresses success toasts when quietMode is true and returns "suppressed"', () => {
    localStorage.setItem(
      'talenttrust-user-preferences',
      JSON.stringify({ quietMode: true }),
    );

    let result: string | null = null;

    function QuietModeHarness() {
      const { showSuccess } = useToast();
      return (
        <button
          onClick={() => {
            result = showSuccess({ title: 'Quiet test' });
          }}
          type="button"
        >
          Trigger
        </button>
      );
    }

    render(
      <PreferencesProvider>
        <ToastProvider>
          <QuietModeHarness />
        </ToastProvider>
      </PreferencesProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger/i }));

    expect(result).toBe('suppressed');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not suppress error toasts when quietMode is true', () => {
    localStorage.setItem(
      'talenttrust-user-preferences',
      JSON.stringify({ quietMode: true }),
    );

    let result: string | null = null;

    function QuietModeErrorHarness() {
      const { showError } = useToast();
      return (
        <button
          onClick={() => {
            result = showError({ title: 'Error test' });
          }}
          type="button"
        >
          Trigger error
        </button>
      );
    }

    render(
      <PreferencesProvider>
        <ToastProvider>
          <QuietModeErrorHarness />
        </ToastProvider>
      </PreferencesProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger error/i }));

    expect(result).not.toBe('suppressed');
    expect(result).toMatch(/^toast-/);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

describe('density', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('renders viewport with relaxed (gap-3) spacing by default', () => {
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger success/i }));

    const viewport = screen.getByLabelText('Notifications');
    expect(viewport.className).toMatch(/gap-3/);
  });

  it('renders viewport with compact (gap-1.5) spacing when toastDensity is compact', () => {
    localStorage.setItem(
      'talenttrust-user-preferences',
      JSON.stringify({ toastDensity: 'compact' }),
    );

    render(
      <PreferencesProvider>
        <ToastProvider>
          <ToastHarness />
        </ToastProvider>
      </PreferencesProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger success/i }));

    const viewport = screen.getByLabelText('Notifications');
    expect(viewport.className).toMatch(/gap-1\.5/);
  });
});

describe('default duration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('uses DEFAULT_DURATION (5000ms) when no duration is provided', () => {
    function DefaultDurationHarness() {
      const { showSuccess } = useToast();
      return (
        <button
          onClick={() => showSuccess({ title: 'Default duration' })}
          type="button"
        >
          Trigger
        </button>
      );
    }

    render(
      <ToastProvider>
        <DefaultDurationHarness />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /trigger/i }));
    expect(screen.getByRole('status')).toBeInTheDocument();

    // Toast should still be visible after 3000ms (before the default 5000ms expires)
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    // After 5000ms total it should be dismissed
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
