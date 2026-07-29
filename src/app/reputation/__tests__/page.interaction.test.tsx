import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReputationPageContent } from '../page';
import SafeBoundary from '../../../components/SafeBoundary';
import ReputationPage from '../page';

let mockShouldThrowInProfile = false;
afterEach(() => { mockShouldThrowInProfile = false; });

jest.mock('../../../components/ReputationProfile', () => {
  return function MockReputationProfile(props: any) {
    if (mockShouldThrowInProfile) {
      throw new Error('Simulated reputation crash');
    }
    return (
      <div data-testid="reputation-profile">
        <div data-testid="reputation-score">{props.score ?? 'N/A'}</div>
        <div data-testid="reputation-level">{props.level ?? (props.score === 50 ? 'Expert' : 'Community Member')}</div>
        <div data-testid="reputation-name">{props.name}</div>
        <div data-testid="reputation-history-count">{props.history?.length ?? 0}</div>
        {props.history && props.history.length > 0 && (
          <ul data-testid="reputation-history">
            {props.history.map((event: any) => (
              <li key={event.id} data-testid={`history-event-${event.id}`}>
                {event.type}: {event.summary}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };
});

jest.mock('../../../components/EmptyState', () => {
  return function MockEmptyState(props: any) {
    return (
      <div data-testid="empty-state">
        <div data-testid="empty-state-title">{props.title}</div>
        <div data-testid="empty-state-description">{props.description}</div>
      </div>
    );
  };
});

const SUCCESS_DATA = {
  score: 85,
  level: 'Trusted',
  history: [{ id: '1', type: 'Review', summary: 'Great work', date: '2026-04-24' }],
};

describe('SafeBoundary — custom fallback props', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renders custom fallback when provided instead of default error UI', async () => {
    const CustomFallback = <div data-testid="custom-fallback">Custom Error</div>;
    function ChildThatThrows() {
      throw new Error('test error');
    }

    render(
      <SafeBoundary fallback={CustomFallback}>
        <ChildThatThrows />
      </SafeBoundary>,
    );

    expect(screen.getByTestId('custom-fallback')).toHaveTextContent('Custom Error');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Go Home' })).not.toBeInTheDocument();
  });

  it('renders custom fallbackTitle in the default error UI when provided', async () => {
    function ChildThatThrows() {
      throw new Error('test error');
    }

    render(
      <SafeBoundary fallbackTitle="Custom error message">
        <ChildThatThrows />
      </SafeBoundary>,
    );

    expect(screen.getByText('Custom error message')).toBeInTheDocument();
    expect(screen.queryByText('This section failed to load.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go Home' })).toBeInTheDocument();
  });

  it('renders children normally when there is no error', async () => {
    render(
      <SafeBoundary>
        <div data-testid="child-content">Normal content</div>
      </SafeBoundary>,
    );

    expect(screen.getByTestId('child-content')).toHaveTextContent('Normal content');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ReputationPage default export', () => {
  it('renders without crashing and shows empty state', async () => {
    render(<ReputationPage />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No reputation yet')).toBeInTheDocument();
  });
});

describe('ReputationPageContent — error recovery interactions', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('error state shows when rendering fails', () => {
    it('renders error fallback when ReputationProfile throws', async () => {
      mockShouldThrowInProfile = true;
      render(<ReputationPageContent reputationData={SUCCESS_DATA} userName="ErrorUser" />);

      expect(screen.getByText('This section failed to load.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Go Home' })).toBeInTheDocument();
      expect(screen.queryByTestId('reputation-profile')).not.toBeInTheDocument();
      expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    });

    it('does not show error fallback when content renders successfully', async () => {
      render(<ReputationPageContent reputationData={SUCCESS_DATA} userName="GoodUser" />);

      expect(screen.queryByText('This section failed to load.')).not.toBeInTheDocument();
      expect(screen.getByTestId('reputation-profile')).toBeInTheDocument();
    });

    it('renders empty state (not error) when there is no reputation data even if profile would throw', async () => {
      mockShouldThrowInProfile = true;
      render(<ReputationPageContent reputationData={null} userName="EmptyError" />);

      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.queryByText('This section failed to load.')).not.toBeInTheDocument();
    });
  });

  describe('retry recovers from transient errors', () => {
    it('recovers after clicking Retry once the error is resolved', async () => {
      const user = userEvent.setup();
      mockShouldThrowInProfile = true;

      const { rerender } = render(
        <ReputationPageContent reputationData={SUCCESS_DATA} userName="Recover" />,
      );
      expect(screen.getByText('This section failed to load.')).toBeInTheDocument();

      mockShouldThrowInProfile = false;
      rerender(<ReputationPageContent reputationData={SUCCESS_DATA} userName="Recover" />);
      await user.click(screen.getByRole('button', { name: 'Retry' }));

      await screen.findByTestId('reputation-profile');
      expect(screen.queryByText('This section failed to load.')).not.toBeInTheDocument();
    });

    it('keeps error fallback visible when the component still throws after retry', async () => {
      const user = userEvent.setup();
      mockShouldThrowInProfile = true;

      render(<ReputationPageContent reputationData={SUCCESS_DATA} userName="Persist" />);
      expect(screen.getByText('This section failed to load.')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Retry' }));

      expect(screen.getByText('This section failed to load.')).toBeInTheDocument();
      expect(screen.queryByTestId('reputation-profile')).not.toBeInTheDocument();
    });

    it('recovers after multiple retry cycles (fail-retry-fail-retry-success)', async () => {
      const user = userEvent.setup();
      mockShouldThrowInProfile = true;

      const { rerender } = render(
        <ReputationPageContent reputationData={SUCCESS_DATA} userName="Multi" />,
      );
      expect(screen.getByText('This section failed to load.')).toBeInTheDocument();

      mockShouldThrowInProfile = true;
      rerender(<ReputationPageContent reputationData={SUCCESS_DATA} userName="Multi" />);
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      expect(screen.getByText('This section failed to load.')).toBeInTheDocument();

      mockShouldThrowInProfile = false;
      rerender(<ReputationPageContent reputationData={SUCCESS_DATA} userName="Multi" />);
      await user.click(screen.getByRole('button', { name: 'Retry' }));

      await screen.findByTestId('reputation-profile');
      expect(screen.queryByText('This section failed to load.')).not.toBeInTheDocument();
    });

    it('re-enters error state after a successful retry when error reoccurs', async () => {
      const user = userEvent.setup();
      mockShouldThrowInProfile = true;

      const { rerender } = render(
        <ReputationPageContent reputationData={SUCCESS_DATA} userName="Relapse" />,
      );
      expect(screen.getByText('This section failed to load.')).toBeInTheDocument();

      mockShouldThrowInProfile = false;
      rerender(<ReputationPageContent reputationData={SUCCESS_DATA} userName="Relapse" />);
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      await screen.findByTestId('reputation-profile');

      mockShouldThrowInProfile = true;
      rerender(<ReputationPageContent reputationData={SUCCESS_DATA} userName="Relapse" />);
      expect(screen.getByText('This section failed to load.')).toBeInTheDocument();
      expect(screen.queryByTestId('reputation-profile')).not.toBeInTheDocument();
    });
  });

  describe('dismiss clears the error state', () => {
    it('renders Go Home link with href="/" during error state', async () => {
      mockShouldThrowInProfile = true;
      render(<ReputationPageContent reputationData={SUCCESS_DATA} userName="Dismiss" />);

      const goHome = screen.getByRole('link', { name: 'Go Home' });
      expect(goHome).toHaveAttribute('href', '/');
    });

    it('Go Home link is accessible by keyboard interaction', async () => {
      const user = userEvent.setup();
      mockShouldThrowInProfile = true;

      render(<ReputationPageContent reputationData={SUCCESS_DATA} userName="KeyNav" />);

      const goHome = screen.getByRole('link', { name: 'Go Home' });
      expect(goHome).toHaveAttribute('href', '/');

      await user.click(goHome);
    });
  });

  describe('accessibility of error fallback', () => {
    it('fallback container has role="alert" and aria-live="assertive"', async () => {
      mockShouldThrowInProfile = true;
      render(<ReputationPageContent reputationData={SUCCESS_DATA} userName="A11y" />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('This section failed to load.');
      expect(alert).toHaveAttribute('aria-live', 'assertive');
    });

    it('Retry is rendered as a <button> element', async () => {
      mockShouldThrowInProfile = true;
      render(<ReputationPageContent reputationData={SUCCESS_DATA} userName="Btn" />);

      const retry = screen.getByRole('button', { name: 'Retry' });
      expect(retry.tagName).toBe('BUTTON');
    });

    it('Go Home is rendered as a link pointing to "/"', async () => {
      mockShouldThrowInProfile = true;
      render(<ReputationPageContent reputationData={SUCCESS_DATA} userName="Link" />);

      const goHome = screen.getByRole('link', { name: 'Go Home' });
      expect(goHome.tagName).toBe('A');
      expect(goHome).toHaveAttribute('href', '/');
    });
  });
});
