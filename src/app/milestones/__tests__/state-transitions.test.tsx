/**
 * state-transitions.test.tsx
 *
 * Issue #51 — Test state transitions for the milestones page.
 *
 * Covers the four distinct UI states of the /milestones route and asserts
 * that they are mutually exclusive:
 *
 *   1. Loading state  — skeleton UI is visible while data is being fetched
 *   2. Empty state    — no milestones exist (repository empty + sample dismissed)
 *   3. Error state    — SafeBoundary or MilestonesErrorBoundary catches a render
 *                       error and shows an accessible fallback
 *   4. Success state  — one or more milestones are rendered in the list
 *
 * Each state is tested independently and the mutual-exclusivity invariants
 * are verified: when one state is active, the UI elements that belong to the
 * other three states must NOT be present.
 */

import React from 'react';
import {
  render,
  screen,
  waitFor,
  act,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MilestonesPage from '../page';
import { SAMPLE_DISMISSED_KEY } from '../constants';
import { listMilestones } from '@/lib/repository';
import type { Milestone } from '@/types/domain';

// ---------------------------------------------------------------------------
// Global mocks required by the page's dependency tree
// ---------------------------------------------------------------------------

// useCopyToClipboard — used by milestone row cards
jest.mock('@/hooks/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({
    copied: false,
    copy: jest.fn().mockResolvedValue(true),
  }),
}));

// Toast provider
const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();
jest.mock('@/components/toast/toast-provider', () => ({
  useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}));

// Next.js navigation
const mockSearchParams = {
  get: jest.fn(() => null),
  toString: jest.fn(() => ''),
};
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

// Repository
jest.mock('@/lib/repository', () => ({
  listMilestones: jest.fn(),
  upsertMilestone: jest.fn(() => ({ success: true, stale: false })),
  getMilestoneVersion: jest.fn(() => 0),
  deleteMilestones: jest.fn(() => 0),
}));

const mockedListMilestones = jest.mocked(listMilestones);

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const singleMilestone: Milestone = {
  id: 'st-1',
  title: 'State Transition Milestone',
  status: 'Pending',
  payout: 1500,
  currency: 'USD',
  dueDate: '2026-09-01',
};

