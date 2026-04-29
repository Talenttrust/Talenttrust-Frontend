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

function getToastStyles(variant: ToastVariant) {
  if (variant === 'success') {
    return {
      accent: 'bg-emerald-500',
      badge: 'bg-emerald-100 text-emerald-800',
      panel: 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm',
    };
  }

  return {
    accent: 'bg-rose-500',
    badge: 'bg-rose-100 text-rose-800',
    panel: 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm',
  };
}

function ToastViewport({
  toasts,
  onDismiss,
  density,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
  density: 'comfortable' | 'compact';
}) {
  return (
    <div
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
                  <p className="mt-1 text-sm text-slate-600">{toast.description}</p>
                ) : null}
              </div>
              <button
                aria-label={`Dismiss ${badgeLabel.toLowerCase()} notification`}
                className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextIdRef = useRef(0);
  const timerIdsRef = useRef<Record<string, number>>({});

  const dismissToast = useCallback((id: string) => {
    setToasts((currentToasts) => currentToasts.filter((toast) => toast.id !== id));
  }, []);

  const createToast = useCallback(
    (variant: ToastVariant, toast: ToastInput) => {
      const id = `toast-${nextIdRef.current += 1}`;
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
      if (timerIdsRef.current[toast.id]) {
        return;
      }

      timerIdsRef.current[toast.id] = window.setTimeout(() => {
        dismissToast(toast.id);
      }, toast.duration ?? DEFAULT_DURATION);
    });

    Object.keys(timerIdsRef.current).forEach((toastId) => {
      const toastStillVisible = toasts.some((toast) => toast.id === toastId);

      if (!toastStillVisible) {
        window.clearTimeout(timerIdsRef.current[toastId]);
        delete timerIdsRef.current[toastId];
      }
    });

    return undefined;
  }, [dismissToast, toasts]);

  useEffect(() => {
    return () => {
      Object.values(timerIdsRef.current).forEach((timerId) => {
        window.clearTimeout(timerId);
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
      <ToastViewport onDismiss={dismissToast} toasts={toasts} density={preferences.toastDensity} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
}
