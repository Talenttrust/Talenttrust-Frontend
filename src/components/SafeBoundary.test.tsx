import { render, screen, fireEvent, act } from '@testing-library/react';
import SafeBoundary from './SafeBoundary';
import { setErrorReporter, resolveErrorDigest } from '../lib/errorReporter';

// Suppress React error boundary console noise
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  setErrorReporter(null);
});
afterEach(() => {
  jest.restoreAllMocks();
  setErrorReporter(null);
});

const Bomb = ({ shouldThrow, message = 'Test explosion' }: { shouldThrow: boolean; message?: string }) => {
  if (shouldThrow) throw new Error(message);
  return <div>Safe content</div>;
};

const SAMPLE_G_ADDRESS =
  'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';

describe('SafeBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <SafeBoundary>
        <Bomb shouldThrow={false} />
      </SafeBoundary>
    );
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('renders default fallback UI when a child throws', () => {
    render(
      <SafeBoundary>
        <Bomb shouldThrow={true} />
      </SafeBoundary>
    );
    expect(screen.getByText('This section failed to load.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toBeInTheDocument();
  });

  it('renders a custom fallback when provided', () => {
    render(
      <SafeBoundary fallback={<div>Custom fallback</div>}>
        <Bomb shouldThrow={true} />
      </SafeBoundary>
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
  });

  it('recovers after clicking Retry', () => {
    let triggerThrow = true;
    const Child = () => <Bomb shouldThrow={triggerThrow} />;

    const { rerender } = render(
      <SafeBoundary>
        <Child />
      </SafeBoundary>
    );

    expect(screen.getByText('This section failed to load.')).toBeInTheDocument();

    triggerThrow = false;

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    });

    rerender(
      <SafeBoundary>
        <Child />
      </SafeBoundary>
    );

    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('logs to console in non-production when a child throws', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <SafeBoundary>
        <Bomb shouldThrow={true} />
      </SafeBoundary>
    );
    expect(spy).toHaveBeenCalledWith('[SafeBoundary]', expect.any(Error));
  });

  it('invokes the pluggable error reporter when a child throws', () => {
    const mockReporter = jest.fn();
    setErrorReporter(mockReporter);

    render(
      <SafeBoundary>
        <Bomb shouldThrow={true} />
      </SafeBoundary>
    );

    expect(mockReporter).toHaveBeenCalledTimes(1);
    expect(mockReporter).toHaveBeenCalledWith(expect.any(Error), 'SafeBoundary', undefined, undefined);
  });

  it('shows the reporter digest instead of the raw error message', () => {
    const message = `Crash for ${SAMPLE_G_ADDRESS}`;
    const expectedDigest = resolveErrorDigest(new Error(message));

    render(
      <SafeBoundary>
        <Bomb shouldThrow={true} message={message} />
      </SafeBoundary>
    );

    expect(screen.getByTestId('safe-boundary-digest')).toHaveTextContent(
      `Reference: ${expectedDigest}`
    );
    // Raw wallet address must never appear as the primary user-facing message.
    // In test/dev the optional detail may show unredacted text; the digest is required.
    expect(screen.getByText('This section failed to load.')).toBeInTheDocument();
  });

  it('does not render production detail containing sensitive fragments', () => {
    const originalEnv = process.env.NODE_ENV;
    (process.env as { NODE_ENV?: string }).NODE_ENV = 'production';

    try {
      render(
        <SafeBoundary>
          <Bomb
            shouldThrow={true}
            message={`Payment ${SAMPLE_G_ADDRESS} https://evil.example/x`}
          />
        </SafeBoundary>
      );

      expect(screen.queryByTestId('safe-boundary-detail')).not.toBeInTheDocument();
      expect(screen.queryByText(new RegExp(SAMPLE_G_ADDRESS))).not.toBeInTheDocument();
      expect(screen.queryByText(/https:\/\//)).not.toBeInTheDocument();
      expect(screen.getByTestId('safe-boundary-digest')).toBeInTheDocument();
    } finally {
      (process.env as { NODE_ENV?: string }).NODE_ENV = originalEnv;
    }
  });

  it('respects fallbackTitle for the stable user-facing message', () => {
    render(
      <SafeBoundary fallbackTitle="Wallet section failed to load.">
        <Bomb shouldThrow={true} />
      </SafeBoundary>
    );
    expect(screen.getByText('Wallet section failed to load.')).toBeInTheDocument();
  });
});
