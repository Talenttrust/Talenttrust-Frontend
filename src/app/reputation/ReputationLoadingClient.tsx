'use client';

import React, { Component, type ReactNode } from 'react';
import Link from 'next/link';
import { reportError } from '@/lib/errorReporter';
import ReputationLoading from './loading';

// ---------------------------------------------------------------------------
// Error Codes & Constants
// ---------------------------------------------------------------------------

/** Public error code for render errors caught during reputation loading. */
export const REPUTATION_LOADING_ERROR_CODE = 'REPUTATION_LOADING_FAILED' as const;

/** Public error code when loading exceeds the configured timeout threshold. */
export const REPUTATION_LOADING_TIMEOUT_CODE = 'REPUTATION_LOADING_TIMEOUT' as const;

/** Public error code when a retry operation fails. */
export const REPUTATION_LOADING_RETRY_FAILED_CODE = 'REPUTATION_LOADING_RETRY_FAILED' as const;

/** Public error code when a custom fallback render prop throws. */
export const REPUTATION_LOADING_FALLBACK_FAILED_CODE = 'REPUTATION_LOADING_FALLBACK_FAILED' as const;

/** Default maximum number of retry attempts before entering the exhausted state. */
export const DEFAULT_MAX_RETRIES = 3;

/** Valid state machine statuses for ReputationLoadingClient. */
export type ReputationLoadingStatus = 'loading' | 'error' | 'recovering' | 'exhausted';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReputationLoadingFallbackProps {
  /** Normalized error object, or null. */
  error: Error | null;
  /** Function to trigger a retry. */
  retry: () => void;
  /** Number of retry attempts completed so far. */
  retryCount: number;
  /** Whether the retry limit has been exhausted. */
  isExhausted: boolean;
  /** Whether an asynchronous retry is currently in flight. */
  isRetrying: boolean;
}

export interface ReputationLoadingClientProps {
  /**
   * Optional custom child content to render while in the loading state.
   * Defaults to `<ReputationLoading />`.
   */
  children?: ReactNode;
  /**
   * Optional custom fallback UI. When supplied as a function, receives
   * {@link ReputationLoadingFallbackProps}. When supplied as a ReactNode, replaces
   * the built-in fallback directly.
   */
  fallback?: ReactNode | ((props: ReputationLoadingFallbackProps) => ReactNode);
  /**
   * Accessible heading title displayed in the built-in fallback alert.
   * Defaults to "Unable to load reputation".
   */
  fallbackTitle?: string;
  /**
   * Callback fired whenever an error is encountered (render catch, timeout, or retry error).
   */
  onError?: (error: Error, errorInfo?: React.ErrorInfo) => void;
  /**
   * Callback fired when a retry is initiated. Can be synchronous or return a Promise.
   * While the promise is pending, the component enters the 'recovering' state.
   */
  onRetry?: () => void | Promise<void>;
  /**
   * Callback fired when a retry operation successfully resolves and content is restored.
   */
  onRecover?: () => void;
  /**
   * Maximum allowed retry attempts before entering the exhausted state.
   * Defaults to 3. Must be a non-negative integer.
   */
  maxRetries?: number;
  /**
   * Optional timeout in milliseconds. If loading does not settle within this window,
   * the component transitions deterministically to an error state.
   */
  timeoutMs?: number | null;
  /**
   * Initial error to simulate or propagate an error immediately on mount.
   */
  initialError?: Error | string | null;
  /**
   * Class name for the root `<main>` element.
   * Defaults to "min-h-screen p-8".
   */
  className?: string;
  /**
   * Optional data-testid for the root element.
   */
  'data-testid'?: string;
}

export interface ReputationLoadingClientState {
  status: ReputationLoadingStatus;
  error: Error | null;
  retryCount: number;
  retryKey: number;
  isRetrying: boolean;
}

