'use client';

import React, { Component, ReactNode } from 'react';
import Link from 'next/link';
import { reportError } from '../lib/errorReporter';
import {
  getErrorMessage,
  prepareErrorDetailForDom,
} from '../lib/redactErrorDetail';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  /** User-safe support identifier from the error reporter (never the raw message). */
  digest: string | null;
  /**
   * Optional detail for DOM. In production this is always null; in development
   * it may hold the unredacted message for local debugging.
   */
  detail: string | null;
}

export default class SafeBoundary extends Component<Props, State> {
  state: State = { hasError: false, digest: null, detail: null };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: React.ErrorInfo) {
    // Full unredacted error goes only to the reporter — never into the DOM as-is.
    const digest = reportError(error, 'SafeBoundary');
    const raw = getErrorMessage(error);
    const detail =
      process.env.NODE_ENV === 'production'
        ? null
        : prepareErrorDetailForDom(raw);

    this.setState({ digest, detail });
  }

  reset = () => this.setState({ hasError: false, digest: null, detail: null });

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center justify-center p-8 rounded-lg border border-red-200 bg-red-50 text-center space-y-4"
        >
          <p className="text-red-700 font-medium">
            {this.props.fallbackTitle ?? 'This section failed to load.'}
          </p>
          {this.state.digest && (
            <p
              className="text-xs font-mono text-red-600/80"
              data-testid="safe-boundary-digest"
            >
              Reference: {this.state.digest}
            </p>
          )}
          {this.state.detail && (
            <p
              className="text-xs text-red-500 max-w-md break-words"
              data-testid="safe-boundary-detail"
            >
              {this.state.detail}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={this.reset}
              className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              Retry
            </button>
            <Link
              href="/"
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              Go Home
            </Link>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
