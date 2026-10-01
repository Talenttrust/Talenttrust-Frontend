import type { Milestone, MilestoneStatus } from '@/types/domain';

/**
 * @file Milestone status model, transition guards and sample data.
 *
 * This module is the single source of truth for the milestone state machine.
 * It is evaluated exactly once per process (and once per client bundle) and is
 * read by the milestones page, its seed data and its tests *concurrently*, so
 * every piece of shared state below is built eagerly, frozen, and never
 * mutated afterwards.
 *
 * ## Concurrency invariants
 *
 * 1. **Immutable shared state.** `MILESTONE_STATUS_ORDER`, `VALID_STATUSES`,
 *    `TERMINAL_STATUSES`, `MILESTONE_STATUS_TRANSITIONS`, the derived lookup
 *    tables and `SAMPLE_MILESTONES` are frozen at module load. Overlapping
 *    readers therefore always observe the same values, and no caller can
 *    mutate the contract out from under another caller.
 * 2. **Pure, total helpers.** Every exported function is deterministic and
 *    holds no module-level mutable state, so interleaved or racing calls cannot
 *    combine into a partial result. Guards accept `unknown` and never throw;
 *    only `applyMilestoneTransition` throws, and only with deterministic,
 *    typed errors.
 * 3. **Optimistic concurrency.** `applyMilestoneTransition` accepts an optional
 *    `expectedVersion`. When supplied, a stale writer (one whose expectation no
 *    longer matches the record) is rejected with `STALE_VERSION` instead of
 *    silently overwriting newer state. Stale detection runs *before* transition
 *    validation so a retried write always reports the real reason.
 * 4. **Idempotent, order-independent batching.** `reconcileMilestoneTransitions`
 *    applies a batch of transitions against a snapshot. Duplicate ids collapse
 *    (last write wins), results follow the snapshot order, a transition that is
 *    already in effect reports `already_current` instead of failing, and a
 *    single failure never aborts the rest of the batch.
 */

export type { MilestoneStatus };

/**
 * Persistence key for the user's dismissal of the sample milestone banner.
 *
 * Invariant: this key is stable across releases. Renaming it would silently
 * re-surface the sample banner for users who already dismissed it.
 */
export const SAMPLE_DISMISSED_KEY = 'talenttrust-milestones-sample-dismissed';

/**
 * Freezes a status list without widening the element type to `string`
 * (`Object.freeze(['a'])` alone widens to `readonly string[]`, which would
 * defeat the exhaustiveness checks in `MILESTONE_STATUS_TRANSITIONS`).
 */
const freezeStatuses = (
  ...statuses: MilestoneStatus[]
): readonly MilestoneStatus[] => Object.freeze(statuses);

/**
 * The linear payout pipeline, in order.
 *
 * `Pending` is the only entry state, `Paid` is the terminal state, and
 * `Disputed` is deliberately absent because it is a branch state rather than a
 * step in the forward flow (see `MILESTONE_STATUS_TRANSITIONS`).
 */
export const MILESTONE_STATUS_ORDER = freezeStatuses('Pending', 'Completed', 'Paid');

/**
 * Every status the app recognizes for a milestone.
 *
 * A value outside this list is invalid and must be rejected at the boundary
 * rather than rendered as a broken row.
 */
export const VALID_STATUSES = freezeStatuses('Pending', 'Completed', 'Paid', 'Disputed');

/** Statuses from which no further in-model transition is possible. */
export const TERMINAL_STATUSES = freezeStatuses('Paid');

/**
 * Backwards-compatible alias for {@link VALID_STATUSES}.
 *
 * @deprecated Prefer {@link VALID_STATUSES} (recognized values) or
 * {@link MILESTONE_STATUS_ORDER} (linear pipeline order). This alias is kept so
 * that existing imports keep working; do not rely on its ordering.
 */
export const MILESTONE_STATUSES = VALID_STATUSES;

/**
 * The status transition table — the allow-list of every legal move.
 *
 * Invariants:
 * - Terminal states (`Paid`) transition to nothing.
 * - `Disputed` is a branch: it can be entered from `Pending` or `Completed`, and
 *   leaving it requires the explicit resolution flow modelled elsewhere.
 * - `Pending` is the only entry state for a newly created milestone.
 * - Self-transitions (`X` -> `X`) are never listed, so `isAllowedTransition`
 *   returns `false` and `applyMilestoneTransition` throws. A repeated or
 *   retried write therefore cannot silently succeed as a no-op.
 */
export const MILESTONE_STATUS_TRANSITIONS: Readonly<
  Record<MilestoneStatus, readonly MilestoneStatus[]>