// ---------------------------------------------------------------------------
// Input Normalization Helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes any caught or passed value into an Error instance.
 * Ensures non-Error throws (strings, objects, null, undefined) produce a safe Error.
 */
/**
 * Normalizes any caught or passed value into an Error instance so downstream
 * consumers always receive a real Error (including string, object, or numeric throws).
 */
export function normalizeError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === 'string') {
    return new Error(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return new Error(String(value));
  }

  if (value !== null && typeof value === 'object' && 'message' in value) {
    const { message } = value as { message?: unknown };

    if (typeof message === 'string' && message.length > 0) {
      return new Error(message);
    }
  }

  return new Error('Unknown error occurred');
}

/**
 * Normalizes the configured retry limit. Non-numeric, non-finite, or negative
 * inputs fall back to DEFAULT_MAX_RETRIES; fractional values are floored.
 */
export function normalizeMaxRetries(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return DEFAULT_MAX_RETRIES;
  }

  return Math.floor(value);
}

/**
 * Normalizes the optional loading timeout. Returns null when no positive,
 * finite timeout was configured, disabling the timeout guard entirely.
 */
export function normalizeTimeoutMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.floor(value);
}

export default class ReputationLoadingClient extends Component<
  ReputationLoadingClientProps,
  ReputationLoadingClientState
