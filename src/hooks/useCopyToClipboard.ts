import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseCopyToClipboardOptions {
  /** Delay in milliseconds to reset the `copied` state. Defaults to 2000ms. */
  delay?: number;
  /** Callback triggered when the copy operation succeeds. */
  onSuccess?: () => void;
  /** Callback triggered when the copy operation fails. Passed the error object or reason. */
  onError?: (error: unknown) => void;
}

/**
 * A custom React hook that manages copying text to the system clipboard.
 *
 * It provides:
 * - A stateful indicator (`copied`) showing whether the copy succeeded.
 * - An automatic reset timer that clears the `copied` state after a configurable delay.
 * - Proper cleanup of timers on component unmount or subsequent copy triggers.
 * - Safety guards for SSR environments and browsers without clipboard support.
 * - Success and failure callbacks for custom event notifications (e.g., toasts).
 *
 * @param options - Configuration options for the hook.
 * @returns An object containing:
 *  - `copied`: boolean indicating if the text has been successfully copied within the delay window.
 *  - `copy`: a function accepting a string to copy to the clipboard. Returns a promise resolving to `true` on success and `false` on failure.
 */
export function useCopyToClipboard(options: UseCopyToClipboardOptions = {}) {
  const { delay = 2000, onSuccess, onError } = options;
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanUp = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    // 1. Guard against Server-Side Rendering (SSR) environments
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      const error = new Error('Clipboard API is not available in SSR environments');
      onError?.(error);
      return false;
    }

    // 2. Guard against missing or restricted navigator.clipboard API
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      const error = new Error('Clipboard API is not supported in this environment');
      onError?.(error);
      return false;
    }

    // 3. Clear any existing reset timer (handles rapid consecutive copy triggers)
    cleanUp();

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);

      // 4. Schedule the copied state to reset back to false
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, delay);

      onSuccess?.();
      return true;
    } catch (err) {
      // 5. Treat the copy error gracefully and do not leak sensitive parameters to logs
      onError?.(err);
      return false;
    }
  }, [delay, onSuccess, onError, cleanUp]);

  // 6. Clean up timer on unmount to prevent state updates on unmounted components
  useEffect(() => {
    return cleanUp;
  }, [cleanUp]);

  return { copied, copy };
}