> = Object.freeze({
  Pending: freezeStatuses('Completed', 'Disputed'),
  Completed: freezeStatuses('Paid', 'Disputed'),
  Paid: freezeStatuses(),
  Disputed: freezeStatuses(),
});

/**
 * Derived lookup tables, built once at module load.
 *
 * These are intentionally private: because no caller holds a reference, a
 * concurrent reader cannot mutate them and every lookup stays a pure read.
 */
const VALID_STATUS_SET: ReadonlySet<string> = new Set<string>(VALID_STATUSES);
const TERMINAL_STATUS_SET: ReadonlySet<string> = new Set<string>(TERMINAL_STATUSES);
const STATUS_INDEX: ReadonlyMap<string, number> = new Map<string, number>(
  MILESTONE_STATUS_ORDER.map((status, index) => [status, index] as const),
);

/**
 * Type guard for {@link MilestoneStatus}.
 *
 * Total: accepts `unknown` (so it can guard untyped data at the boundary) and
 * never throws for any input.
 */
export function isValidStatus(value: unknown): value is MilestoneStatus {
  return typeof value === 'string' && VALID_STATUS_SET.has(value);
}

/** Alias of {@link isValidStatus} kept for backwards compatibility. */
export const isMilestoneStatus = isValidStatus;

/**
 * @deprecated Historic misspelling retained so existing imports keep working.
 * Use {@link isValidStatus}.
 */
export const isMlestoneStatus = isValidStatus;

/**
 * Zero-based position of `status` in the linear pipeline, or `-1` when the
 * value is unknown or a branch state such as `Disputed`.
 *
 * Deterministic and side-effect free: repeated calls always agree.
 */
export function getStatusIndex(status: MilestoneStatus): number {
  return STATUS_INDEX.get(status) ?? -1;
}

/**
 * The next status in the linear pipeline.
 *
 * Returns `null` for terminal states, branch states (`Disputed`) and unknown
 * values, so callers can treat "no forward step" uniformly.
 */
export function getNextStatus(status: MilestoneStatus): MilestoneStatus | null {
  const index = getStatusIndex(status);
  if (index === -1 || index >= MILESTONE_STATUS_ORDER.length - 1) {
    return null;
  }
  return MILESTONE_STATUS_ORDER[index + 1] ?? null;
}

/** True when `status` is terminal, i.e. no further in-model transition exists. */
export function isTerminalStatus(status: MilestoneStatus): boolean {
  return TERMINAL_STATUS_SET.has(status);
}

/**
 * True when the state machine allows `from` -> `to`.
 *
 * Total and side-effect free: unknown statuses, self-transitions, and moves out
 * of terminal or branch states all resolve to `false` rather than throwing, so
 * a caller racing another writer can safely *ask* before it writes.
 */
