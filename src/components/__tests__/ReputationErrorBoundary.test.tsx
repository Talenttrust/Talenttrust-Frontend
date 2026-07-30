/**
 * ReputationErrorBoundary — comprehensive test suite
 *
 * Covers:
 *   1. Normal render (children pass-through, no error)
 *   2. Fallback UI rendered when a child throws
 *   3. Accessible attributes on the fallback (role, aria-live, aria-atomic)
 *   4. autoFocus on the retry button
 *   5. Error message displayed in the fallback
 *   6. Retry re-mounts children (successful recovery)
 *   7. Retry that still fails keeps the fallback visible
 *   8. Custom fallback prop
 *   9. onError callback invoked with error + info
 *  10. reportError called with correct context and level
 *  11. reportError called with component-stack metadata
 *  12. reportError NOT called when no error
 *  13. Multiple successive errors — each one reported
 *  14. Deeply nested descendants
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ReputationErrorBoundary from '../ReputationErrorBoundary';
import { setErrorReporter } from '@/lib/errorReporter';

// ---------------------------------------------------------------------------
// Suppress React's own error-boundary console noise in all tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  setErrorReporter(null);
});

afterEach(() => {
  jest.restoreAllMocks();
  setErrorReporter(null);
});

// ---------------------------------------------------------------------------
// Reusable test helpers
// ---------------------------------------------------------------------------

/** Renders children but throws when shouldThrow is true. */
const Bomb = ({ shouldThrow, message = 'Test explosion' }: { shouldThrow: boolean; message?: string }) => {
  if (shouldThrow) throw new Error(message);
  return <div>Safe content</div>;
};

/** A Bomb that is nested three levels deep. */
const DeepBomb = ({ shouldThrow }: { shouldThrow: boolean }) => (
  <div>
    <div>
      <div>
        <Bomb shouldThrow={shouldThrow} />
      </div>
    </div>
  </div>
);

// ===========================================================================
// 1. Normal render — children pass-through
// ===========================================================================

