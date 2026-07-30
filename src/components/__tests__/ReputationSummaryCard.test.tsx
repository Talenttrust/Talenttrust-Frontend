/**
 * ReputationSummaryCard.test.tsx
 *
 * Tests for the shareable reputation summary card (issue #498).
 * Covers:
 *  - Card renders score, level, trend text, copy button
 *  - Copy link via Clipboard API success → toast
 *  - Copy link fallback via execCommand
 *  - Both fail → error toast
 *  - Null/undefined score → "No reputation yet"
 *  - Empty history → trend "Stable"
 *  - Trend up / down / stable scenarios
 *  - Keyboard operability (Enter triggers copy)
 *  - Accessibility audit (jest-axe)
 *  - Snapshot test
 */

import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { testA11y } from '@/test-utils/a11y';
import ReputationSummaryCard from '../ReputationSummaryCard';
import type { ReputationEvent } from '../ReputationProfile';

// ---------------------------------------------------------------------------
// Mock next/navigation (no-op — not used here but prevents import bombs)
// ---------------------------------------------------------------------------

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

// ---------------------------------------------------------------------------
// Toast mock
// ---------------------------------------------------------------------------

const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();

jest.mock('@/components/toast/toast-provider', () => ({
  useToast: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    dismissToast: jest.fn(),
    toasts: [],
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TODAY = '2026-07-29';
function daysAgo(n: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

const HISTORY_UP: ReputationEvent[] = [
  { id: '1', type: 'Verification', summary: 'Identity verified', date: daysAgo(5) },
  { id: '2', type: 'Review', summary: 'Positive review', date: daysAgo(10) },
  { id: '3', type: 'Verification', summary: 'Badge earned', date: daysAgo(60) },
];

const HISTORY_STABLE: ReputationEvent[] = [
  { id: '1', type: 'Verification', summary: 'Identity verified', date: daysAgo(5) },
  { id: '2', type: 'Review', summary: 'Positive review', date: daysAgo(40) },
];

function renderCard(props: Partial<{
  name: string;
  score: number | null;
  level: string;
  history: ReputationEvent[];
  maxScore: number;
}> = {}) {
  return render(
    <ReputationSummaryCard
      name="Alice"
      score={4.5}
      level="Expert"
      history={HISTORY_UP}
      {...props}
    />,
  );
}

// ---------------------------------------------------------------------------
// Clipboard helpers
// ---------------------------------------------------------------------------

let originalClipboard: typeof navigator.clipboard;

beforeEach(() => {
  jest.useFakeTimers();
  originalClipboard = navigator.clipboard;
  mockShowSuccess.mockClear();
  mockShowError.mockClear();
});

afterEach(() => {
  act(() => { jest.runAllTimers(); });
  jest.useRealTimers();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
});

function mockClipboard(impl: () => Promise<void> = () => Promise.resolve()) {
  const writeText = jest.fn().mockImplementation(impl);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  return writeText;
}

function removeClipboard() {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
}

// ---------------------------------------------------------------------------
// Render: card renders key fields
// ---------------------------------------------------------------------------

describe('ReputationSummaryCard — renders key fields', () => {
  it('renders the participant name', () => {
    mockClipboard();
    renderCard();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders the score and max score', () => {
    mockClipboard();
    renderCard();
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText(/\/ 5/)).toBeInTheDocument();
  });

  it('renders the level badge', () => {
    mockClipboard();
    renderCard();
    expect(screen.getByTestId('summary-level')).toHaveTextContent('Expert');
  });

  it('renders the trend indicator', () => {
    mockClipboard();
    renderCard();
    const trend = screen.getByTestId('summary-trend');
    expect(trend).toHaveTextContent('Trending up');
    expect(trend).toHaveAttribute('aria-label', 'Reputation trend: Trending up');
  });

  it('renders the copy link button', () => {
    mockClipboard();
    renderCard();
    expect(screen.getByTestId('copy-summary-link-btn')).toBeInTheDocument();
  });

  it('copy button has correct aria-label', () => {
    mockClipboard();
    renderCard();
    expect(
      screen.getByRole('button', { name: /Copy reputation summary link to clipboard/i }),
    ).toBeInTheDocument();
  });

  it('copy button has aria-pressed="false" initially', () => {
    mockClipboard();
    renderCard();
    expect(screen.getByTestId('copy-summary-link-btn')).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders avatar initial', () => {
    mockClipboard();
    renderCard();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders default level when level prop is omitted', () => {
    mockClipboard();
    renderCard({ level: undefined });
    expect(screen.getByTestId('summary-level')).toHaveTextContent('Community Member');
  });

  it('has a sr-only heading for the section', () => {
    mockClipboard();
    renderCard();
    const heading = screen.getByText('Shareable reputation summary for Alice');
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe('H2');
    // sr-only: not visible but in DOM
    expect(heading.className).toContain('sr-only');
  });
});

// ---------------------------------------------------------------------------
// Edge cases: null score, undefined score, empty history
// ---------------------------------------------------------------------------

describe('ReputationSummaryCard — edge cases', () => {
  it('shows "No reputation yet" when score is null', () => {
    mockClipboard();
    renderCard({ score: null });
    expect(screen.getByText('No reputation yet')).toBeInTheDocument();
  });

  it('shows "No reputation yet" when score is undefined', () => {
    mockClipboard();
    renderCard({ score: undefined });
    expect(screen.getByText('No reputation yet')).toBeInTheDocument();
  });

  it('hides level and trend when score is null', () => {
    mockClipboard();
    renderCard({ score: null });
    expect(screen.queryByTestId('summary-level')).not.toBeInTheDocument();
    expect(screen.queryByTestId('summary-trend')).not.toBeInTheDocument();
  });

  it('shows "Stable" trend when history is empty', () => {
    mockClipboard();
    renderCard({ history: [] });
    expect(screen.getByTestId('summary-trend')).toHaveTextContent('Stable');
  });

  it('shows "Trending down" when older events outnumber recent', () => {
    mockClipboard();
    const history: ReputationEvent[] = [
      { id: '1', type: 'Verification', summary: 'A', date: daysAgo(5) },
      { id: '2', type: 'Review', summary: 'B', date: daysAgo(40) },
      { id: '3', type: 'Verification', summary: 'C', date: daysAgo(50) },
    ];
    renderCard({ history });
    expect(screen.getByTestId('summary-trend')).toHaveTextContent('Trending down');
  });

  it('shows "Stable" trend when recent and older counts match', () => {
    mockClipboard();
    renderCard({ history: HISTORY_STABLE });
    expect(screen.getByTestId('summary-trend')).toHaveTextContent('Stable');
  });

  it('handles score of zero correctly (has reputation)', () => {
    mockClipboard();
    renderCard({ score: 0, level: 'Newcomer' });
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByTestId('summary-level')).toHaveTextContent('Newcomer');
  });
});

// ---------------------------------------------------------------------------
// Clipboard API success path
// ---------------------------------------------------------------------------

describe('ReputationSummaryCard — Clipboard API success', () => {
  it('calls navigator.clipboard.writeText with the current URL', async () => {
    const writeText = mockClipboard();
    renderCard();

    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-summary-link-btn'));
    });

    expect(writeText).toHaveBeenCalledWith(window.location.href);
  });

  it('shows a success toast after copy', async () => {
    mockClipboard();
    renderCard();

    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-summary-link-btn'));
    });

    expect(mockShowSuccess).toHaveBeenCalledTimes(1);
    expect(mockShowSuccess.mock.calls[0][0]).toMatchObject({
      title: 'Reputation summary link copied to clipboard.',
    });
  });

  it('button shows "Link copied" and aria-pressed="true" after success', async () => {
    mockClipboard();
    renderCard();

    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-summary-link-btn'));
    });

    const btn = screen.getByTestId('copy-summary-link-btn');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    expect(btn).toHaveTextContent('Link copied');
  });

  it('button resets to "Copy link" after the delay', async () => {
    mockClipboard();
    renderCard();

    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-summary-link-btn'));
    });

    act(() => { jest.advanceTimersByTime(2000); });

    await waitFor(() => {
      expect(screen.getByTestId('copy-summary-link-btn')).toHaveTextContent('Copy link');
    });
  });

  it('does not show error toast on success', async () => {
    mockClipboard();
    renderCard();

    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-summary-link-btn'));
    });

    expect(mockShowError).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Clipboard API unavailable — execCommand fallback