export function isAllowedTransition(from: MilestoneStatus, to: MilestoneStatus): boolean {
  if (!isValidStatus(from) || !isValidStatus(to) || from === to) {
    return false;
  }
  const allowed = MILESTONE_STATUS_TRANSITIONS[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

/**
 * True when `payout` is coherent with `status`.
 *
 * A `Paid` milestone must settle a strictly positive amount; every other status
 * accepts a non-negative finite amount (including zero). `NaN`, `Infinity`,
 * negative values and non-numbers are always rejected, so a corrupt or
 * half-written record cannot be mistaken for a settled payout.
 */
export function isPayoutConsistentWithStatus(status: MilestoneStatus, payout: unknown): boolean {
  if (!isValidStatus(status)) {
    return false;
  }
  if (typeof payout !== 'number' || !Number.isFinite(payout) || payout < 0) {
    return false;
  }
  return status === 'Paid' ? payout > 0 : true;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a real calendar date written as `YYYY-MM-DD`. */
function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  // Reject normalization drift (e.g. 2026-02-30 -> 2026-03-02).
  return parsed.toISOString().slice(0, 10) === value;
}

/**
 * Collects every invariant a milestone violates.
 *
 * Returns an empty array for a valid milestone, so the same function serves as
 * a boolean check ({@link isValidMilestone}) and as the explanation for a
 * rejection. Emitted strings contain only the offending field and its scalar
 * value — never the whole payload — so they are safe to log or surface.
 *
 * Accepts `unknown` so it can validate untrusted input at the boundary, and is
 * pure: the argument is never mutated, so concurrent validation of the same
 * milestone always yields the same result.
 */
export function validateMilestoneInvariants(milestone: unknown): string[] {
  if (!milestone || typeof milestone !== 'object') {
    return ['Milestone must be an object'];
  }

  const candidate = milestone as Record<string, unknown>;
  const violations: string[] = [];

  if (typeof candidate.id !== 'string' || candidate.id.trim() === '') {
    violations.push('Milestone id must be a non-empty string');
  }
  if (typeof candidate.title !== 'string' || candidate.title.trim() === '') {
    violations.push('Milestone title must be a non-empty string');
  }
  if (!isValidStatus(candidate.status)) {
    violations.push(`Unknown milestone status "${String(candidate.status)}"`);
  }
  if (
    typeof candidate.payout !== 'number' ||
    !Number.isFinite(candidate.payout) ||
    candidate.payout < 0
  ) {
    violations.push('Milestone payout must be a non-negative finite number');
  } else if (
    isValidStatus(candidate.status) &&
    !isPayoutConsistentWithStatus(candidate.status, candidate.payout)
  ) {
    violations.push(
      `Payout ${candidate.payout} is inconsistent with status "${candidate.status}"`,
    );
  }
  if (typeof candidate.currency !== 'string' || candidate.currency.trim() === '') {
    violations.push('Milestone currency must be a non-empty string');
  }
  if (!isValidIsoDate(candidate.dueDate)) {
    violations.push('Milestone dueDate must be an ISO date string (YYYY-MM-DD)');
  }

  return violations;
}

/** True when `value` satisfies every milestone invariant. */
export function isValidMilestone(value: unknown): value is Milestone {
  return validateMilestoneInvariants(value).length === 0;
}

/**
 * Machine-readable reason a milestone write was rejected.
 *
 * These codes are a public interface: they are stable, exhaustive, and safe to
 * branch on. `UNKNOWN_MILESTONE` is only produced by the batch reconciler.
 */
export type MilestoneTransitionErrorCode =
  | 'UNKNOWN_MILESTONE'
  | 'UNKNOWN_STATUS'
  | 'INVALID_TRANSITION'
  | 'STALE_VERSION'
  | 'INVARIANT_VIOLATION';

/**
 * Deterministic error raised by {@link applyMilestoneTransition}.
 *
 * `code` is the stable discriminant; the message contains only the milestone id
 * and the status values involved — never the full payload — so it is safe to log
 * or surface to a user without leaking milestone contents.
 */
export class MilestoneTransitionError extends Error {
  /** Stable, exhaustive reason for the rejection. */
  readonly code: MilestoneTransitionErrorCode;

  /** Id of the milestone the write targeted (empty when not determinable). */
  readonly milestoneId: string;

  constructor(code: MilestoneTransitionErrorCode, message: string, milestoneId = '') {
    super(message);
    this.name = 'MilestoneTransitionError';
    this.code = code;
    this.milestoneId = milestoneId;
    // Required so `instanceof` keeps working after the class is transpiled to
    // ES5-style prototypes by babel.
    Object.setPrototypeOf(this, MilestoneTransitionError.prototype);
  }
}

/** Options for {@link applyMilestoneTransition}. */
export type ApplyMilestoneTransitionOptions = {
  /**
   * Version the caller believes is currently stored. When supplied and it no
   * longer matches the milestone's `version`, the write is rejected with
   * `STALE_VERSION` so two concurrent writers cannot both land.
   */
  readonly expectedVersion?: number;
};

/**
 * Applies a single status transition.
 *
 * Pure with respect to its input: the supplied milestone is never mutated, a
 * new object is returned, and the result carries an incremented `version` so a
 * persisted write can be detected as stale by a concurrent writer.
 *
 * Order of checks is part of the contract — a stale write reports
 * `STALE_VERSION` even when the requested move would also be invalid, because
 * the caller's view of the record is the more fundamental problem.
 *
 * @throws {MilestoneTransitionError} `UNKNOWN_STATUS`      the current status is not recognized.
 * @throws {MilestoneTransitionError} `STALE_VERSION`       `expectedVersion` no longer matches (checked first).
 * @throws {MilestoneTransitionError} `INVALID_TRANSITION`  the state machine forbids the move.
 * @throws {MilestoneTransitionError} `INVARIANT_VIOLATION` the result would be incoherent.
 */
export function applyMilestoneTransition(
  milestone: Milestone,
  to: MilestoneStatus,
  options: ApplyMilestoneTransitionOptions = {},
): Milestone {
  if (!milestone || typeof milestone !== 'object') {
    throw new MilestoneTransitionError(
      'UNKNOWN_STATUS',
      'Cannot transition milestone: value is not a milestone object.',
    );
  }

  const id = typeof milestone.id === 'string' ? milestone.id : '';

  if (options.expectedVersion !== undefined && milestone.version !== options.expectedVersion) {
    throw new MilestoneTransitionError(
      'STALE_VERSION',
      `Stale milestone transition for ${id}: expected version ${options.expectedVersion} but found ${String(
        milestone.version,
      )}.`,
      id,
    );
  }

  if (!isValidStatus(milestone.status)) {
    throw new MilestoneTransitionError(
      'UNKNOWN_STATUS',
      `Cannot transition milestone ${id}: current status "${String(
        milestone.status,
      )}" is not a recognized milestone status.`,
      id,
    );
  }

  if (!isAllowedTransition(milestone.status, to)) {
    throw new MilestoneTransitionError(
      'INVALID_TRANSITION',
      `Invalid milestone transition for ${id}: ${milestone.status} -> ${String(to)}.`,
      id,
    );
  }

  const next: Milestone = {
    ...milestone,
    status: to,
    version: (typeof milestone.version === 'number' ? milestone.version : 0) + 1,
  };

  const violations = validateMilestoneInvariants(next);
  if (violations.length > 0) {
    throw new MilestoneTransitionError(
      'INVARIANT_VIOLATION',
      `Milestone transition for ${id} (${milestone.status} -> ${to}) violates invariants: ${violations.join(
        '; ',
      )}`,
      id,
    );
  }

  return next;
}

/** A single requested transition inside a reconciliation batch. */
export type MilestoneTransitionRequest = {
  readonly id: string;
  readonly to: MilestoneStatus;
  /** Optional optimistic-concurrency guard, forwarded to applyMilestoneTransition. */
  readonly expectedVersion?: number;
};

/**
 * Outcome of one request in a batch. Never thrown — always returned — so a
 * partially failing batch still reports every request it processed.
 */
export type MilestoneTransitionOutcome =
  | {
      readonly id: string;
      readonly ok: true;
      readonly applied: true;
      readonly milestone: Milestone;
    }
  | {
      readonly id: string;
      readonly ok: true;
      readonly applied: false;
      readonly reason: 'already_current';
      readonly milestone: Milestone;
    }
  | {
      readonly id: string;
      readonly ok: false;
      readonly code: MilestoneTransitionErrorCode;
      readonly error: MilestoneTransitionError;
    };

/**
 * Reconciles a batch of requested transitions against a snapshot.
 *
 * Designed for concurrent execution:
 * - **Deterministic.** The result depends only on the inputs: outcomes follow
 *   the snapshot order, and ids that appear only in the request batch are
 *   appended in request order. Re-running the same inputs yields the same
 *   result.
 * - **Idempotent.** Duplicate requests for an id collapse to the last one
 *   (last-write-wins, matching the persistence layer) and a request whose target
 *   state is already in effect is reported as `already_current` instead of
 *   failing, so a retried batch is a no-op rather than an error.
 * - **Isolated.** Each milestone is reconciled independently: one rejection
 *   never aborts the rest of the batch, and the input snapshot (and its
 *   milestones) are never mutated.
 *
 * @param milestones Snapshot to reconcile. Duplicate ids collapse to the first
 *   entry, which consumes the request so a repeated snapshot entry cannot apply
 *   the same transition twice.
 * @param requests   Requested transitions. Malformed entries are ignored.
 * @returns One outcome per reconciled milestone, plus one `UNKNOWN_MILESTONE`
 *   outcome for each requested id absent from the snapshot.
 */
export function reconcileMilestoneTransitions(
  milestones: readonly Milestone[],
  requests: readonly MilestoneTransitionRequest[],
): MilestoneTransitionOutcome[] {
  const pending = new Map<string, MilestoneTransitionRequest>();
  for (const request of requests) {
    if (request && typeof request.id === 'string') {
      pending.set(request.id, request);
    }
  }

  const outcomes: MilestoneTransitionOutcome[] = [];

  for (const milestone of milestones) {
    if (!milestone || typeof milestone !== 'object') {
      continue;
    }
    const request = pending.get(milestone.id);
    if (request === undefined) {
      continue;
    }
    pending.delete(milestone.id);
    outcomes.push(applyTransitionRequest(milestone, request));
  }

  for (const request of pending.values()) {
    outcomes.push({
      id: request.id,
      ok: false,
      code: 'UNKNOWN_MILESTONE',
      error: new MilestoneTransitionError(
        'UNKNOWN_MILESTONE',
        `No milestone with id ${request.id} is present in the reconciliation snapshot.`,
        request.id,
      ),
    });
  }

  return outcomes;
}

/**
 * Applies one request and converts any rejection into an outcome.
 *
 * A request whose target state is already in effect short-circuits to
 * `already_current` *before* the state machine is consulted. That is what makes
 * retrying a batch safe (the transition itself would be a self-transition and
 * therefore rejected), while `applyMilestoneTransition` keeps rejecting genuine
 * self-transitions for callers that ask for them explicitly.
 */
function applyTransitionRequest(
  milestone: Milestone,
  request: MilestoneTransitionRequest,
): MilestoneTransitionOutcome {
  if (isValidStatus(milestone.status) && milestone.status === request.to) {
    return {
      id: milestone.id,
      ok: true,
      applied: false,
      reason: 'already_current',
      milestone,
    };
  }

  try {
    const next = applyMilestoneTransition(milestone, request.to, {
      expectedVersion: request.expectedVersion,
    });
    return { id: milestone.id, ok: true, applied: true, milestone: next };
  } catch (error) {
    const rejection =
      error instanceof MilestoneTransitionError
        ? error
        : new MilestoneTransitionError(
            'INVARIANT_VIOLATION',
            `Milestone transition for ${milestone.id} failed unexpectedly.`,
            milestone.id,
          );
    return { id: milestone.id, ok: false, code: rejection.code, error: rejection };
  }
}

/**
 * Normalizes an untrusted collection of milestones.
 *
 * Invalid entries are dropped and duplicate ids collapse to the last occurrence
 * (last-write-wins, matching the persistence layer), so a retried or overlapping
 * load can never produce duplicate rows. Pure and deterministic: the input is
 * never mutated and the output order is stable.
 */
export function normalizeMilestones(values: readonly unknown[]): Milestone[] {
  const byId = new Map<string, Milestone>();
  for (const value of values) {
    if (!isValidMilestone(value)) {
      continue;
    }
    byId.set(value.id, value);
  }
  return Array.from(byId.values());
}

/**
 * Sample milestones used for the empty state and the first-run demo banner.
 *
 * Invariants (enforced at module load by {@link assertSampleMilestones}):
 * - Every entry satisfies {@link validateMilestoneInvariants}.
 * - Ids are unique and non-empty.
 * - The array *and* each entry are frozen, so concurrent consumers cannot
 *   mutate shared seed data into a view that disagrees with the contract.
 *
 * The array identity is meaningful: `page.tsx` uses `milestones === SAMPLE_MILESTONES`
 * to decide whether it is still showing untouched sample data, so callers must
 * replace the array rather than mutate it.
 */
export const SAMPLE_MILESTONES: Milestone[] = [
  {
    id: '1',
    title: 'Project Kickoff & Discovery',
    status: 'Completed',
    payout: 2500,
    currency: 'USD',
    dueDate: '2026-03-15',
  },
  {
    id: '2',
    title: 'UI/UX Design Handoff',
    status: 'Paid',
    payout: 3500,
    currency: 'USD',
    dueDate: '2026-04-01',
  },
  {
    id: '3',
    title: 'Frontend Development – Sprint 1',
    status: 'Pending',
    payout: 5000,
    currency: 'USD',
    dueDate: '2026-05-01',
  },
  {
    id: '4',
    title: 'API Integration & Testing',
    status: 'Pending',
    payout: 4000,
    currency: 'USD',
    dueDate: '2026-05-15',
  },
  {
    id: '5',
    title: 'Payment Gateway Integration',
    status: 'Disputed',
    payout: 3000,
    currency: 'USD',
    dueDate: '2026-04-20',
  },
];

// Shallow-freeze every entry, then the array itself. `SAMPLE_MILESTONES` keeps
// its `Milestone[]` type so existing consumers stay assignable.
SAMPLE_MILESTONES.forEach((milestone) => Object.freeze(milestone));
Object.freeze(SAMPLE_MILESTONES);

/**
 * Validates milestone data against the documented invariants.
 *
 * Throws a deterministic `Error` describing the first violation so breakage is
 * caught at module load (in CI, dev and tests) instead of surfacing as a
 * silently inconsistent UI. Read-only: the supplied collection is never
 * mutated, so it is safe to call concurrently.
 */
export function assertSampleMilestones(
  milestones: readonly Milestone[] = SAMPLE_MILESTONES,
): void {
  const seenIds = new Set<string>();

  milestones.forEach((milestone, index) => {
    const label = `milestones[${index}]`;
    const violations = validateMilestoneInvariants(milestone);
    if (violations.length > 0) {
      throw new Error(`${label} violates milestone invariants: ${violations.join('; ')}`);
    }
    if (seenIds.has(milestone.id)) {
      throw new Error(`${label} duplicates id "${milestone.id}"`);
    }
    seenIds.add(milestone.id);
  });
}

// Fail fast at import time if the shipped sample data ever drifts from the contract.
assertSampleMilestones();
