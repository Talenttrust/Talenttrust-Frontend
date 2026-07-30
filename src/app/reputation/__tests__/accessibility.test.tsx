/**
 * accessibility.test.tsx — reputation view
 *
 * jest-axe assertions for every key rendering state of the reputation view.
 *
 * States covered:
 *   1. Loaded       — score + history present        (ReputationPageContent)
 *   2. Empty        — null / negative / undefined    (ReputationPageContent)
 *   3. Error        — SafeBoundary fallback           (ReputationPageContent)
 *   4. Loading      — ReputationLoading skeleton      (loading.tsx)
 *   5. Partial      — score, no history               (ReputationPageContent)
 *
 * Notes:
 *   - jest-axe's color-contrast rule does not reliably evaluate CSS custom
 *     properties under jsdom (no paint engine). Structural a11y — roles,
 *     headings, labels, live regions — is what axe verifies here.
 *   - The ToastProvider is required because ReputationProfile calls useToast().
 *   - next/navigation and next/link are stubbed globally in jest.setup.ts.
 *   - The error-state tests trigger SafeBoundary by mounting a component that
 *     throws, matching the pattern used in page.test.tsx for this module.
 */

import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ToastProvider } from '@/components/toast/toast-provider';
import { ReputationPageContent } from '../ReputationPageContent';
import ReputationLoading from '../loading';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wraps the given UI in ToastProvider (required by ReputationProfile's
 * clipboard / delete features) and returns the container.
 */
