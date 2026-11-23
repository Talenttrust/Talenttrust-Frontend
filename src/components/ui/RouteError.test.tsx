import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouteError } from '@/components/ui/RouteError';
import { setErrorReporter } from '@/lib/errorReporter';

afterEach(() => {
  vi.unstubAllEnvs();
  setErrorReporter(null);
});

const makeError = () => Object.assign(new Error('boom internal detail'), { digest: 'abc123' });

describe('RouteError', () => {
  it('renders a friendly message and calls reset on Try again', async () => {
    const reset = vi.fn();
    render(<RouteError error={makeError()} reset={reset} />);
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('shows error details in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    render(<RouteError error={makeError()} reset={vi.fn()} />);
    expect(screen.getByText(/boom internal detail/i)).toBeInTheDocument();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it('hides error details in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    render(<RouteError error={makeError()} reset={vi.fn()} />);
    expect(screen.queryByText(/boom internal detail/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/abc123/)).not.toBeInTheDocument();
  });

  it('exposes a Go home link', () => {
    render(<RouteError error={makeError()} reset={vi.fn()} />);
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/');
  });

  it('reports the error once per mount, even across re-renders', () => {
    const reporter = vi.fn();
    setErrorReporter(reporter);
    const error = makeError();
    const { rerender } = render(<RouteError error={error} reset={vi.fn()} />);
    rerender(<RouteError error={error} reset={vi.fn()} />);
    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter.mock.calls[0][0]).toBe(error);
    expect(reporter.mock.calls[0][1]).toMatchObject({ source: 'RouteError', digest: 'abc123' });
  });
});