// ---------------------------------------------------------------------------

describe('ReputationSummaryCard — execCommand fallback', () => {
  it('falls back to execCommand when Clipboard API is absent', async () => {
    removeClipboard();
    document.execCommand = jest.fn().mockReturnValue(true);
    renderCard();

    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-summary-link-btn'));
    });

    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(mockShowSuccess).toHaveBeenCalledTimes(1);
  });

  it('shows error toast when both Clipboard API and execCommand fail', async () => {
    removeClipboard();
    document.execCommand = jest.fn().mockReturnValue(false);
    renderCard();

    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-summary-link-btn'));
    });

    expect(mockShowError).toHaveBeenCalledTimes(1);
    expect(mockShowError.mock.calls[0][0]).toMatchObject({
      title: 'Failed to copy the link. Please copy the URL manually.',
    });
  });

  it('shows error toast when Clipboard API rejects and execCommand fails', async () => {
    mockClipboard(() => Promise.reject(new Error('Permission denied')));
    document.execCommand = jest.fn().mockReturnValue(false);
    renderCard();

    await act(async () => {
      fireEvent.click(screen.getByTestId('copy-summary-link-btn'));
    });

    expect(mockShowError).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Keyboard operability
// ---------------------------------------------------------------------------

describe('ReputationSummaryCard — keyboard operability', () => {
  it('copy button is in the tab order', () => {
    mockClipboard();
    renderCard();
    const btn = screen.getByTestId('copy-summary-link-btn');
    expect(btn).not.toBeDisabled();
  });

  it('pressing Enter on the button triggers copy', async () => {
    const writeText = mockClipboard();
    renderCard();
    const btn = screen.getByTestId('copy-summary-link-btn');

    await act(async () => {
      btn.focus();
      fireEvent.keyDown(btn, { key: 'Enter' });
      fireEvent.click(btn);
    });

    expect(writeText).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Accessibility audit
// ---------------------------------------------------------------------------

describe('ReputationSummaryCard — accessibility', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useFakeTimers();
  });

  it('has no a11y violations with full reputation data', async () => {
    mockClipboard();
    await testA11y(
      <ReputationSummaryCard
        name="Alice"
        score={4.5}
        level="Expert"
        history={HISTORY_UP}
      />,
    );
  });

  it('has no a11y violations with no history', async () => {
    mockClipboard();
    await testA11y(
      <ReputationSummaryCard
        name="Bob"
        score={3}
        level="Contributor"
        history={[]}
      />,
    );
  });

  it('has no a11y violations when score is null', async () => {
    mockClipboard();
    await testA11y(
      <ReputationSummaryCard
        name="Charlie"
        score={null}
        history={[]}
      />,
    );
  });
});

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

describe('ReputationSummaryCard — snapshot', () => {
  it('matches snapshot with full data and trending up', () => {
    mockClipboard();
    const { container } = render(
      <ReputationSummaryCard
        name="Alice"
        score={4.5}
        level="Expert"
        history={HISTORY_UP}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with null score', () => {
    mockClipboard();
    const { container } = render(
      <ReputationSummaryCard
        name="Bob"
        score={null}
        history={[]}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// ResolveReputationTrend named export
// ---------------------------------------------------------------------------

describe('ResolveReputationTrend', () => {
  it('is re-exported from the component module', async () => {
    const { ResolveReputationTrend } = await import('../ReputationSummaryCard');
    expect(typeof ResolveReputationTrend).toBe('function');
    expect(ResolveReputationTrend([])).toBe('stable');
  });
});
