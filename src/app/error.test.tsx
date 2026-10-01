import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import GlobalError from './error';
import { setErrorReporter } from '../lib/errorReporter';

const testError = new Error('private failure details');
const noopReset = jest.fn();

function renderError(reset: () => void | Promise<void> = noopReset, error = testError) {
  return render(<GlobalError error={error} reset={reset} />);
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  setErrorReporter(null);
  noopReset.mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  setErrorReporter(null);
});

describe('App Router error boundary', () => {
  it('renders a safe fallback and reports the error once per identity', () => {
    const reporter = jest.fn();
    setErrorReporter(reporter);
    const errorA = new Error('private A');
    const errorB = new Error('private B');
    const { rerender } = renderError(noopReset, errorA);

    rerender(<GlobalError error={errorB} reset={noopReset} />);
    rerender(<GlobalError error={errorA} reset={noopReset} />);

    expect(reporter).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('heading', { name: 'Unexpected Error' })).toBeInTheDocument();
    expect(screen.queryByText(/private failure details|private A|private B/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go Home' })).toHaveAttribute('href', '/');
  });

  it('does not expose malformed error values or digests', () => {
    const reporter = jest.fn();
    setErrorReporter(reporter);
    const unsafeValue = 'sensitive primitive' as unknown as Error;
    const digestError = Object.assign(new Error('private digest error'), { digest: 'secret-digest' });
    const { rerender } = renderError(noopReset, unsafeValue);
    rerender(<GlobalError error={digestError} reset={noopReset} />);

    expect(reporter).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/sensitive primitive|private digest error|secret-digest/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unexpected Error' })).toBeInTheDocument();
  });

  it('supports synchronous Next.js reset and announces the retry', () => {
    const reset = jest.fn();
    renderError(reset);

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(/retrying/i);
  });

  it('blocks racing clicks until an asynchronous reset settles, then allows a retry', async () => {
    let settleFirst!: (value?: void) => void;
    const first = new Promise<void>((resolve) => { settleFirst = resolve; });
    const reset = jest.fn().mockReturnValueOnce(first).mockResolvedValueOnce(undefined);
    renderError(reset);
    const button = screen.getByRole('button', { name: 'Try Again' });

    fireEvent.click(button);
    fireEvent.click(button);
    expect(reset).toHaveBeenCalledTimes(1);

    await act(async () => { settleFirst(); await first; });
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it('contains rejected retries, reports them, and never leaks their details', async () => {
    const reporter = jest.fn();
    setErrorReporter(reporter);
    const reset = jest.fn()
      .mockRejectedValueOnce(new Error('secret reset detail'))
      .mockResolvedValueOnce(undefined);
    renderError(reset);

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(screen.getByRole('alert')).toHaveTextContent(/recovery failed/i);
    expect(screen.queryByText('secret reset detail')).not.toBeInTheDocument();
    expect(reporter).toHaveBeenCalledWith(
      expect.any(Error),
      'Error Boundary reset',
      'error',
      { retryCount: 1 },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(reset).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('contains a reset that throws undefined and still releases the retry lock', () => {
    const reset = jest.fn()
      .mockImplementationOnce(() => { throw undefined; })
      .mockImplementationOnce(() => {});
    renderError(reset);

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/recovery failed/i);
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

    expect(reset).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('counts each accepted failed attempt and stops at the retry boundary', () => {
    const reset = jest.fn(() => { throw new Error('reset failure'); });
    renderError(reset);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    }

    expect(reset).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload Page' })).toBeInTheDocument();
    expect(screen.getByText(/unable to recover after several attempts/i)).toBeInTheDocument();
  });

  it('handles malformed error and reset inputs without exposing values', () => {
    expect(() => render(<GlobalError error={null as unknown as Error} reset={null as unknown as () => void} />)).not.toThrow();
    expect(screen.getByRole('heading', { name: 'Unexpected Error' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/recovery failed/i);
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.queryByRole('button', { name: 'Try Again' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload Page' })).toBeInTheDocument();
  });
});
