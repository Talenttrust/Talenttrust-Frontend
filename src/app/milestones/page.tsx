'use client';

import React, {
  useReducer,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
} from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import EmptyState from '../../components/EmptyState';
import MilestonesList from '../../components/MilestonesList';
import MilestoneFilter, {
  type MilestoneStatusFilter,
} from '../../components/milestones/MilestoneFilter';
import { MilestoneCreationForm } from '../../components/milestones/MilestoneCreationForm';
import { listMilestones } from '@/lib/repository';
import { getItem, setItem } from '@/lib/safeStorage';
import { useToast } from '@/components/toast/toast-provider';
import SafeBoundary from '@/components/SafeBoundary';
import MilestonesErrorBoundary from '@/components/milestones/MilestonesErrorBoundary';
import MilestonesBoardSkeleton from '@/components/milestones/MilestonesBoardSkeleton';
import { downloadMilestonesICS } from '@/lib/icsExport';
import { useOfflineMilestones } from '@/hooks/useOfflineMilestones';
import { SAMPLE_MILESTONES, SAMPLE_DISMISSED_KEY } from './constants';
import type { Milestone } from '@/types/domain';
import { useOptimisticMilestoneMutation } from '@/hooks/useOptimisticMilestoneMutation';
import { useMilestonesRecovery } from '@/hooks/useMilestonesRecovery';

const UNPAGINATED_LIST_SIZE = 9999;

const VALID_STATUSES: MilestoneStatusFilter[] = [
  'All',
  'Pending',
  'Completed',
  'Paid',
  'Disputed',
  'Active',
];

function getUniqueQueryParam(query: string, key: string): string | null {
  const values = new URLSearchParams(query).getAll(key);
  // Repeated keys are ambiguous, so treat them like any other invalid value.
  return values.length === 1 ? values[0] : null;
}

function getValidStatus(param: string | null): MilestoneStatusFilter {
  return param && (VALID_STATUSES as string[]).includes(param)
    ? (param as MilestoneStatusFilter)
    : 'All';
}

/**
 * Compatibility contract: the `status` query parameter is a public
 * interface. Unknown or legacy values (including casing differences and
 * whitespace) must resolve deterministically to a valid filter rather than
 * throwing or silently dropping the user's selection. See
 * `normalizeMilestoneStatus` for the canonical mapping.
 */
const CANONICAL_STATUS_PARAM = 'status';

type MilestoneSortOption = 'newest' | 'oldest';
const VALID_SORT_OPTIONS: MilestoneSortOption[] = ['newest', 'oldest'];

const MAX_SORT_PARAM_LENGTH = 16;

/**
 * Upper bound for the `status` query parameter.
 *
 * The parameter is part of the public URL surface, so the parser caps its length
 * as well as validating its value: an oversized value (hand-edited URL, fuzzed
 * deep link) is rejected before it reaches the filter instead of being echoed
 * back into the controls.
 */
const MAX_STATUS_PARAM_LENGTH = 32;

/**
 * Identity of the board's initial load epoch.
 *
 * `loadEpochRef` holds exactly this symbol until sample data is dismissed. A
 * reconcile (offline flush, mutation recovery) is only allowed to replace the
 * board while the sentinel is still in place, so data the user explicitly
 * discarded can never be resurrected by a late response.
 */
const MILESTONE_LOAD_EPOCH: unique symbol = Symbol('milestone-load-epoch');

function getValidSortOption(param: string | null): MilestoneSortOption {
  return param && (VALID_SORT_OPTIONS as string[]).includes(param)
    ? (param as MilestoneSortOption)
    : 'newest';
}

/**
 * Compatibility contract: `sort` is a public query parameter. Unknown values
 * must fall back to the default (`newest`) so that deep links from older
 * versions of the app continue to render a stable, sorted list.
 */
const CANONICAL_SORT_PARAM = 'sort';


type UrlSyncState = {
  status: MilestoneStatusFilter;
  sort: MilestoneSortOption;
};

type UrlSyncAction =
  | { type: 'status'; value: MilestoneStatusFilter }
  | { type: 'sort'; value: MilestoneSortOption }
  | { type: 'sync'; value: UrlSyncState };

/**
 * Invariant: the URL sync state is the single source of truth for the
 * `status` and `sort` query parameters. Transitions are pure and
 * deterministic so concurrent updates (user interaction + navigation)
 * cannot produce an inconsistent URL.
 */