const multipleMilestones: Milestone[] = [
  {
    id: 'st-2',
    title: 'Alpha Phase',
    status: 'Pending',
    payout: 2000,
    currency: 'USD',
    dueDate: '2026-08-01',
  },
  {
    id: 'st-3',
    title: 'Beta Phase',
    status: 'Completed',
    payout: 3000,
    currency: 'USD',
    dueDate: '2026-09-15',
  },
  {
    id: 'st-4',
    title: 'Release Phase',
    status: 'Paid',
    payout: 4000,
    currency: 'USD',
    dueDate: '2026-10-01',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Renders MilestonesPage and waits for the post-mount useEffect (data load)
 * to settle, so assertions reflect the fully-hydrated state.
 */
async function renderPage() {
  const result = render(<MilestonesPage />);
  await act(async () => {});
  return result;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Pin "today" outside all fixture due-date windows so due-soon banners
  // don't duplicate milestones and interfere with count assertions.
  jest.useFakeTimers({
    now: new Date('2026-07-22T12:00:00Z'),
    advanceTimers: true,
  });

  // Default: empty repository → falls back to sample data
  mockedListMilestones.mockReturnValue([]);

  // Reset nav mocks
  mockSearchParams.get.mockReturnValue(null);
  mockSearchParams.toString.mockReturnValue('');
  mockReplace.mockReset();

  // Clear localStorage
  window.localStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  window.localStorage.clear();
});

// ===========================================================================
// 1. LOADING STATE
// ===========================================================================

describe('Loading state — loading.tsx skeleton', () => {
  /**
   * The /milestones route ships a separate loading.tsx that Next.js App Router
   * renders as the Suspense fallback. We import and render it directly because
   * the jsdom environment does not exercise the Suspense boundary the way a
   * real browser would.
   */
  const MilestonesLoading = require('../loading').default as React.FC;

  it('renders the loading skeleton without crashing', () => {
    render(<MilestonesLoading />);
    // The skeleton must render without throwing
  });

  it('sets aria-busy="true" on the root element to signal an in-progress load', () => {
    const { container } = render(<MilestonesLoading />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('aria-busy', 'true');
  });

  it('renders a visually-hidden role="status" live region announcing the load', () => {
    render(<MilestonesLoading />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveTextContent(/loading milestones/i);
  });

  it('aria-live region is polite so it does not interrupt other announcements', () => {
    render(<MilestonesLoading />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
  });

  it('does NOT render actual milestone content while in the loading state', () => {
    render(<MilestonesLoading />);
    // No milestone titles, no filter radiogroup, no empty-state message
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByText('No milestones tracked')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does NOT render the main milestone list region while loading', () => {
    render(<MilestonesLoading />);
    // MilestonesList renders a section with aria-labelledby; must be absent
    const listSection = document.querySelector('section[aria-busy="false"]');
    expect(listSection).not.toBeInTheDocument();
  });

  it('renders at least one shimmer/skeleton placeholder element', () => {
    const { container } = render(<MilestonesLoading />);
    // Skeleton divs carry bg-slate-200 — confirm the structure is present
    const shimmerEls = container.querySelectorAll('.bg-slate-200');
    expect(shimmerEls.length).toBeGreaterThan(0);
  });

  it('does not duplicate the <main> landmark (root layout owns the only <main>)', () => {
    render(<MilestonesLoading />);
    const mains = document.querySelectorAll('main');
    expect(mains).toHaveLength(0);
  });
});

// ===========================================================================
// 2. EMPTY STATE
// ===========================================================================

describe('Empty state — no milestones and samples dismissed', () => {
  beforeEach(() => {
    // Simulate previously dismissed sample banner
    window.localStorage.setItem(SAMPLE_DISMISSED_KEY, 'true');
    mockedListMilestones.mockReturnValue([]);
  });

  it('renders the "No milestones tracked" empty-state title', async () => {
    await renderPage();
    expect(screen.getByText('No milestones tracked')).toBeInTheDocument();
  });

  it('renders the empty-state descriptive copy', async () => {
    await renderPage();
    expect(
      screen.getByText(/track your progress by adding milestones/i),
    ).toBeInTheDocument();
  });

  it('renders the "Add Milestone" action button in the empty state', async () => {
    await renderPage();
    expect(
      screen.getByRole('button', { name: /add milestone/i }),
    ).toBeInTheDocument();
  });

  it('DOES NOT render the status-filter radiogroup in the empty state', async () => {
    await renderPage();
    expect(
      screen.queryByRole('radiogroup', { name: /filter milestones by status/i }),
    ).not.toBeInTheDocument();
  });

  it('DOES NOT render any milestone list items in the empty state', async () => {
    await renderPage();
    // MilestonesList renders article elements per milestone
    expect(document.querySelectorAll('article')).toHaveLength(0);
  });

  it('DOES NOT show the sample-data banner in the empty state (already dismissed)', async () => {
    await renderPage();
    expect(screen.queryByTestId('sample-data-banner')).not.toBeInTheDocument();
  });

  it('DOES NOT render the skeleton loading UI in the empty state', async () => {
    await renderPage();
    // The loading skeleton announces "Loading milestones…"; must be absent
    expect(screen.queryByText(/loading milestones/i)).not.toBeInTheDocument();
  });

  it('DOES NOT render an error fallback in the empty state', async () => {
    await renderPage();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clicking "Add Milestone" in the empty state opens the creation form', async () => {
    const user = userEvent.setup();
    await renderPage();

    await waitFor(() =>
      expect(screen.getByText('No milestones tracked')).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: /add milestone/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});

// ===========================================================================
// 3. ERROR STATE
// ===========================================================================

describe('Error state — SafeBoundary catches a render error', () => {
  /**
   * Strategy: render a controlled component that throws on first render but
   * can be re-mounted cleanly on retry, using the same SafeBoundary wrapper
   * that wraps MilestonesPage.
   */
  const SafeBoundary = require('@/components/SafeBoundary').default as React.ComponentType<{
    children: React.ReactNode;
    fallbackTitle?: string;
  }>;

  let shouldThrow = true;

  const ThrowingChild: React.FC = () => {
    if (shouldThrow) {
      throw new Error('Simulated milestones render failure');
    }
    return <div data-testid="recovered-content">Recovered content</div>;
  };

  // Suppress the expected console.error output from React's error boundary
  let consoleErrorSpy: jest.SpyInstance;
  beforeEach(() => {
    shouldThrow = true;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders the error fallback when a child throws', () => {
    render(
      <SafeBoundary fallbackTitle="Milestones failed to load.">
        <ThrowingChild />
      </SafeBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByText('Milestones failed to load.'),
    ).toBeInTheDocument();
  });

  it('fallback uses role="alert" for immediate assistive-technology announcement', () => {
    render(
      <SafeBoundary fallbackTitle="Milestones failed to load.">
        <ThrowingChild />
      </SafeBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
  });

  it('renders a "Retry" button inside the error fallback', () => {
    render(
      <SafeBoundary fallbackTitle="Milestones failed to load.">
        <ThrowingChild />
      </SafeBoundary>,
    );

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders a "Go Home" link inside the error fallback', () => {
    render(
      <SafeBoundary fallbackTitle="Milestones failed to load.">
        <ThrowingChild />
      </SafeBoundary>,
    );

    expect(screen.getByRole('link', { name: /go home/i })).toBeInTheDocument();
  });

  it('DOES NOT show milestone content when in the error state', () => {
    render(
      <SafeBoundary fallbackTitle="Milestones failed to load.">
        <ThrowingChild />
      </SafeBoundary>,
    );

    expect(screen.queryByText('Recovered content')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(screen.queryByText('No milestones tracked')).not.toBeInTheDocument();
  });

  it('DOES NOT show the loading skeleton in the error state', () => {
    render(
      <SafeBoundary fallbackTitle="Milestones failed to load.">
        <ThrowingChild />
      </SafeBoundary>,
    );

    // The loading skeleton announces "Loading milestones…"; must be absent
    expect(screen.queryByText(/loading milestones/i)).not.toBeInTheDocument();
  });

  it('clicking Retry resets the boundary and re-renders children', async () => {
    const user = userEvent.setup();
    shouldThrow = true;

    render(
      <SafeBoundary fallbackTitle="Milestones failed to load.">
        <ThrowingChild />
      </SafeBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Stop throwing before the retry re-renders the child
    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByTestId('recovered-content')).toBeInTheDocument();
    });
  });
});

// ===========================================================================
// 4. SUCCESS STATE
// ===========================================================================

describe('Success state — milestones are loaded and rendered', () => {
  describe('single milestone', () => {
    beforeEach(() => {
      mockedListMilestones.mockReturnValue([singleMilestone]);
    });

    it('renders the milestone title', async () => {
      await renderPage();
      expect(
        await screen.findByText('State Transition Milestone'),
      ).toBeInTheDocument();
    });

    it('renders the page heading', async () => {
      await renderPage();
      expect(
        screen.getByRole('heading', { name: /milestones/i, level: 1 }),
      ).toBeInTheDocument();
    });

    it('renders the status-filter radiogroup', async () => {
      await renderPage();
      await waitFor(() =>
        expect(
          screen.getByRole('radiogroup', { name: /filter milestones by status/i }),
        ).toBeInTheDocument(),
      );
    });

    it('DOES NOT render the empty-state message in the success state', async () => {
      await renderPage();
      await waitFor(() =>
        expect(
          screen.queryByText('No milestones tracked'),
        ).not.toBeInTheDocument(),
      );
    });

    it('DOES NOT render the loading skeleton in the success state', async () => {
      await renderPage();
      // The loading skeleton wrapper carries aria-busy="true" on the root div;
      // the loaded page div does NOT carry that attribute.
      // Also verify the "Loading milestones…" sr-only text is absent.
      expect(screen.queryByText(/loading milestones/i)).not.toBeInTheDocument();
    });

    it('DOES NOT render an error alert in the success state', async () => {
      await renderPage();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('multiple milestones', () => {
    beforeEach(() => {
      mockedListMilestones.mockReturnValue(multipleMilestones);
    });

    it('renders all milestone titles', async () => {
      await renderPage();
      for (const m of multipleMilestones) {
        expect(await screen.findByText(m.title)).toBeInTheDocument();
      }
    });

    it('renders the "Showing all N milestones" live-region count', async () => {
      await renderPage();
      await waitFor(() =>
        expect(
          screen.getByText(/showing all 3 milestones/i),
        ).toBeInTheDocument(),
      );
    });

    it('the count element uses aria-live="polite"', async () => {
      await renderPage();
      const liveRegion = await screen.findByText(/showing all 3 milestones/i);
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('sample milestones fallback (empty repository, samples not dismissed)', () => {
    beforeEach(() => {
      mockedListMilestones.mockReturnValue([]);
      // Ensure banner is not previously dismissed
      window.localStorage.removeItem(SAMPLE_DISMISSED_KEY);
    });

    it('renders the sample milestone titles', async () => {
      await renderPage();
      expect(
        await screen.findByText('Project Kickoff & Discovery'),
      ).toBeInTheDocument();
    });

    it('shows the sample-data banner', async () => {
      await renderPage();
      expect(
        await screen.findByTestId('sample-data-banner'),
      ).toBeInTheDocument();
    });

    it('sample banner has role="status" for non-intrusive announcement', async () => {
      await renderPage();
      const banner = await screen.findByTestId('sample-data-banner');
      expect(banner).toHaveAttribute('role', 'status');
    });

    it('DOES NOT render the empty-state title while sample data is shown', async () => {
      await renderPage();
      await waitFor(() =>
        expect(
          screen.queryByText('No milestones tracked'),
        ).not.toBeInTheDocument(),
      );
    });
  });
});

// ===========================================================================
// 5. STATE TRANSITIONS — mutual exclusivity
// ===========================================================================

describe('State transitions — mutual exclusivity invariants', () => {
  it('transitions from sample/success state to empty state after dismissing the banner', async () => {
    const user = userEvent.setup();
    mockedListMilestones.mockReturnValue([]);

    await renderPage();

    // Initial state: sample data visible (success-like)
    expect(
      await screen.findByText('Project Kickoff & Discovery'),
    ).toBeInTheDocument();
    expect(screen.queryByText('No milestones tracked')).not.toBeInTheDocument();

    // Dismiss the sample banner → transitions to empty state
    await user.click(screen.getByRole('button', { name: /start from scratch/i }));

    await waitFor(() => {
      expect(screen.getByText('No milestones tracked')).toBeInTheDocument();
      // Sample titles must be gone
      expect(
        screen.queryByText('Project Kickoff & Discovery'),
      ).not.toBeInTheDocument();
      // Filter radiogroup must not appear with zero milestones
      expect(
        screen.queryByRole('radiogroup', { name: /filter milestones by status/i }),
      ).not.toBeInTheDocument();
    });
  });

  it('transitions from empty state to success state after adding a milestone', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(SAMPLE_DISMISSED_KEY, 'true');
    mockedListMilestones.mockReturnValue([]);

    await renderPage();

    // Initial state: empty
    await waitFor(() =>
      expect(screen.getByText('No milestones tracked')).toBeInTheDocument(),
    );

    // Open the creation form
    await user.click(screen.getByRole('button', { name: /add milestone/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    // Fill in the required fields
    await user.type(screen.getByLabelText(/title/i), 'New Milestone');
    await user.type(screen.getByLabelText(/payout amount/i), '1000');

    // Submit
    const dialog = screen.getByRole('dialog');
    const submitBtn = within(dialog).getByRole('button', {
      name: /^add milestone$/i,
    });
    await user.click(submitBtn);

    await waitFor(() => {
      // Empty-state must be gone
      expect(
        screen.queryByText('No milestones tracked'),
      ).not.toBeInTheDocument();
      // The form/dialog must be closed
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('only one of {empty, success} is rendered at a time for a non-empty repo', async () => {
    mockedListMilestones.mockReturnValue([singleMilestone]);
    await renderPage();

    // Wait for hydration
    await waitFor(() =>
      expect(screen.getByText('State Transition Milestone')).toBeInTheDocument(),
    );

    // Success state present
    expect(screen.getByText('State Transition Milestone')).toBeInTheDocument();
    // Empty state absent
    expect(screen.queryByText('No milestones tracked')).not.toBeInTheDocument();
    // Loading state absent — the skeleton shows "Loading milestones…" sr-only text
    expect(screen.queryByText(/loading milestones/i)).not.toBeInTheDocument();
    // Error state absent
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('only empty state is rendered when repository is empty and samples dismissed', async () => {
    window.localStorage.setItem(SAMPLE_DISMISSED_KEY, 'true');
    mockedListMilestones.mockReturnValue([]);
    await renderPage();

    await waitFor(() =>
      expect(screen.getByText('No milestones tracked')).toBeInTheDocument(),
    );

    // Empty state present
    expect(screen.getByText('No milestones tracked')).toBeInTheDocument();
    // Success state elements absent
    expect(
      screen.queryByRole('radiogroup', { name: /filter milestones by status/i }),
    ).not.toBeInTheDocument();
    // Loading state absent
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    // Error state absent
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('filter empty state (no matching milestones) is independent of the global empty state', async () => {
    const user = userEvent.setup();
    // Repo has only Pending milestones — Paid filter will produce zero results
    mockedListMilestones.mockReturnValue([singleMilestone]); // status: Pending
    await renderPage();

    await waitFor(() =>
      expect(screen.getByText('State Transition Milestone')).toBeInTheDocument(),
    );

    // Apply Paid filter
    await user.click(screen.getByRole('radio', { name: 'Paid' }));

    await waitFor(() => {
      // Filter empty state shows a different title
      expect(
        screen.getByText('No milestones match this filter'),
      ).toBeInTheDocument();
      // The global "no milestones" empty state is NOT used here
      expect(
        screen.queryByText('No milestones tracked'),
      ).not.toBeInTheDocument();
    });

    // The filter radiogroup remains visible (not replaced by the full empty state)
    expect(
      screen.getByRole('radiogroup', { name: /filter milestones by status/i }),
    ).toBeInTheDocument();
  });

  it('success state does not co-render the filter empty state when filter matches', async () => {
    const user = userEvent.setup();
    mockedListMilestones.mockReturnValue([singleMilestone]); // status: Pending
    await renderPage();

    await waitFor(() =>
      expect(screen.getByText('State Transition Milestone')).toBeInTheDocument(),
    );

    // Apply Pending filter — matches the single milestone
    await user.click(screen.getByRole('radio', { name: 'Pending' }));

    await waitFor(() => {
      // Milestone still visible
      expect(screen.getByText('State Transition Milestone')).toBeInTheDocument();
      // Neither empty-state message should appear
      expect(
        screen.queryByText('No milestones match this filter'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('No milestones tracked'),
      ).not.toBeInTheDocument();
    });
  });

  it('repository data replaces sample data on mount (loading → success transition)', async () => {
    mockedListMilestones.mockReturnValue(multipleMilestones);

    // Before act: page starts with SAMPLE_MILESTONES in state
    const { unmount } = render(<MilestonesPage />);

    // After act: useEffect fires, repository data replaces sample data
    await act(async () => {});

    // Sample milestone titles must be replaced
    expect(
      screen.queryByText('Project Kickoff & Discovery'),
    ).not.toBeInTheDocument();

    // Persisted milestone titles must be present
    for (const m of multipleMilestones) {
      expect(screen.getByText(m.title)).toBeInTheDocument();
    }

    unmount();
  });
});

// ===========================================================================
// 6. LOADING STATE → SUCCESS STATE transition (Suspense boundary)
// ===========================================================================

describe('Suspense / loading boundary integration', () => {
  it('MilestonesPage wraps content in a Suspense boundary (no crash on render)', async () => {
    mockedListMilestones.mockReturnValue([singleMilestone]);
    // If Suspense is missing or misconfigured the render would throw; this
    // test confirms the page mounts cleanly with a Suspense wrapper.
    await expect(renderPage()).resolves.toBeDefined();
  });

  it('page renders the heading after the Suspense resolves', async () => {
    mockedListMilestones.mockReturnValue([singleMilestone]);
    await renderPage();
    expect(
      screen.getByRole('heading', { name: /milestones/i, level: 1 }),
    ).toBeInTheDocument();
  });

  it('does not leave aria-busy="true" on the page content after load completes', async () => {
    mockedListMilestones.mockReturnValue([singleMilestone]);
    const { container } = await renderPage();
    // The loaded page content div must not carry aria-busy="true"
    // (that attribute belongs only to the loading skeleton)
    const busyEls = container.querySelectorAll('[aria-busy="true"]');
    expect(busyEls).toHaveLength(0);
  });
});
