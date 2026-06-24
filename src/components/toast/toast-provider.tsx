'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePreferences } from '@/lib/preferences';

type ToastVariant = 'success' | 'error';

type ToastInput = {
  title: string;
  description?: string;
  duration?: number;
};

type ToastRecord = ToastInput & {
  id: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toasts: ToastRecord[];
  showSuccess: (toast: ToastInput) => string;
  showError: (toast: ToastInput) => string;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 5000;

/**
 * Generates a unique toast ID without mutating refs during render.
 * Uses crypto.randomUUID() when available, with a timestamp-based fallback.
 * This ensures collision-free IDs even under React StrictMode double-invocation.
 *
 * @returns A unique string identifier for a toast
 */
function generateToastId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `toast-${crypto.randomUUID()}`;
  }
  // Fallback for environments without crypto.randomUUID support
  return `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getToastStyles(variant: ToastVariant) {
  // a11y/theming-27: badge classes were `bg-emerald-100 text-emerald-800`
  // / `bg-rose-100 text-rose-800` — fixed Tailwind pastels that don't
  // respond to [data-theme='dark']. Swapped for the --status-* variables
  // defined in globals.css, which carry an audited light AND dark pair.
  // Light-mode hex values are unchanged from the originals.
  if (variant === 'success') {
    return {
      accent: 'bg-emerald-500',
      badge: 'bg-[var(--status-success-bg)] text-[var(--status-success-foreground)]',
      panel: 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm',
    };
  }

  return {
    accent: 'bg-rose-500',
    badge: 'bg-[var(--status-error-bg)] text-[var(--status-error-foreground)]',
    panel: 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm',
  };
}


function ToastViewport({
  toasts,
  onDismiss,
  onPauseTimer,
  onResumeTimer,
  density,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
  onPauseTimer: (id: string) => void;
  onResumeTimer: (id: string) => void;
  density: 'relaxed' | 'compact';
}) {
  return (
    <div
      role="region"
      aria-atomic="false"
      aria-label="Notifications"
      className={`pointer-events-none fixed right-4 top-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col ${
        density === 'compact' ? 'gap-1.5' : 'gap-3'
      }`}
    >
      {toasts.map((toast) => {
        const styles = getToastStyles(toast.variant);
        const badgeLabel = toast.variant === 'success' ? 'Success' : 'Error';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto overflow-hidden rounded-2xl border ${styles.panel} shadow-lg`}
            onBlur={() => onResumeTimer(toast.id)}
            onFocus={() => onPauseTimer(toast.id)}
            onMouseEnter={() => onPauseTimer(toast.id)}
            onMouseLeave={() => onResumeTimer(toast.id)}
            role={toast.variant === 'error' ? 'alert' : 'status'}
          >
            <div className={`h-1.5 w-full ${styles.accent}`} />
            <div className="flex items-start gap-3 p-4">
              <div className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${styles.badge}`}>
                {badgeLabel}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description ? (
                  // a11y/theming-27: was `text-slate-600`, which measured
                  // 2.36:1 against the dark --surface (#0f172a) — well
                  // below the 4.5:1 AA minimum for body text. Replaced
                  // with --muted-foreground, which is themed in
                  // globals.css and passes AA in both modes (4.55:1
                  // light, 6.96:1 dark). See docs/components/Accessibility.md.
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">{toast.description}</p>
                ) : null}
              </div>
              <button
                aria-label={`Dismiss ${badgeLabel.toLowerCase()} notification`}
                // a11y/theming-27: was `text-slate-500 hover:bg-slate-100
                // hover:text-slate-900`. text-slate-500 measured 3.75:1
                // against the dark --surface — fails AA. The light hover
                // background also stayed fixed-light, producing a bright
                // patch on a dark panel. Replaced with themed tokens that
                // pass AA in both modes.
                className="rounded-full p-1.5 text-[var(--muted-foreground)] transition hover:bg-[var(--accent)] hover:text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                onClick={() => onDismiss(toast.id)}
                type="button"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ToastAnnouncer({ toasts }: { toasts: ToastRecord[] }) {
  const latestSuccess = [...toasts].reverse().find((toast) => toast.variant === 'success');
  const latestError = [...toasts].reverse().find((toast) => toast.variant === 'error');

  return (
    <>
      <div aria-atomic="true" aria-live="polite" className="sr-only">
        {latestSuccess ? `${latestSuccess.title}${latestSuccess.description ? `. ${latestSuccess.description}` : ''}` : ''}
      </div>
      <div aria-atomic="true" aria-live="assertive" className="sr-only">
        {latestError ? `${latestError.title}${latestError.description ? `. ${latestError.description}` : ''}` : ''}
      </div>
    </>
  );
}

