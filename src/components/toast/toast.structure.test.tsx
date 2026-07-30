/// <reference types="jest" />

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider, useToast, ToastErrorBoundary, ToastSkeleton } from './toast-provider';
import * as errorReporter from '@/lib/errorReporter';
import { PreferencesProvider } from '@/lib/preferences';

type ToastControlStructure = {
  tag: string;
  role: string | null;
  label: string | null;
  text: string;
  variantClass: string | null;
};

function toastStructureOf(toastEl: HTMLElement): ToastControlStructure {
  const accentBar = toastEl.querySelector('div.h-1\\.5') as HTMLElement | null;
  const badge = toastEl.querySelector('.rounded-full') as HTMLElement | null;
  const _buttons = Array.from(toastEl.querySelectorAll('button'));

  return {
    tag: toastEl.tagName.toLowerCase(),
    role: toastEl.getAttribute('role'),
    label: toastEl.getAttribute('aria-label') ?? null,
    text: (toastEl.textContent ?? '').trim(),
    variantClass: accentBar?.className ?? badge?.className ?? null,
  };
}

function viewportControls(viewport: HTMLElement) {
  const toasts = Array.from(viewport.querySelectorAll('[role="status"], [role="alert"]')) as HTMLElement[];
  return {
    count: toasts.length,
    toasts: toasts.map((t) => toastStructureOf(t)),
    densityClass: viewport.className.match(/gap-(3|1\.5)/)?.[0] ?? null,
    ariaBusy: viewport.getAttribute('aria-busy'),
    ariaLabel: viewport.getAttribute('aria-label'),
  };
}

function mockCryptoUuid(seq: { value: number }) {
  const orig = globalThis.crypto?.randomUUID;
  globalThis.crypto = globalThis.crypto ?? ({} as Crypto);
  (globalThis.crypto as any).randomUUID = () => {
    seq.value += 1;
    return `00000000-0000-0000-0000-${String(seq.value).padStart(12, '0')}`;
  };
  return () => {
    if (orig) {
      (globalThis.crypto as any).randomUUID = orig;
    } else {
      delete (globalThis.crypto as any).randomUUID;
    }
  };
}

