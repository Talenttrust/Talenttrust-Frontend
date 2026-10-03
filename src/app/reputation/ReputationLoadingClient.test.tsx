/**
 * ReputationLoadingClient.test.tsx
 *
 * Focus-management coverage for the reputation loading boundary
 * (jest + React Testing Library). Full behavioural coverage lives in
 * `__tests__/ReputationLoadingClient.test.tsx`.
 */

import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';
import ReputationLoadingClient from './ReputationLoadingClient';

jest.mock('./loading', () => ({
  __esModule: true,
  default: () => (
    <div data-testid="reputation-loading">
      <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        Loading reputation…
      </span>
    </div>
  ),
}));

describe('ReputationLoadingClient', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders the loading state inside a main landmark with aria-busy', () => {
    render(<ReputationLoadingClient />);

    expect(screen.getByTestId('reputation-loading')).toBeInTheDocument();

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('aria-busy', 'true');
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('focuses the main element after the scheduled delay', () => {
    render(<ReputationLoadingClient />);

    const focusSpy = jest.spyOn(HTMLElement.prototype, 'focus');

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('does not focus when unmounted before the timer fires', () => {
    const { unmount } = render(<ReputationLoadingClient />);

    const focusSpy = jest.spyOn(HTMLElement.prototype, 'focus');

    unmount();

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('clears the pending timer on unmount to avoid leaks', () => {
    const clearSpy = jest.spyOn(globalThis, 'clearTimeout');

    const { unmount } = render(<ReputationLoadingClient />);
    unmount();

    expect(clearSpy).toHaveBeenCalled();
  });

  it('focuses only once even if extra time passes', () => {
    render(<ReputationLoadingClient />);

    const focusSpy = jest.spyOn(HTMLElement.prototype, 'focus');

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(focusSpy).toHaveBeenCalledTimes(1);
  });
});

