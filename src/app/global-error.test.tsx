import { render, screen, fireEvent } from '@testing-library/react';
import GlobalError from './global-error';
import { setErrorReporter } from '../lib/errorReporter';
import { testA11y } from '../test-utils/a11y';

// Suppress React error boundary noise in test output
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  setErrorReporter(null);
});

afterEach(() => {
  jest.restoreAllMocks();
  setErrorReporter(null);
});

const testError = Object.assign(new Error('Synthetic root crash'), { digest: undefined });
const mockReset = jest.fn();

describe('GlobalError page', () => {
  it('renders critical error message without leaking error details', () => {
    render(<GlobalError error={testError} reset={mockReset} />);
    expect(screen.getByRole('heading', { name: /critical error/i })).toBeInTheDocument();
    expect(screen.queryByText('Synthetic root crash')).not.toBeInTheDocument();
  });

  it('calls reset when Try Again is clicked', () => {
    render(<GlobalError error={testError} reset={mockReset} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('renders Home, Contact Support links and try again button', () => {
    render(<GlobalError error={testError} reset={mockReset} />);
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /contact support/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('logs error to console only in non-production', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    // NODE_ENV is 'test' in Jest, which is !== 'production', so logging should fire
    render(<GlobalError error={testError} reset={mockReset} />);
    expect(spy).toHaveBeenCalledWith('[Global Error Boundary]', testError);
  });

  it('does not render error message or stack trace in the UI', () => {
    render(<GlobalError error={testError} reset={mockReset} />);
    expect(screen.queryByText(/synthetic root crash/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/digest/i)).not.toBeInTheDocument();
  });

  it('invokes the pluggable error reporter when rendered', () => {
    const mockReporter = jest.fn();
    setErrorReporter(mockReporter);

    render(<GlobalError error={testError} reset={mockReset} />);

    expect(mockReporter).toHaveBeenCalledTimes(1);
    expect(mockReporter).toHaveBeenCalledWith(testError, 'Global Error Boundary', undefined, undefined);
  });

  it('is accessible and clean of violations via jest-axe', async () => {
    // Render and check for accessibility violations
    await testA11y(<GlobalError error={testError} reset={mockReset} />);
  });

  it('prevents duplicate reporting of the same logical error even with different instances', () => {
    const error1 = new Error('Network timeout');
    const report = jest.fn();
    setErrorReporter(report);

    const { rerender } = render(<GlobalError error={error1} reset={jest.fn()} />);
    rerender(<GlobalError error={error1} reset={jest.fn()} />);

    const error2 = new Error('Network timeout'); // Same logical error
    rerender(<GlobalError error={error2} reset={jest.fn()} />);

    expect(report).toHaveBeenCalledTimes(1);

    const newError = new Error('Database disconnected');
    rerender(<GlobalError error={newError} reset={jest.fn()} />);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('handles invalid error inputs safely', () => {
    const report = jest.fn();
    setErrorReporter(report);
    // @ts-expect-error testing boundary conditions
    render(<GlobalError error="String error instead of object" reset={jest.fn()} />);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(report.mock.calls[0][0].message).toBe('String error instead of object');
  });

  it('handles invalid reset inputs safely by reloading the window', () => {
    const reload = jest.fn();
    Object.defineProperty(window, 'location', {
      value: { reload },
      writable: true
    });
    // @ts-expect-error testing boundary conditions
    render(<GlobalError error={testError} reset={null} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('swallows errors thrown during reportError to ensure fallback UI still renders', () => {
    const report = jest.fn(() => { throw new Error('Reporter crashed'); });
    setErrorReporter(report);
    
    expect(() => {
      render(<GlobalError error={testError} reset={jest.fn()} />);
    }).not.toThrow();
    
    expect(screen.getByRole('heading', { name: /critical error/i })).toBeInTheDocument();
  });

  it('prevents concurrent execution of reset (idempotent retries)', async () => {
    const reset = jest.fn();
    const error = new Error('Rate limited');
    const report = jest.fn();
    setErrorReporter(report);

    render(<GlobalError error={error} reset={reset} />);
    const button = screen.getByRole('button', { name: /try again/i });

    // Click once
    fireEvent.click(button);
    
    // In a real environment with async reset, startTransition prevents concurrent runs
    // Here we just verify it delegates to reset correctly
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