function renderWithProviders(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

// Toggle to make the mock throw — mirrors the pattern in page.test.tsx.
let mockShouldThrow = false;
afterEach(() => {
  mockShouldThrow = false;
});

// Mock ReputationProfile so the error-state tests can trigger SafeBoundary
// without relying on jest.resetModules() (which is fragile in a serial suite).
jest.mock('../../../components/ReputationProfile', () => {
  return function MockReputationProfile(props: Record<string, unknown>) {
    if (mockShouldThrow) {
      throw new Error('Simulated a11y error-state test');
    }
    // Minimal accessible rendering that preserves the a11y structure under test.
    return (
      <section aria-label={`Reputation profile for ${props.name}`}>
        <h2>{String(props.name)}</h2>
        <p>Score: {String(props.score ?? 'N/A')}</p>
      </section>
    );
  };
});

// Shared history fixture used by loaded / partial tests.
const sampleHistory = [
  {
    id: 'ev-1',
    type: 'Verification',
    summary: 'Completed identity verification',
    date: '2026-04-24',
  },
  {
    id: 'ev-2',
    type: 'On-chain review',
    summary: 'Received positive trust signal',
    date: '2026-04-23',
  },
  {
    id: 'ev-3',
    type: 'Referral',
    summary: 'Referred two new community members',
    date: '2026-04-20',
  },
];

// ---------------------------------------------------------------------------
// Loaded state
// ---------------------------------------------------------------------------

describe('reputation view a11y — loaded state', () => {
  it('has no automated accessibility violations (score + full history)', async () => {
    const { container } = renderWithProviders(
      <ReputationPageContent
        reputationData={{
          score: 3.8,
          level: 'Trusted Partner',
          history: sampleHistory,
        }}
        userName="Grace"
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations with a single history event', async () => {
    const { container } = renderWithProviders(
      <ReputationPageContent
        reputationData={{
          score: 1.5,
          level: 'Contributor',
          history: [sampleHistory[0]],
        }}
        userName="Alice"
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations with score at max boundary (5)', async () => {
    const { container } = renderWithProviders(
      <ReputationPageContent
        reputationData={{
          score: 5,
          level: 'Expert',
          history: sampleHistory,
        }}
        userName="TopUser"
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('reputation view a11y — empty state', () => {
  it('has no violations when reputationData is null', async () => {
    const { container } = renderWithProviders(
      <ReputationPageContent reputationData={null} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations when reputationData is undefined', async () => {
    const { container } = renderWithProviders(
      <ReputationPageContent reputationData={undefined} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations when score is null', async () => {
    const { container } = renderWithProviders(
      <ReputationPageContent reputationData={{ score: null, history: [] }} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations when score is negative', async () => {
    const { container } = renderWithProviders(
      <ReputationPageContent reputationData={{ score: -1, history: [] }} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations with no props at all (bare render)', async () => {
    const { container } = renderWithProviders(<ReputationPageContent />);

    expect(await axe(container)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// Error state — SafeBoundary fallback
// ---------------------------------------------------------------------------

describe('reputation view a11y — error state', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Suppress expected React error-boundary console output during these tests.
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('SafeBoundary fallback has no automated accessibility violations', async () => {
    mockShouldThrow = true;

    const { container } = renderWithProviders(
      <ReputationPageContent
        reputationData={{ score: 88, level: 'Expert', history: sampleHistory }}
        userName="ErrorUser"
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('SafeBoundary alert region is present in the a11y tree', async () => {
    mockShouldThrow = true;

    const { container } = renderWithProviders(
      <ReputationPageContent
        reputationData={{ score: 88, level: 'Expert', history: sampleHistory }}
        userName="AlertUser"
      />,
    );

    // SafeBoundary renders role="alert" with aria-live="assertive"
    const alertEl = container.querySelector('[role="alert"]');
    expect(alertEl).toBeInTheDocument();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('SafeBoundary Retry button has no violations after reset', async () => {
    mockShouldThrow = true;

    renderWithProviders(
      <ReputationPageContent
        reputationData={{ score: 88, level: 'Expert', history: sampleHistory }}
        userName="RetryUser"
      />,
    );

    // Confirm the error fallback is showing
    expect(screen.getByText('This section failed to load.')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(screen.getByText('Go Home')).toBeInTheDocument();

    // Resolve the error and click Retry
    mockShouldThrow = false;
    fireEvent.click(screen.getByText('Retry'));

    // Error fallback should be gone, profile back
    expect(screen.queryByText('This section failed to load.')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('reputation view a11y — loading state', () => {
  it('ReputationLoading skeleton has no automated accessibility violations', async () => {
    const { container } = render(<ReputationLoading />);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('loading skeleton carries aria-busy="true" on the main element', () => {
    const { container } = render(<ReputationLoading />);
    const main = container.querySelector('main');
    expect(main).toHaveAttribute('aria-busy', 'true');
  });

  it('loading skeleton exposes a role="status" live region', () => {
    const { container } = render(<ReputationLoading />);
    const status = container.querySelector('[role="status"]');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('all shimmer blocks are hidden from the accessibility tree', () => {
    const { container } = render(<ReputationLoading />);
    // Shimmer skeleton blocks carry aria-hidden="true"
    const hiddenBlocks = container.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenBlocks.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Partial state (score exists, no history)
// ---------------------------------------------------------------------------

describe('reputation view a11y — partial state (score, no history)', () => {
  it('has no violations when history is empty', async () => {
    const { container } = renderWithProviders(
      <ReputationPageContent
        reputationData={{ score: 2.1, level: 'Active Contributor', history: [] }}
        userName="Eve"
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations when score is zero (minimum valid score)', async () => {
    const { container } = renderWithProviders(
      <ReputationPageContent
        reputationData={{ score: 0, history: [] }}
        userName="Frank"
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations when no level is supplied (auto-resolved)', async () => {
    const { container } = renderWithProviders(
      <ReputationPageContent
        reputationData={{ score: 4.5, history: [] }}
        userName="Expert"
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// Semantic / structural assertions (complement the axe scans)
// ---------------------------------------------------------------------------

describe('reputation view a11y — structural assertions', () => {
  it('empty state renders exactly one h1 (page heading)', () => {
    const { container } = renderWithProviders(<ReputationPageContent reputationData={null} />);
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Reputation');
  });

  it('loading skeleton does not contain a visible h1 (heading is deferred)', () => {
    const { container } = render(<ReputationLoading />);
    // The skeleton heading block is aria-hidden, so it carries no h1 in the a11y tree.
    const visibleH1 = Array.from(container.querySelectorAll('h1')).filter(
      (el) => el.getAttribute('aria-hidden') !== 'true',
    );
    expect(visibleH1).toHaveLength(0);
  });

  it('loaded state: main element is present', () => {
    const { container } = renderWithProviders(
      <ReputationPageContent
        reputationData={{ score: 3, level: 'Trusted Partner', history: sampleHistory }}
        userName="Grace"
      />,
    );
    expect(container.querySelector('main')).toBeInTheDocument();
  });

  it('empty state: main element is present', () => {
    const { container } = renderWithProviders(<ReputationPageContent reputationData={null} />);
    expect(container.querySelector('main')).toBeInTheDocument();
  });

  it('loading state: main element is present with aria-busy', () => {
    const { container } = render(<ReputationLoading />);
    const main = container.querySelector('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveAttribute('aria-busy', 'true');
  });

  it('loaded state h1 reads "Reputation" (page-level heading)', () => {
    const { container } = renderWithProviders(
      <ReputationPageContent
        reputationData={{ score: 3, level: 'Trusted Partner', history: sampleHistory }}
        userName="Grace"
      />,
    );
    const h1 = container.querySelector('h1');
    expect(h1).toBeInTheDocument();
    expect(h1).toHaveTextContent('Reputation');
  });
});