> {
  /** Delay before focus is transferred so the main landmark is fully attached. */
  private static readonly FOCUS_DELAY_MS = 100;

  private readonly alertRef = React.createRef<HTMLDivElement>();
  private readonly retryButtonRef = React.createRef<HTMLButtonElement>();
  private readonly mainRef = React.createRef<HTMLElement>();

  /**
   * Tracks in-flight retries synchronously. React batches state updates, so a
   * plain instance flag is required to reject rapid duplicate retry clicks.
   */
  private isRetryingLock = false;

  /** Guards retry/timer callbacks that settle after the component unmounts. */
  private isActive = true;

  private focusTimerRef: ReturnType<typeof setTimeout> | null = null;
  private focusRequestId = 0;
  private timeoutTimerRef: ReturnType<typeof setTimeout> | null = null;

  constructor(props: ReputationLoadingClientProps) {
    super(props);

    const initialError = props.initialError != null ? normalizeError(props.initialError) : null;

    this.state = {
      status: initialError ? 'error' : 'loading',
      error: initialError,
      retryCount: 0,
      retryKey: 0,
      isRetrying: false,
    };
  }

  static getDerivedStateFromError(error: unknown): Partial<ReputationLoadingClientState> {
    return { status: 'error', error: normalizeError(error), isRetrying: false };
  }

  componentDidMount(): void {
    if (this.state.status === 'error' || this.state.status === 'exhausted') {
      this.focusFallback();
      return;
    }

    this.scheduleMainFocus();
    this.startTimeoutTimer();
  }

  componentDidUpdate(
    prevProps: ReputationLoadingClientProps,
    prevState: ReputationLoadingClientState
  ): void {
    const { initialError } = this.props;

    if (initialError != null && initialError !== prevProps.initialError) {
      this.enterErrorState(normalizeError(initialError));
      return;
    }

    const wasFallback = prevState.status === 'error' || prevState.status === 'exhausted';
    const isFallback = this.state.status === 'error' || this.state.status === 'exhausted';

    if (!wasFallback && isFallback) {
      this.focusFallback();
    }

    if (prevState.status === this.state.status) {
      return;
    }

    if (this.state.status === 'loading') {
      this.scheduleMainFocus();
      this.startTimeoutTimer();
    } else {
      this.clearTimeoutTimer();
    }
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    this.isRetryingLock = false;

    const normalized = normalizeError(error);

    reportError(normalized, 'ReputationLoadingClient', 'error', {
      code: REPUTATION_LOADING_ERROR_CODE,
      retryCount: this.state.retryCount,
      maxRetries: normalizeMaxRetries(this.props.maxRetries),
    });

    this.invokeErrorCallback(normalized, errorInfo);
  }

  componentWillUnmount(): void {
    this.isActive = false;
    this.isRetryingLock = false;
    this.focusRequestId += 1;

    if (this.focusTimerRef !== null) {
      clearTimeout(this.focusTimerRef);
      this.focusTimerRef = null;
    }

    this.clearTimeoutTimer();
  }

  private enterErrorState(error: Error): void {
    this.clearTimeoutTimer();
    this.setState({ status: 'error', error, isRetrying: false });
  }

  private invokeErrorCallback(error: Error, errorInfo?: React.ErrorInfo): void {
    const { onError } = this.props;

    if (typeof onError !== 'function') {
      return;
    }

    try {
      if (errorInfo === undefined) {
        onError(error);
      } else {
        onError(error, errorInfo);
      }
    } catch {
      // A failing consumer callback must never unseat the error boundary.
    }
  }

  /**
   * Schedules the deferred focus transfer to the main landmark. Each call
   * invalidates any pending timer, so StrictMode double-invocation or repeated
   * renders can never steal focus twice.
   */
  private scheduleMainFocus(): void {
    const requestId = ++this.focusRequestId;

    if (this.focusTimerRef !== null) {
      clearTimeout(this.focusTimerRef);
      this.focusTimerRef = null;
    }

    this.focusTimerRef = setTimeout(() => {
      this.focusTimerRef = null;

      if (requestId !== this.focusRequestId || this.state.status !== 'loading') {
        return;
      }

      const main = document.querySelector('main') ?? this.mainRef.current;

      if (main && document.activeElement !== main) {
        main.focus();
      }
    }, ReputationLoadingClient.FOCUS_DELAY_MS);
  }

  /** Moves focus into the rendered fallback (retry button first, else the alert). */
  private focusFallback(): void {
    const retryButton = this.retryButtonRef.current;

    if (retryButton && typeof retryButton.focus === 'function') {
      retryButton.focus();
      return;
    }

    const alert = this.alertRef.current;

    if (alert && typeof alert.focus === 'function') {
      alert.focus();
    }
  }

  private startTimeoutTimer(): void {
    const timeoutMs = normalizeTimeoutMs(this.props.timeoutMs);

    if (timeoutMs === null) {
      return;
    }

    this.clearTimeoutTimer();

    this.timeoutTimerRef = setTimeout(() => {
      this.timeoutTimerRef = null;

      if (!this.isActive || this.state.status !== 'loading') {
        return;
      }

      const timeoutError = new Error('Reputation loading timed out');

      reportError(timeoutError, 'ReputationLoadingClient', 'warn', {
        code: REPUTATION_LOADING_TIMEOUT_CODE,
        timeoutMs,
      });

      this.invokeErrorCallback(timeoutError);
      this.enterErrorState(timeoutError);
    }, timeoutMs);
  }

  private clearTimeoutTimer(): void {
    if (this.timeoutTimerRef !== null) {
      clearTimeout(this.timeoutTimerRef);
      this.timeoutTimerRef = null;
    }
  }

  private handleRetry = (): void => {
    const maxRetries = normalizeMaxRetries(this.props.maxRetries);

    if (
      this.isRetryingLock ||
      this.state.isRetrying ||
      this.state.status === 'exhausted' ||
      this.state.retryCount >= maxRetries
    ) {
      return;
    }

    this.isRetryingLock = true;
    this.clearTimeoutTimer();
    this.setState({
      status: 'recovering',
      isRetrying: true,
      retryCount: this.state.retryCount + 1,
    });

    let pending: void | Promise<void>;

    try {
      pending = this.props.onRetry?.();
    } catch (retryError) {
      this.failRetry(retryError);
      return;
    }

    if (pending && typeof pending.then === 'function') {
      pending.then(
        () => this.completeRetry(),
        (retryError: unknown) => this.failRetry(retryError)
      );
      return;
    }

    this.completeRetry();
  };

  private completeRetry(): void {
    this.isRetryingLock = false;

    if (!this.isActive) {
      return;
    }

    this.setState(
      (prevState) => ({
        status: 'loading',
        error: null,
        retryKey: prevState.retryKey + 1,
        isRetrying: false,
      }),
      () => {
        this.props.onRecover?.();
      }
    );
  }

  private failRetry(retryError: unknown): void {
    this.isRetryingLock = false;

    if (!this.isActive) {
      return;
    }

    const normalized = normalizeError(retryError);

    reportError(normalized, 'ReputationLoadingClient', 'error', {
      code: REPUTATION_LOADING_RETRY_FAILED_CODE,
      retryCount: this.state.retryCount,
    });

    this.setState({ status: 'error', error: normalized, isRetrying: false });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  private renderFallback(): ReactNode {
    const { fallback, fallbackTitle } = this.props;
    const { error, retryCount, status } = this.state;
    const maxRetries = normalizeMaxRetries(this.props.maxRetries);
    const isExhausted = status === 'exhausted' || retryCount >= maxRetries;
    const isRetrying = this.state.isRetrying || this.isRetryingLock || status === 'recovering';

    if (fallback !== undefined) {
      if (typeof fallback === 'function') {
        try {
          return fallback({
            error,
            retry: this.handleRetry,
            retryCount,
            isExhausted,
            isRetrying,
          });
        } catch (fallbackError) {
          reportError(fallbackError, 'ReputationLoadingClient', 'error', {
            code: REPUTATION_LOADING_FALLBACK_FAILED_CODE,
          });
          // Gracefully fall through to built-in fallback
        }
      } else {
        return fallback;
      }
    }

    const title =
      typeof fallbackTitle === 'string' && fallbackTitle.trim().length > 0
        ? fallbackTitle.trim()
        : 'Unable to load reputation';

    const description = isExhausted
      ? 'Unable to load reputation after multiple attempts. Please return home or contact support if the problem persists.'
      : 'A problem occurred while loading reputation data. You can try again.';

    return (
      <div
        ref={this.alertRef}
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        tabIndex={-1}
        className="mx-auto my-8 max-w-lg rounded-3xl border border-red-200 bg-red-50 p-6 text-center shadow-sm sm:p-8"
      >
        <h2 className="text-xl font-bold text-red-900">{title}</h2>
        <p className="mt-2 text-sm text-red-700">{description}</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          {!isExhausted && (
            <button
              ref={this.retryButtonRef}
              type="button"
              onClick={this.handleRetry}
              disabled={isRetrying}
              className="rounded-xl bg-red-700 px-4 py-2 font-semibold text-white transition hover:bg-red-800 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRetrying ? 'Retrying…' : 'Try again'}
            </button>
          )}
          <Link
            href="/"
            className="rounded-xl border border-red-300 px-4 py-2 font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  render(): ReactNode {
    const { status, retryKey } = this.state;
    const maxRetries = normalizeMaxRetries(this.props.maxRetries);
    const isExhausted = status === 'exhausted' || this.state.retryCount >= maxRetries;
    const isRecovering = status === 'recovering';
    const hasError = status === 'error' || isExhausted;
    const shouldShowFallback = hasError || isRecovering;
    const isBusy = status === 'loading' || isRecovering;

    const childContent =
      this.props.children !== undefined ? (
        this.props.children
      ) : (
        <ReputationLoading />
      );

    return (
      <main
        ref={this.mainRef}
        className={this.props.className ?? 'min-h-screen p-8'}
        tabIndex={-1}
        aria-busy={isBusy ? 'true' : 'false'}
        data-testid={this.props['data-testid']}
      >
        {shouldShowFallback ? (
          this.renderFallback()
        ) : (
          <React.Fragment key={retryKey}>{childContent}</React.Fragment>
        )}
      </main>
    );
  }
}