type ToastTimerState = {
  expiresAt: number | null;
  pauseCount: number;
  remainingMs: number;
  timeoutId: number | null;
};

/**
 * Provides toast notification context to the component tree.
 *
 * Must be mounted inside `<PreferencesProvider>` because it reads
 * `quietMode` and `toastDensity` from user preferences.
 *
 * Renders two companion elements:
 * - **ToastViewport** – fixed top-right column stacking visible toasts.
 * - **ToastAnnouncer** – two screen-reader-only live regions (`polite` for
 *   success, `assertive` for error) that announce the latest toast of each
 *   variant.
 *
 * @param children - React children that will have access to `useToast`.
 *
 * @example
 * ```tsx
 * <PreferencesProvider>
 *   <ToastProvider>
 *     <App />
 *   </ToastProvider>
 * </PreferencesProvider>
 * ```
 *
 * ## Quiet mode
 *
 * When `preferences.quietMode` is `true`, `showSuccess()` returns the string
 * `'suppressed'` and does **not** create a toast. `showError()` is unaffected.
 *
 * ## Density
 *
 * `preferences.toastDensity` controls the vertical gap between stacked toasts:
 * - `'relaxed'` (default) → `gap-3` (12px)
 * - `'compact'` → `gap-1.5` (6px)
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const toastTimersRef = useRef<Record<string, ToastTimerState>>({});

  const dismissToast = useCallback((id: string) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
  }, []);

  /**
   * Starts (or restarts) the auto-dismiss timeout for a toast.
   * Stores the expiry timestamp so remaining time can be recovered when pausing.
   */
  const scheduleToastDismiss = useCallback(
    (id: string, durationMs: number) => {
      const existingTimer = toastTimersRef.current[id];
      const timer: ToastTimerState = existingTimer ?? {
        expiresAt: null,
        pauseCount: 0,
        remainingMs: durationMs,
        timeoutId: null,
      };

      if (timer.timeoutId !== null) {
        window.clearTimeout(timer.timeoutId);
      }

      timer.remainingMs = durationMs;
      timer.expiresAt = Date.now() + durationMs;
      timer.timeoutId = window.setTimeout(() => {
        dismissToast(id);
      }, durationMs);

      toastTimersRef.current[id] = timer;
    },
    [dismissToast],
  );

  /**
   * Clears a toast's auto-dismiss timeout and removes its timer state.
   * Called when a toast is dismissed or unmounted.
   */
  const clearToastTimer = useCallback((id: string) => {
    const timer = toastTimersRef.current[id];

    if (!timer) {
      return;
    }

    if (timer.timeoutId !== null) {
      window.clearTimeout(timer.timeoutId);
    }

    delete toastTimersRef.current[id];
  }, []);

  /**
   * Pauses the auto-dismiss timer while a toast is hovered or focused.
   * Uses a pause counter so overlapping hover and focus keep the timer
   * paused until both interactions end.
   */
  const pauseToastTimer = useCallback((id: string) => {
    const timer = toastTimersRef.current[id];

    if (!timer) {
      return;
    }

    timer.pauseCount += 1;

    if (timer.pauseCount === 1 && timer.timeoutId !== null) {
      window.clearTimeout(timer.timeoutId);
      timer.timeoutId = null;

      if (timer.expiresAt !== null) {
        timer.remainingMs = Math.max(0, timer.expiresAt - Date.now());
        timer.expiresAt = null;
      }
    }
  }, []);

  /**
   * Resumes the auto-dismiss timer after hover or focus ends.
   * Only restarts the timeout once every pause source has cleared.
   */
  const resumeToastTimer = useCallback(
    (id: string) => {
      const timer = toastTimersRef.current[id];

      if (!timer || timer.pauseCount === 0) {
        return;
      }

      timer.pauseCount -= 1;

      if (timer.pauseCount === 0 && timer.timeoutId === null) {
        scheduleToastDismiss(id, timer.remainingMs);
      }
    },
    [scheduleToastDismiss],
  );

  const createToast = useCallback(
    (variant: ToastVariant, toast: ToastInput) => {
      const id = generateToastId();
      const duration = toast.duration ?? DEFAULT_DURATION;

      setToasts((currentToasts) => [
        ...currentToasts,
        {
          ...toast,
          duration,
          id,
          variant,
        },
      ]);

      return id;
    },
    [],
  );

  const { preferences } = usePreferences();

  const showSuccess = useCallback(
    (toast: ToastInput) => {
      if (preferences.quietMode) {
        return 'suppressed';
      }
      return createToast('success', toast);
    },
    [createToast, preferences.quietMode],
  );

  const showError = useCallback(
    (toast: ToastInput) => createToast('error', toast),
    [createToast],
  );

  useEffect(() => {
    toasts.forEach((toast) => {
      if (toastTimersRef.current[toast.id]) {
        return;
      }

      scheduleToastDismiss(toast.id, toast.duration ?? DEFAULT_DURATION);
    });

    Object.keys(toastTimersRef.current).forEach((toastId) => {
      const toastStillVisible = toasts.some((toast) => toast.id === toastId);

      if (!toastStillVisible) {
        clearToastTimer(toastId);
      }
    });

    return undefined;
  }, [clearToastTimer, scheduleToastDismiss, toasts]);

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      Object.keys(timers).forEach((toastId) => {
        const timer = timers[toastId];

        if (timer.timeoutId !== null) {
          window.clearTimeout(timer.timeoutId);
        }
      });
    };
  }, []);

  const value = useMemo(
    () => ({
      dismissToast,
      showError,
      showSuccess,
      toasts,
    }),
    [dismissToast, showError, showSuccess, toasts],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastAnnouncer toasts={toasts} />
      <ToastViewport
        density={preferences.toastDensity}
        onDismiss={dismissToast}
        onPauseTimer={pauseToastTimer}
        onResumeTimer={resumeToastTimer}
        toasts={toasts}
      />
    </ToastContext.Provider>
  );
}

/**
 * Returns the toast context, granting access to `toasts`, `showSuccess`,
 * `showError`, and `dismissToast`.
 *
 * Must be called from a component rendered inside `<ToastProvider>`.
 *
 * @returns `{ toasts, showSuccess, showError, dismissToast }`
 *
 * @throws `Error` if called outside a `<ToastProvider>`.
 *
 * @example
 * ```tsx
 * function SubmitButton() {
 *   const { showSuccess, showError } = useToast();
 *
 *   return (
 *     <button onClick={() => showSuccess({ title: 'Saved' })}>
 *       Submit
 *     </button>
 *   );
 * }
 * ```
 *
 * ## Return values
 *
 * | Method | Normal | Quiet mode (`quietMode: true`) |
 * |---|---|---|
 * | `showSuccess(toast)` | Unique toast ID | `'suppressed'` (no toast shown) |
 * | `showError(toast)` | Unique toast ID | Unique toast ID (always shown) |
 *
 * ## Accessibility
 *
 * - Error toasts render with `role="alert"` (immediate announcement).
 * - Success toasts render with `role="status"` (announced when idle).
 * - A `<div aria-live="polite">` announces the latest success toast.
 * - A `<div aria-live="assertive">` announces the latest error toast.
 */
export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
}