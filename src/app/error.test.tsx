import { render, screen, fireEvent } from '@testing-library/react';
import GlobalError from './error';
import { setErrorReporter, resolveErrorDigest } from '../lib/errorReporter';

// Suppress React error boundary noise in test output
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  setErrorReporter(null);
});
afterEach(() => {
  jest.restoreAllMocks();
  setErrorReporter(null);
});

const testError = Object.assign(new Error('Something broke'), { digest: undefined as string | undefined });
const mockReset = jest.fn();

describe('Error page', () => {
  it('renders generic error message without leaking error details as the headline', () => {
    render(<GlobalError error={testError} reset={mockReset} />);
    expect(screen.getByRole('heading', { name: /unexpected error/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Something broke' })).not.toBeInTheDocument();
  });

  it('calls reset when Try Again is clicked', () => {
    render(<GlobalError error={testError} reset={mockReset} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('renders Home and Contact Support links', () => {
    render(<GlobalError error={testError} reset={mockReset} />);
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /contact support/i })).toBeInTheDocument();
  });

  it('logs error to console only in non-production', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(<GlobalError error={testError} reset={mockReset} />);
    expect(spy).toHaveBeenCalledWith('[Error Boundary]', testError);
  });

  it('displays the reporter digest as a safe support reference', () => {
    const err = Object.assign(new Error('Something broke'), { digest: undefined as string | undefined });
    const expected = resolveErrorDigest(err);
    render(<GlobalError error={err} reset={mockReset} />);
    expect(screen.getByTestId('error-boundary-digest')).toHaveTextContent(`Reference: ${expected}`);
  });

  it('prefers an existing Next.js digest when present', () => {
    const err = Object.assign(new Error('Something broke'), { digest: 'next-abc123' });
    render(<GlobalError error={err} reset={mockReset} />);
    expect(screen.getByTestId('error-boundary-digest')).toHaveTextContent('Reference: next-abc123');
  });

  it('does not render raw message or stack in production', () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as { NODE_ENV?: string }).NODE_ENV = 'production';
    try {
      const err = Object.assign(
        new Error('Secret stack\n    at boom (src/app/page.tsx:1:1)'),
        { digest: 'prod-digest' }
      );
      render(<GlobalError error={err} reset={mockReset} />);
      expect(screen.queryByTestId('error-boundary-detail')).not.toBeInTheDocument();
      expect(screen.queryByText(/Secret stack/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/page\.tsx/i)).not.toBeInTheDocument();
      expect(screen.getByTestId('error-boundary-digest')).toHaveTextContent('Reference: prod-digest');
    } finally {
      (process.env as { NODE_ENV?: string }).NODE_ENV = originalEnv;
    }
  });

  it('invokes the pluggable error reporter when rendered', () => {
    const mockReporter = jest.fn();
    setErrorReporter(mockReporter);

    render(<GlobalError error={testError} reset={mockReset} />);

    expect(mockReporter).toHaveBeenCalledTimes(1);
    expect(mockReporter).toHaveBeenCalledWith(testError, 'Error Boundary', undefined, undefined);
  });
});