describe('toast rendered output — structural + snapshot tests', () => {
  const uuidSeq = { value: 0 };
  let restoreUuid: () => void;

  beforeEach(() => {
    restoreUuid = mockCryptoUuid(uuidSeq);
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => { jest.clearAllTimers(); });
    jest.useRealTimers();
    restoreUuid();
    uuidSeq.value = 0;
  });

  describe('empty state (no toasts)', () => {
    it('renders viewport with skeleton, aria-busy="true", and labelled region — structural assertions', () => {
      render(
        <ToastProvider>
          <div />
        </ToastProvider>,
      );

      const viewport = screen.getByLabelText('Notifications');
      expect(viewport).toBeInTheDocument();
      expect(viewport).toHaveAttribute('role', 'region');
      expect(viewport).toHaveAttribute('aria-atomic', 'false');
      expect(viewport).toHaveAttribute('aria-busy', 'true');

      const controls = viewportControls(viewport);
      expect(controls.count).toBe(0);
      expect(controls.ariaBusy).toBe('true');
      expect(controls.ariaLabel).toBe('Notifications');
      expect(controls.densityClass).toBe('gap-3');

      const skeleton = viewport.querySelector('[aria-hidden="true"]');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton?.className).toContain('animate-pulse');
      expect(skeleton?.className).toContain('rounded-2xl');
    });

    it('matches the snapshot for the empty viewport with skeleton', () => {
      const { container } = render(
        <ToastProvider>
          <div />
        </ToastProvider>,
      );

      const viewport = screen.getByLabelText('Notifications');
      expect(viewport).toMatchSnapshot();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('ToastSkeleton standalone matches its structural snapshot', () => {
      const { container } = render(<ToastSkeleton />);
      const el = container.firstChild as HTMLElement;
      expect(el).toHaveAttribute('aria-hidden', 'true');
      expect(el.className).toContain('animate-pulse');
      expect(el.querySelector('.rounded-full')).toBeInTheDocument();
      expect(el.querySelector('.rounded-md')).toBeInTheDocument();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('loaded state — single success toast', () => {
    function SingleSuccessHarness() {
      const { showSuccess } = useToast();
      return (
        <button
          type="button"
          onClick={() =>
            showSuccess({
              title: 'Milestone released',
              description: 'Funds are on the way to the freelancer wallet.',
            })
          }
        >
          Trigger
        </button>
      );
    }

    it('renders correct role, badge, classes, and control structure', () => {
      render(
        <ToastProvider>
          <SingleSuccessHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: /trigger/i }));

      const viewport = screen.getByLabelText('Notifications');
      const controls = viewportControls(viewport);
      expect(controls.count).toBe(1);
      expect(controls.ariaBusy).toBeNull();
      expect(controls.toasts[0].role).toBe('status');

      const toast = screen.getByRole('status');
      expect(toast).toHaveAttribute('tabIndex', '0');
      expect(toast.className).toContain('rounded-2xl');
      expect(toast.className).toContain('pointer-events-auto');

      const accentBar = toast.querySelector('div.h-1\\.5')!;
      expect(accentBar.className).toContain('bg-emerald-500');
      expect(accentBar.className).not.toContain('bg-rose-500');

      const badge = toast.querySelector('.rounded-full')!;
      expect(badge.textContent).toBe('Success');
      expect(badge.className).toContain('uppercase');
      expect(badge.className).toContain('tracking-[0.18em]');

      expect(screen.getByText('Milestone released')).toBeInTheDocument();
      expect(screen.getByText('Funds are on the way to the freelancer wallet.')).toBeInTheDocument();

      const dismissBtn = screen.getByRole('button', { name: /dismiss success notification/i });
      expect(dismissBtn).toBeInTheDocument();
      expect(dismissBtn.querySelector('span[aria-hidden="true"]')).toHaveTextContent('×');
    });

    it('matches the structural snapshot for one loaded success toast', () => {
      const { container } = render(
        <ToastProvider>
          <SingleSuccessHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: /trigger/i }));

      const viewport = screen.getByLabelText('Notifications');
      expect(viewport).toMatchSnapshot();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('loaded state — single error toast (error variant)', () => {
    function SingleErrorHarness() {
      const { showError } = useToast();
      return (
        <button
          type="button"
          onClick={() =>
            showError({
              title: 'Wallet not connected',
              description: 'Connect a wallet before approving this release.',
            })
          }
        >
          Trigger
        </button>
      );
    }

    it('renders with role="alert", rose accent, Error badge — distinct from success', () => {
      render(
        <ToastProvider>
          <SingleErrorHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: /trigger/i }));

      const toast = screen.getByRole('alert');
      expect(toast).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();

      const accentBar = toast.querySelector('div.h-1\\.5')!;
      expect(accentBar.className).toContain('bg-rose-500');
      expect(accentBar.className).not.toContain('bg-emerald-500');

      const badge = toast.querySelector('.rounded-full')!;
      expect(badge.textContent).toBe('Error');

      expect(screen.getByText('Wallet not connected')).toBeInTheDocument();
      expect(screen.getByText('Connect a wallet before approving this release.')).toBeInTheDocument();

      const dismissBtn = screen.getByRole('button', { name: /dismiss error notification/i });
      expect(dismissBtn).toBeInTheDocument();
    });

    it('matches the structural snapshot for one loaded error toast', () => {
      const { container } = render(
        <ToastProvider>
          <SingleErrorHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: /trigger/i }));

      const viewport = screen.getByLabelText('Notifications');
      expect(viewport).toMatchSnapshot();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('loaded state — success toast with action button', () => {
    function ActionHarness() {
      const { showSuccess } = useToast();
      return (
        <button
          type="button"
          onClick={() =>
            showSuccess({
              title: 'File saved',
              description: 'Your changes have been written.',
              action: { label: 'Undo', onClick: jest.fn() },
            })
          }
        >
          Trigger
        </button>
      );
    }

    it('renders action button with correct class, role, and order (action before dismiss)', () => {
      render(
        <ToastProvider>
          <ActionHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: /trigger/i }));

      const toast = screen.getByRole('status');
      const actionBtn = screen.getByRole('button', { name: 'Undo' });
      const _dismissBtn = screen.getByRole('button', { name: /dismiss success notification/i });

      expect(actionBtn).toBeInTheDocument();
      expect(actionBtn.className).toContain('bg-[var(--primary)]');
      expect(actionBtn.className).toContain('focus-visible:ring-2');
      expect(actionBtn.type).toBe('button');

      const allButtons = Array.from(toast.querySelectorAll('button'));
      expect(allButtons.map((b) => b.textContent?.trim() ?? b.getAttribute('aria-label'))).toEqual([
        'Undo',
        'Dismiss success notification',
      ]);
    });

    it('matches the structural snapshot for a success toast with action button', () => {
      const { container } = render(
        <ToastProvider>
          <ActionHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: /trigger/i }));

      const viewport = screen.getByLabelText('Notifications');
      expect(viewport).toMatchSnapshot();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('loaded state — multiple toasts', () => {
    function MultiHarness() {
      const { showSuccess, showError } = useToast();
      return (
        <button
          type="button"
          onClick={() => {
            showSuccess({ title: 'Success A', description: 'First success' });
            showSuccess({ title: 'Success B', description: 'Second success' });
            showError({ title: 'Error C', description: 'First error' });
          }}
        >
          Add 3
        </button>
      );
    }

    it('renders all toasts in FIFO order with correct role mix (2× status + 1× alert)', () => {
      render(
        <ToastProvider>
          <MultiHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: /add 3/i }));

      const viewport = screen.getByLabelText('Notifications');
      const controls = viewportControls(viewport);
      expect(controls.count).toBe(3);
      expect(controls.toasts.map((t) => t.role)).toEqual(['status', 'status', 'alert']);
      expect(controls.ariaBusy).toBeNull();

      expect(screen.getAllByRole('status')).toHaveLength(2);
      expect(screen.getAllByRole('alert')).toHaveLength(1);

      expect(screen.getByText('Success A')).toBeInTheDocument();
      expect(screen.getByText('Success B')).toBeInTheDocument();
      expect(screen.getByText('Error C')).toBeInTheDocument();
    });

    it('matches the structural snapshot for multiple toasts stacked', () => {
      const { container } = render(
        <ToastProvider>
          <MultiHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: /add 3/i }));

      const viewport = screen.getByLabelText('Notifications');
      expect(viewport).toMatchSnapshot();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('renders exactly MAX_VISIBLE_TOASTS=4 and oldest evicted when cap exceeded — structural', () => {
      function CapHarness() {
        const { showSuccess } = useToast();
        return (
          <button
            type="button"
            onClick={() => {
              for (let i = 1; i <= 5; i++) {
                showSuccess({ title: `T${i}`, description: `Toast ${i}` });
              }
            }}
          >
            Add 5
          </button>
        );
      }

      const { container } = render(
        <ToastProvider>
          <CapHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: /add 5/i }));

      const viewport = screen.getByLabelText('Notifications');
      const controls = viewportControls(viewport);
      expect(controls.count).toBe(4);

      expect(screen.queryByText('T1')).not.toBeInTheDocument();
      expect(screen.getByText('T2')).toBeInTheDocument();
      expect(screen.getByText('T5')).toBeInTheDocument();

      expect(viewport).toMatchSnapshot();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('error boundary fallback state', () => {
    beforeEach(() => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      jest.spyOn(errorReporter, 'reportError').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('renders fallback panel with role="alert", rose accent, Retry button when viewport throws', () => {
      const ThrowingComponent = () => {
        throw new Error('Render failure');
      };

      render(
        <ToastErrorBoundary>
          <ThrowingComponent />
        </ToastErrorBoundary>,
      );

      const fallbackViewport = screen.getByLabelText('Notifications Fallback');
      expect(fallbackViewport).toHaveAttribute('role', 'region');
      expect(fallbackViewport.className).toContain('fixed');
      expect(fallbackViewport.className).toContain('right-4');
      expect(fallbackViewport.className).toContain('top-4');

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert.className).toContain('rounded-2xl');

      const accentBar = alert.querySelector('div.h-1\\.5')!;
      expect(accentBar.className).toContain('bg-rose-500');

      expect(screen.getByText('Notifications failed to load')).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /retry/i });
      expect(retryBtn).toBeInTheDocument();
      expect(retryBtn.className).toContain('bg-[var(--primary)]');
      expect(retryBtn.className).toContain('focus-visible:ring-2');
    });

    it('matches the structural snapshot for the error boundary fallback', () => {
      const ThrowingComponent = () => {
        throw new Error('Render failure');
      };

      const { container } = render(
        <ToastErrorBoundary>
          <ThrowingComponent />
        </ToastErrorBoundary>,
      );

      expect(screen.getByLabelText('Notifications Fallback')).toMatchSnapshot();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('recovers structurally after retry button is clicked', () => {
      let shouldThrow = true;
      const Recoverable = () => {
        if (shouldThrow) throw new Error('Temporary');
        return <div role="status">Recovered</div>;
      };

      const { container } = render(
        <ToastErrorBoundary>
          <Recoverable />
        </ToastErrorBoundary>,
      );

      expect(screen.getByText('Notifications failed to load')).toBeInTheDocument();

      shouldThrow = false;
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));

      expect(screen.queryByText('Notifications failed to load')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Recovered');
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('live-region announcer structure', () => {
    function AnnouncerHarness() {
      const { showSuccess, showError } = useToast();
      return (
        <div>
          <button
            type="button"
            data-testid="btn-success"
            onClick={() => showSuccess({ title: 'Saved', description: 'OK' })}
          >
            S
          </button>
          <button
            type="button"
            data-testid="btn-error"
            onClick={() => showError({ title: 'Failed', description: 'No go' })}
          >
            E
          </button>
        </div>
      );
    }

    it('renders three sr-only live regions with correct aria-live and aria-atomic values when populated', () => {
      render(
        <ToastProvider>
          <AnnouncerHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByTestId('btn-success'));
      fireEvent.click(screen.getByTestId('btn-error'));

      act(() => { jest.advanceTimersByTime(600); });

      const liveRegions = Array.from(document.querySelectorAll('[aria-live]'));
      const byPoliteness = Object.fromEntries(
        liveRegions.map((r) => [r.getAttribute('aria-live'), r]),
      );

      expect(byPoliteness['polite']).toBeInTheDocument();
      expect(byPoliteness['assertive']).toBeInTheDocument();

      liveRegions.forEach((r) => {
        expect(r).toHaveAttribute('aria-atomic', 'true');
        expect(r.className).toContain('sr-only');
      });

      const assertiveRegion = byPoliteness['assertive'] as HTMLElement;
      expect(assertiveRegion.textContent).toContain('Failed');
      expect(assertiveRegion.textContent).toContain('No go');
    });

    it('matches the structural snapshot for live regions after status update delay', () => {
      const { container } = render(
        <ToastProvider>
          <AnnouncerHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByTestId('btn-success'));
      fireEvent.click(screen.getByTestId('btn-error'));

      act(() => { jest.advanceTimersByTime(600); });

      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('structural edge cases for coverage', () => {
    it('renders a toast without a description branch intact (only title + dismiss)', () => {
      function NoDescriptionHarness() {
        const { showSuccess } = useToast();
        return (
          <button
            type="button"
            onClick={() => showSuccess({ title: 'Just a title' })}
          >
            Go
          </button>
        );
      }

      const { container } = render(
        <ToastProvider>
          <NoDescriptionHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: /go/i }));

      const toast = screen.getByRole('status');
      expect(screen.getByText('Just a title')).toBeInTheDocument();
      const mutedText = toast.querySelector('p.text-\\[var\\(--muted-foreground\\)\\]');
      expect(mutedText).toBeNull();

      expect(container.firstChild).toMatchSnapshot();
    });

    it('dismiss button onKeyDown covers Enter and Space branches structurally', () => {
      function KbHarness() {
        const { showSuccess } = useToast();
        return (
          <button
            type="button"
            onClick={() => showSuccess({ title: 'KB test' })}
          >
            Go
          </button>
        );
      }

      const { container } = render(
        <ToastProvider>
          <KbHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: /go/i }));
      expect(screen.getByRole('status')).toBeInTheDocument();

      const dismissBtn = screen.getByRole('button', { name: /dismiss success notification/i });
      fireEvent.keyDown(dismissBtn, { key: 'Enter', code: 'Enter' });
      fireEvent.click(dismissBtn);

      expect(screen.queryByRole('status')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /go/i }));
      const dismissBtn2 = screen.getByRole('button', { name: /dismiss success notification/i });
      fireEvent.keyDown(dismissBtn2, { key: ' ', code: 'Space' });
      fireEvent.click(dismissBtn2);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();

      expect(container.firstChild).toMatchSnapshot();
    });

    it('compact density viewport has gap-1.5 class structurally', () => {
      localStorage.setItem(
        'talenttrust-user-preferences',
        JSON.stringify({ toastDensity: 'compact' }),
      );

      function CompactHarness() {
        const { showSuccess } = useToast();
        return (
          <button
            type="button"
            onClick={() => showSuccess({ title: 'Compact toast' })}
          >
            Go
          </button>
        );
      }

      const { container } = render(
        <PreferencesProvider>
          <ToastProvider>
            <CompactHarness />
          </ToastProvider>
        </PreferencesProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: /go/i }));

      const viewport = screen.getByLabelText('Notifications');
      const vpControls = viewportControls(viewport);
      expect(vpControls.densityClass).toBe('gap-1.5');
      expect(vpControls.count).toBe(1);

      expect(container.firstChild).toMatchSnapshot();
      localStorage.clear();
    });

    it('error toast with action button renders both action and dismiss distinctly', () => {
      function ErrorActionHarness() {
        const { showError } = useToast();
        return (
          <button
            type="button"
            onClick={() =>
              showError({
                title: 'Upload failed',
                description: 'Check your network.',
                action: { label: 'Retry upload', onClick: jest.fn() },
              })
            }
          >
            Go
          </button>
        );
      }

      const { container } = render(
        <ToastProvider>
          <ErrorActionHarness />
        </ToastProvider>,
      );

      fireEvent.click(screen.getByRole('button', { name: /go/i }));

      const toast = screen.getByRole('alert');
      const buttons = Array.from(toast.querySelectorAll('button'));
      expect(buttons.map((b) => b.textContent?.trim() ?? b.getAttribute('aria-label'))).toEqual([
        'Retry upload',
        'Dismiss error notification',
      ]);
      expect(buttons[0].className).toContain('bg-[var(--primary)]');

      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