describe('ReputationErrorBoundary — normal render', () => {
  it('renders children when no error is thrown', () => {
    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow={false} />
      </ReputationErrorBoundary>,
    );

    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('does not render the fallback when children are healthy', () => {
    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow={false} />
      </ReputationErrorBoundary>,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('renders multiple healthy children', () => {
    render(
      <ReputationErrorBoundary>
        <span>child-one</span>
        <span>child-two</span>
      </ReputationErrorBoundary>,
    );

    expect(screen.getByText('child-one')).toBeInTheDocument();
    expect(screen.getByText('child-two')).toBeInTheDocument();
  });
});

// ===========================================================================
// 2. Fallback UI rendered when a child throws
// ===========================================================================

describe('ReputationErrorBoundary — fallback UI on error', () => {
  it('renders the fallback container when a child throws', () => {
    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders the human-readable heading in the fallback', () => {
    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    expect(
      screen.getByText(/the reputation section couldn.t load/i),
    ).toBeInTheDocument();
  });

  it('renders the helper text in the fallback', () => {
    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    expect(screen.getByText(/this is likely a temporary issue/i)).toBeInTheDocument();
  });

  it('renders a "Retry" button in the fallback', () => {
    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('hides children when the fallback is shown', () => {
    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    expect(screen.queryByText('Safe content')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 3. Accessibility attributes on the fallback
// ===========================================================================

describe('ReputationErrorBoundary — fallback accessibility', () => {
  it('uses role="alert" on the fallback container', () => {
    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('sets aria-live="assertive" on the fallback container', () => {
    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  it('sets aria-atomic="true" on the fallback container', () => {
    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-atomic', 'true');
  });

  it('the retry button has type="button" (not submit)', () => {
    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    expect(screen.getByRole('button', { name: /retry/i })).toHaveAttribute('type', 'button');
  });
});

// ===========================================================================
// 4. autoFocus on the retry button
// ===========================================================================

describe('ReputationErrorBoundary — autoFocus on retry button', () => {
  it('the retry button has the autoFocus attribute when the fallback is shown', () => {
    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    const btn = screen.getByRole('button', { name: /retry/i });
    expect(btn).toHaveFocus();
  });
});

// ===========================================================================
// 5. Error message displayed in the fallback
// ===========================================================================

describe('ReputationErrorBoundary — error message in fallback', () => {
  it('displays the thrown error message in the fallback', () => {
    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow message="Cannot read properties of undefined" />
      </ReputationErrorBoundary>,
    );

    expect(
      screen.getByTestId('reputation-error-message'),
    ).toHaveTextContent('Cannot read properties of undefined');
  });

  it('does not render the error message element when the error has no message', () => {
    const NoMessageBomb = () => {
      throw Object.assign(new Error(), { message: '' });
    };

    render(
      <ReputationErrorBoundary>
        <NoMessageBomb />
      </ReputationErrorBoundary>,
    );

    expect(screen.queryByTestId('reputation-error-message')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 6. Retry — successful recovery
// ===========================================================================

describe('ReputationErrorBoundary — retry and recovery', () => {
  it('re-mounts children after clicking "Retry" when the fix has been applied', () => {
    let shouldThrow = true;
    const Child = () => <Bomb shouldThrow={shouldThrow} />;

    const { rerender } = render(
      <ReputationErrorBoundary>
        <Child />
      </ReputationErrorBoundary>,
    );

    // Sanity: fallback is visible
    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Simulate the underlying issue being resolved
    shouldThrow = false;

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    });

    // Force rerender so React picks up the updated closure value
    rerender(
      <ReputationErrorBoundary>
        <Child />
      </ReputationErrorBoundary>,
    );

    expect(screen.getByText('Safe content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the displayed error message after a successful retry', () => {
    let shouldThrow = true;
    const Child = () => <Bomb shouldThrow={shouldThrow} message="Boom" />;

    const { rerender } = render(
      <ReputationErrorBoundary>
        <Child />
      </ReputationErrorBoundary>,
    );

    shouldThrow = false;

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    });

    rerender(
      <ReputationErrorBoundary>
        <Child />
      </ReputationErrorBoundary>,
    );

    expect(screen.queryByTestId('reputation-error-message')).not.toBeInTheDocument();
  });
});

// ===========================================================================
// 7. Retry that still fails — fallback stays visible
// ===========================================================================

describe('ReputationErrorBoundary — retry that still fails', () => {
  it('keeps the fallback visible when the retry also throws', () => {
    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    // Click Retry — child still throws
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    });

    // Fallback should still be present
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

// ===========================================================================
// 8. Custom fallback prop
// ===========================================================================

describe('ReputationErrorBoundary — custom fallback prop', () => {
  it('renders the custom fallback instead of the built-in one when provided', () => {
    render(
      <ReputationErrorBoundary fallback={<div>Custom error UI</div>}>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('does not render the custom fallback when there is no error', () => {
    render(
      <ReputationErrorBoundary fallback={<div>Custom error UI</div>}>
        <Bomb shouldThrow={false} />
      </ReputationErrorBoundary>,
    );

    expect(screen.queryByText('Custom error UI')).not.toBeInTheDocument();
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });
});

// ===========================================================================
// 9. onError callback
// ===========================================================================

describe('ReputationErrorBoundary — onError callback', () => {
  it('calls onError with the thrown error when a child throws', () => {
    const onError = jest.fn();
    const expectedError = new Error('callback-test');

    const ThrowOnMount = () => {
      throw expectedError;
    };

    render(
      <ReputationErrorBoundary onError={onError}>
        <ThrowOnMount />
      </ReputationErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expectedError, expect.any(Object));
  });

  it('calls onError with an ErrorInfo object that includes componentStack', () => {
    const onError = jest.fn();

    render(
      <ReputationErrorBoundary onError={onError}>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    const [, errorInfo] = onError.mock.calls[0];
    expect(errorInfo).toHaveProperty('componentStack');
  });

  it('does not call onError when no error is thrown', () => {
    const onError = jest.fn();

    render(
      <ReputationErrorBoundary onError={onError}>
        <Bomb shouldThrow={false} />
      </ReputationErrorBoundary>,
    );

    expect(onError).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 10. reportError called with correct context and level
// ===========================================================================

describe('ReputationErrorBoundary — reportError integration', () => {
  it('calls the error reporter with context "ReputationErrorBoundary"', () => {
    const mockReporter = jest.fn();
    setErrorReporter(mockReporter);

    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    expect(mockReporter).toHaveBeenCalledTimes(1);
    expect(mockReporter).toHaveBeenCalledWith(
      expect.any(Error),
      'ReputationErrorBoundary',
      'error',
      expect.any(Object),
    );
  });

  it('passes the exact thrown Error instance to the reporter', () => {
    const mockReporter = jest.fn();
    setErrorReporter(mockReporter);

    const specificError = new Error('specific-error-payload');
    const Thrower = () => {
      throw specificError;
    };

    render(
      <ReputationErrorBoundary>
        <Thrower />
      </ReputationErrorBoundary>,
    );

    expect(mockReporter.mock.calls[0][0]).toBe(specificError);
  });

  it('uses level "error" (not "warn") when reporting', () => {
    const mockReporter = jest.fn();
    setErrorReporter(mockReporter);

    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    expect(mockReporter.mock.calls[0][2]).toBe('error');
  });
});

// ===========================================================================
// 11. reportError called with component-stack metadata
// ===========================================================================

describe('ReputationErrorBoundary — component stack in metadata', () => {
  it('includes a componentStack in the meta argument to reportError', () => {
    const mockReporter = jest.fn();
    setErrorReporter(mockReporter);

    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    const meta = mockReporter.mock.calls[0][3];
    expect(meta).toHaveProperty('componentStack');
  });
});

// ===========================================================================
// 12. reportError NOT called when no error occurs
// ===========================================================================

describe('ReputationErrorBoundary — reportError not called on clean render', () => {
  it('does not invoke the error reporter when children render successfully', () => {
    const mockReporter = jest.fn();
    setErrorReporter(mockReporter);

    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow={false} />
      </ReputationErrorBoundary>,
    );

    expect(mockReporter).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 13. Multiple successive errors — each one reported
// ===========================================================================

describe('ReputationErrorBoundary — successive errors reported separately', () => {
  it('reports both the first and the second error when retry also fails', () => {
    const mockReporter = jest.fn();
    setErrorReporter(mockReporter);

    // Always throws — simulates a persistent failure
    render(
      <ReputationErrorBoundary>
        <Bomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    // First error is reported on mount
    expect(mockReporter).toHaveBeenCalledTimes(1);

    // Click Retry — child still throws, triggering componentDidCatch again
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    });

    expect(mockReporter).toHaveBeenCalledTimes(2);
  });
});

// ===========================================================================
// 14. Deeply nested descendants
// ===========================================================================

describe('ReputationErrorBoundary — deeply nested errors', () => {
  it('catches errors thrown in deeply nested descendants', () => {
    render(
      <ReputationErrorBoundary>
        <DeepBomb shouldThrow />
      </ReputationErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Safe content')).not.toBeInTheDocument();
  });

  it('renders nested children normally when no error is thrown', () => {
    render(
      <ReputationErrorBoundary>
        <DeepBomb shouldThrow={false} />
      </ReputationErrorBoundary>,
    );

    expect(screen.getByText('Safe content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