function urlSyncReducer(
  state: UrlSyncState,
  action: UrlSyncAction,
): UrlSyncState {
  switch (action.type) {
    case 'status':
      return state.status === action.value
        ? state
        : { ...state, status: action.value };
    case 'sort':
      return state.sort === action.value
        ? state
        : { ...state, sort: action.value };
    case 'sync':
      return state.status === action.value.status &&
        state.sort === action.value.sort
        ? state
        : action.value;
    default:
      return state;
  }
}

/**
 * Normalizes a raw query parameter into a bounded, validated value.
 * Rejects oversized, empty, or unknown inputs by returning `null`.
 */
function normalizeParam(
  raw: string | null,
  maxLength: number,
): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

/**
 * Reads a query parameter from either the raw query string or the search-params
 * object.
 *
 * The raw query string is preferred because it keeps repeated keys detectable
 * (`status=a&status=b` stays ambiguous instead of silently resolving to one of
 * the values). `URLSearchParams#get` is the fallback for renderers whose
 * search-params object exposes `get` but not a query string.
 */
function readQueryParam(params: URLSearchParams, key: string): string | null {
  const query = params.toString();
  if (query.length > 0) {
    return getUniqueQueryParam(query, key);
  }
  return params.get(key);
}

/**
 * Normalizes a milestone's reported status into a valid filter value.
 *
 * Repository data is not guaranteed to use canonical casing (older records may
 * store `completed`), so values are trimmed, case-folded, and then validated.
 * Anything unrecognised degrades to `All`, which keeps the milestone visible
 * instead of hiding it behind an impossible filter.
 */
function normalizeMilestoneStatus(value: unknown): MilestoneStatusFilter {
  if (typeof value !== 'string') return 'All';
  const normalized = normalizeParam(value, MAX_STATUS_PARAM_LENGTH);
  if (normalized === null) return 'All';
  const canonical =
    normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  return getValidStatus(canonical);
}

/**
 * Reducer initializer: derives the filter/sort selection from the URL so that a
 * deep link is honoured on the very first render.
 */
function parseUrlSyncState(params: URLSearchParams): UrlSyncState {
  return {
    status: normalizeMilestoneStatus(
      readQueryParam(params, CANONICAL_STATUS_PARAM),
    ),
    sort: getValidSortOption(
      normalizeParam(
        readQueryParam(params, CANONICAL_SORT_PARAM),
        MAX_SORT_PARAM_LENGTH,
      ),
    ),
  };
}

/**
 * Serializes the selection back into a query string.
 *
 * The existing entries are walked in order so that an already-synced URL is
 * byte-for-byte unchanged (no needless history entry), repeated keys are
 * collapsed, and unrelated parameters — a campaign tag, a referral id — keep
 * their original position instead of being dropped or reordered.
 */
function buildUrlSyncQuery(
  state: UrlSyncState,
  params: URLSearchParams,
): string {
  const next = new URLSearchParams();
  const statusValue = state.status === 'All' ? null : state.status;
  const sortValue = state.sort === 'newest' ? null : state.sort;
  let statusWritten = false;
  let sortWritten = false;

  for (const [key, value] of new URLSearchParams(params.toString())) {
    if (key === CANONICAL_STATUS_PARAM) {
      if (statusWritten) continue;
      statusWritten = true;
      if (statusValue !== null) next.append(key, statusValue);
      continue;
    }
    if (key === CANONICAL_SORT_PARAM) {
      if (sortWritten) continue;
      sortWritten = true;
      if (sortValue !== null) next.append(key, sortValue);
      continue;
    }
    next.append(key, value);
  }

  if (!statusWritten && statusValue !== null) {
    next.set(CANONICAL_STATUS_PARAM, statusValue);
  }
  if (!sortWritten && sortValue !== null) {
    next.set(CANONICAL_SORT_PARAM, sortValue);
  }

  return next.toString();
}

function urlSyncStatesEqual(a: UrlSyncState, b: UrlSyncState): boolean {
  return a.status === b.status && a.sort === b.sort;
}



const MilestonesContent: React.FC = () => {
  const [milestones, setMilestones] = useState<Milestone[]>(SAMPLE_MILESTONES);
  const milestoneIdsRef = useRef(new Set(milestones.map(({ id }) => id)));
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [recoveryKey, setRecoveryKey] = useState(0);
  const searchParams = useSearchParams();
  const router = useRouter();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const startFromScratchRef = useRef<HTMLButtonElement | null>(null);
  // Load epoch sentinel: the ref keeps `MILESTONE_LOAD_EPOCH` until sample data
  // is dismissed, which permanently closes the window in which a late reconcile
  // could resurrect data the user explicitly discarded.
  const loadEpochRef = useRef<symbol>(MILESTONE_LOAD_EPOCH);
  // Tracks mount state so deferred work (focusing the heading after a dismissal)
  // can never run against a component that has already unmounted.
  const mountedRef = useRef<boolean>(true);

  // Filter/sort live in a reducer whose initial state is derived from the URL, so
  // a deep link renders correctly on the first pass — no flash of unfiltered
  // content — while a single cell of state drives both the controls and the URL.
  const [urlSyncState, dispatchUrlSync] = useReducer(
    urlSyncReducer,
    searchParams,
    parseUrlSyncState,
  );
  const { status: statusFilter, sort: sortOrder } = urlSyncState;
  // Last query string adopted into `urlSyncState`; see the URL -> state effect.
  const lastSeenUrlRef = useRef<string>(searchParams.toString());
  const [showForm, setShowForm] = useState(false);
  const { showError } = useToast();
  const reconcileFromRepo = useCallback(() => {
    if (loadEpochRef.current !== MILESTONE_LOAD_EPOCH) return;
    setMilestones(listMilestones());
  }, []);

  const offline = useOfflineMilestones(reconcileFromRepo);
  const { optimisticCreate, optimisticUpdate } = useOptimisticMilestoneMutation(
    milestones,
    setMilestones,
  );
  const recovery = useMilestonesRecovery({
    milestones,
    setMilestones,
    reconcileFromRepo,
  });

  // Track the last reconciled snapshot so we can detect silent data loss.
  const lastReconciledRef = useRef<Milestone[] | null>(null);

  const setStatusFilter = useCallback(
    (value: MilestoneStatusFilter) => {
      dispatchUrlSync({ type: 'status', value });
    },
    [],
  );

  const setSortOrder = useCallback((value: MilestoneSortOption) => {
    dispatchUrlSync({ type: 'sort', value });
  }, []);

  useEffect(() => {
    milestoneIdsRef.current = new Set(milestones.map(({ id }) => id));
  }, [milestones]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /**
   * Adopts `status`/`sort` from the URL when it changes: a deep link, a browser
   * back/forward navigation, or a redirect issued elsewhere in the app.
   *
   * The guard compares the raw query string against the last one this effect
   * saw, instead of comparing against the current selection. A selection the
   * user has just made but that has not been written back to the URL yet must
   * never be mistaken for an external navigation and silently reverted.
   */
  useEffect(() => {
    const query = searchParams.toString();
    if (query === lastSeenUrlRef.current) {
      return;
    }
    lastSeenUrlRef.current = query;

    const nextState: UrlSyncState = {
      status: normalizeMilestoneStatus(
        getUniqueQueryParam(query, CANONICAL_STATUS_PARAM),
      ),
      sort: getValidSortOption(
        normalizeParam(
          getUniqueQueryParam(query, CANONICAL_SORT_PARAM),
          MAX_SORT_PARAM_LENGTH,
        ),
      ),
    };
    if (urlSyncStatesEqual(nextState, urlSyncState)) {
      return;
    }

    dispatchUrlSync({ type: 'sync', value: nextState });
  }, [searchParams, urlSyncState]);

  /**
   * Writes a debounced, canonical URL back to the router.
   *
   * Comparing the serialized query — rather than the parsed selection — is what
   * lets this effect normalise an existing URL: an ambiguous `?status=a&status=b`
   * or an unknown `?sort=middle` parses to the default selection but still needs
   * rewriting so that reloads and shared links behave deterministically.
   */
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const nextQuery = buildUrlSyncQuery(urlSyncState, searchParams);
      const currentQuery = searchParams.toString();
      if (nextQuery === currentQuery) {
        return;
      }

      router.replace(nextQuery ? `?${nextQuery}` : '?');
    }, 150);

    return () => window.clearTimeout(timeoutId);
  }, [urlSyncState, router, searchParams]);

  useEffect(() => {
    const persisted = listMilestones();
    if (persisted.length > 0) {
      // Persisted data always wins over sample data, even after a dismissal.
      setMilestones(persisted);
      lastReconciledRef.current = persisted;
      setIsDismissed(true);
      return;
    }

    let dismissed: boolean;
    try {
      dismissed = getItem(SAMPLE_DISMISSED_KEY) === 'true';
    } catch {
      // Storage is unavailable: default to "dismissed" so a storage failure can
      // never pin the user to a notice they are unable to persist.
      dismissed = true;
    }
    setIsDismissed(dismissed);

    if (!dismissed) {
      // Keep the module-level sample array identity: the board recognises
      // "untouched sample data" by reference, so samples are never cloned.
      setMilestones(SAMPLE_MILESTONES);
    }
  }, [recoveryKey]);

  const handleDismissSampleBanner = useCallback(() => {
    try {
      setItem(SAMPLE_DISMISSED_KEY, 'true');
    } catch {
      // safeStorage resilience
    }
    loadEpochRef.current = Symbol('milestone-load-epoch-dismissed');
    setIsDismissed(true);
    setMilestones([]);
    lastReconciledRef.current = [];
    setTimeout(() => {
      // Guard against the component unmounting between scheduling and
      // execution of this timeout (concurrent rendering / navigation).
      if (mountedRef.current) {
        headingRef.current?.focus();
      }
    }, 0);
  }, []);

  const handleRetryRecovery = useCallback(() => {
    recovery.retry();
    setRecoveryKey((key) => key + 1);
  }, [recovery]);

  const handleResetRecovery = useCallback(() => {
    recovery.reset();
    setRecoveryKey((key) => key + 1);
  }, [recovery]);

  const isUsingSampleData = milestones === SAMPLE_MILESTONES;
  const showSampleBanner = isUsingSampleData && !isDismissed;
  const displayMilestones = isUsingSampleData && isDismissed ? [] : milestones;

  const filtered = useMemo(() => {
    if (statusFilter === 'All') return displayMilestones;
    return displayMilestones.filter((m) => normalizeMilestoneStatus(m.status) === statusFilter);
  }, [displayMilestones, statusFilter]);

  const sortedMilestones = useMemo(() => {
    const nextMilestones = [...filtered];

    if (sortOrder === 'oldest') {
      nextMilestones.sort((left, right) => {
        const leftTime = left.dueDate ? Date.parse(left.dueDate) : Number.POSITIVE_INFINITY;
        const rightTime = right.dueDate ? Date.parse(right.dueDate) : Number.POSITIVE_INFINITY;
        const delta = leftTime - rightTime;
        if (delta !== 0) return delta;
        return left.id.localeCompare(right.id);
      });
    } else {
      nextMilestones.sort((left, right) => {
        const leftTime = left.dueDate ? Date.parse(left.dueDate) : Number.NEGATIVE_INFINITY;
        const rightTime = right.dueDate ? Date.parse(right.dueDate) : Number.NEGATIVE_INFINITY;
        const delta = rightTime - leftTime;
        if (delta !== 0) return delta;
        return left.id.localeCompare(right.id);
      });
    }

    return nextMilestones;
  }, [filtered, sortOrder]);

  const handleAddMilestone = useCallback(() => {
    setShowForm(true);
  }, []);

  const handleStatusFilterChange = useCallback(
    (value: MilestoneStatusFilter) => {
      setStatusFilter(value);
    },
    [setStatusFilter],
  );

  const handleSubmitMilestone = useCallback((milestone: Milestone) => {
    if (milestoneIdsRef.current.has(milestone.id)) {
      showError({
        title: 'Unable to create milestone',
        description: 'A milestone with this identifier already exists.',
      });
      return;
    }

    milestoneIdsRef.current.add(milestone.id);
    const result = optimisticCreate(milestone);
    if (!result.ok) {
      // The optimistic row never reached the repository: release the reserved
      // identifier so the user can retry with the same milestone, reconcile the
      // board with the persisted data, and then report the failure once.
      milestoneIdsRef.current.delete(milestone.id);
      recovery.recordFailure('create', result.error);
      showError({
        title: 'Unable to create milestone',
        description: result.stale
          ? 'This milestone was updated in another session. Please reload and try again.'
          : 'Your milestone could not be saved. Please try again.',
        action: result.stale
          ? undefined
          : {
              label: 'Retry',
              onClick: () => handleSubmitMilestone(milestone),
            },
      });
      return;
    }

    // A successful create means the board now owns real data, so the sample-data
    // notice must not reappear after a later reconciliation.
    setShowForm(false);
    setIsDismissed(true);
  }, [optimisticCreate, recovery, showError]);

  const handleCancelForm = useCallback(() => {
    setShowForm(false);
  }, []);

  const handleUpdateMilestone = useCallback(
    (id: string, patch: Partial<Milestone>): boolean => {
      const result = optimisticUpdate(id, patch);
      if (result.ok) return true;

      // Reconcile before surfacing the failure: the board must never be left
      // showing an optimistic edit the repository rejected.
      recovery.recordFailure('update', result.error);
      showError({
        title: 'Unable to update milestone',
        description: result.error,
      });
      return false;
    },
    [optimisticUpdate, recovery, showError],
  );

  return (
    <div className="min-h-screen p-8">
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold mb-6 focus:outline-none">
        Milestones
      </h1>

      {recovery.status === 'failed' && (
        <div
          data-testid="milestones-recovery-banner"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 shadow-sm dark:border-red-500/20 dark:bg-red-500/5 dark:text-red-200"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Milestones failed to load</p>
              <p className="mt-1 text-red-700 dark:text-red-300">
                {recovery.lastError ?? 'An unexpected error occurred while loading your milestones.'}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={handleRetryRecovery}
                className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-red-500"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={handleResetRecovery}
                className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-red-500"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {(offline.isFlushing || offline.notice || offline.pendingCount > 0) && (
        <div
          data-testid="offline-status-banner"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-200"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium">
              {!offline.isOnline
                ? 'You’re offline — milestone changes are saved on this device and will sync automatically when you reconnect.'
                : offline.isFlushing
                  ? 'Synchronizing your pending milestones…'
                  : offline.notice}
            </p>
            {!offline.isOnline && offline.pendingCount > 0 && (
              <span className="ml-2 shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
                {offline.pendingCount} pending
              </span>
            )}
          </div>
        </div>
      )}

      {showSampleBanner && (
        <div
          data-testid="sample-data-banner"
          role="status"
          aria-label="Sample data notice"
          className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-blue-900">
                You're viewing sample data
              </p>
              <p className="mt-1 text-sm text-blue-700">
                These are example milestones to help you get started.
              </p>
              <button
                ref={startFromScratchRef}
                data-testid="start-from-scratch-btn"
                type="button"
                onClick={handleDismissSampleBanner}
                className="mt-3 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                Start from scratch
              </button>
            </div>
            <button
              type="button"
              onClick={handleDismissSampleBanner}
              aria-label="Dismiss sample data notice"
              className="rounded-sm text-blue-500 hover:text-blue-700 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {displayMilestones.length === 0 ? (
        <EmptyState
          illustration="milestones"
          title="No milestones tracked"
          description="Track your progress by adding milestones to your contracts. Milestones help you stay organized and ensure timely delivery."
          actionLabel="Add Milestone"
          onAction={handleAddMilestone}
        />
      ) : (
        <>
          <div className="mb-4 flex min-h-[42px] flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <MilestonesErrorBoundary sectionName="filters">
              <MilestoneFilter
                selected={statusFilter}
                onChange={handleStatusFilterChange}
                resultCount={sortedMilestones.length}
              />
            </MilestonesErrorBoundary>
            <MilestonesErrorBoundary sectionName="actions">
              <div className="flex min-h-[42px] flex-wrap items-center gap-3">
                <label
                  htmlFor="milestone-sort"
                  className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm"
                >
                  <span className="font-medium text-slate-700">Sort</span>
                  <select
                    id="milestone-sort"
                    aria-label="Sort milestones"
                    value={sortOrder}
                    onChange={(event) =>
                      setSortOrder(getValidSortOption(event.target.value))
                    }
                    className="rounded-xl border border-slate-200 bg-transparent px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => downloadMilestonesICS(sortedMilestones)}
                  aria-label="Add to calendar"
                  className="flex-shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  <span aria-hidden="true" className="mr-1">📅</span>
                  Add to Calendar
                </button>
                <button
                  type="button"
                  aria-label="Add Milestone"
                  onClick={handleAddMilestone}
                  className="flex-shrink-0 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  Add Milestone
                </button>
              </div>
            </MilestonesErrorBoundary>
          </div>

          <MilestonesErrorBoundary sectionName="milestone list">
            {sortedMilestones.length === 0 ? (
              <EmptyState
                illustration="milestones"
                title="No milestones match this filter"
                description={`There are no ${statusFilter.toLowerCase()} milestones at the moment. Try a different filter or add a new milestone.`}
                actionLabel="Add Milestone"
                onAction={handleAddMilestone}
              />
            ) : (
              <MilestonesList
                milestones={sortedMilestones}
                onUpdateMilestone={handleUpdateMilestone}
                pageSize={UNPAGINATED_LIST_SIZE}
              />
            )}
          </MilestonesErrorBoundary>
        </>
      )}

      {showForm && (
        <MilestoneCreationForm
          onSubmit={handleSubmitMilestone}
          onCancel={handleCancelForm}
        />
      )}
    </div>
  );
};

const MilestonesPage: React.FC = () => (
  <SafeBoundary fallbackTitle="Milestones failed to load.">
    <Suspense fallback={<MilestonesBoardSkeleton />}>
      <MilestonesContent />
    </Suspense>
  </SafeBoundary>
);

export default MilestonesPage;
