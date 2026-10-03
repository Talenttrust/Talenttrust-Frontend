'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { reportError } from '@/lib/errorReporter';
import type { Milestone } from '@/types/domain';

/**
 * @file Failure-recovery state machine for the milestones board.
 *
 * The board mutates milestones optimistically, which means the UI is allowed to
 * move ahead of the repository. When a mutation fails the page has to:
 *
 * 1. restore a board that agrees with the persisted data,
 * 2. surface the failure to the user exactly once, and
 * 3. never leave the board half-applied.
 *
 * Invariants:
 * 1. At most one recovery runs at a time. A burst of failures cannot interleave
 *    reconciles and produce a non-deterministic final board.
 * 2. Recovery is best effort and never throws. Callers get a boolean and the
 *    underlying failure is forwarded to the shared error reporter instead, so a
 *    failing reporter can never mask the original mutation error.
 * 3. A failed reconcile never blanks the board: the last rendered snapshot is
 *    re-asserted so the user keeps the rows they could already see.
 * 4. Telemetry carries an operation label and an outcome only. Milestone
 *    payloads (titles, payouts, addresses) are never copied into a report.
 */

export type MilestonesRecoveryStatus = 'idle' | 'recovering' | 'failed';

/** Telemetry outcome attached to every recovery report. */
export type MilestonesRecoveryOutcome =
  | 'recovered'
  | 'recovery_failed'
  | 'recovery_skipped_in_flight';

/** Stable machine-readable code attached to every recovery report. */
export const MILESTONES_RECOVERY_FAILED_CODE = 'MILESTONES_RECOVERY_FAILED';

export type UseMilestonesRecoveryOptions = {
  /** Current board contents, used as the fallback snapshot on failed recovery. */
  milestones: Milestone[];
  /** Board setter, used only to re-assert a snapshot after a failed recovery. */
  setMilestones: React.Dispatch<React.SetStateAction<Milestone[]>>;
  /** Re-reads the repository and replaces the board with the persisted data. */
  reconcileFromRepo: () => void;
};

export type UseMilestonesRecoveryResult = {
  /** `failed` keeps the recovery banner mounted until a retry succeeds. */
  status: MilestonesRecoveryStatus;
  /** Safe, user-facing message describing the most recent unrecovered failure. */
  lastError: string | null;
  /** True while a reconcile is in flight. */
  isRecovering: boolean;
  /**
   * Records a mutation failure and attempts to restore the board from the
   * repository. Returns `true` when the board was restored.
   */
  recordFailure: (operation: string, error: unknown) => boolean;
  /** Re-attempts recovery after a failure. */
  retry: () => void;
  /** Clears the failure state without touching the board. */
  reset: () => void;
};

/** Converts an unknown thrown value into a safe, user-facing message. */
function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }
  return 'An unexpected error occurred while restoring your milestones.';
}

/**
 * Reports a recovery outcome.
 *
 * Only the operation label and the outcome are attached as metadata; the error
 * itself is handed to the reporter untouched so that its own scrubbing rules
 * apply to anything the error carries.
 */
function reportOutcome(
  operation: string,
  outcome: MilestonesRecoveryOutcome,
  error: unknown,
): void {
  reportError(error, 'MilestonesRecovery', 'error', {
    code: MILESTONES_RECOVERY_FAILED_CODE,
    operation,
    outcome,
  });
}

export function useMilestonesRecovery({
  milestones,
  setMilestones,
  reconcileFromRepo,
}: UseMilestonesRecoveryOptions): UseMilestonesRecoveryResult {
  const [status, setStatus] = useState<MilestonesRecoveryStatus>('idle');
  const [lastError, setLastError] = useState<string | null>(null);

  // Serialises recovery attempts. A ref (rather than state) is deliberate: the
  // guard has to be read and written synchronously inside a failure handler,
  // before React has had a chance to re-render.
  const inFlightRef = useRef<boolean>(false);

  // The last board the user actually saw. A reconcile sets React state, which
  // cannot be read synchronously, so the snapshot is kept in lockstep with
  // committed renders and re-asserted when a recovery fails.
  const lastSnapshotRef = useRef<Milestone[]>(milestones);
  useEffect(() => {
    lastSnapshotRef.current = milestones;
  }, [milestones]);

  const recordFailure = useCallback(
    (operation: string, error: unknown): boolean => {
      if (inFlightRef.current) {
        // A recovery is already running; its outcome decides the board state.
        reportOutcome(operation, 'recovery_skipped_in_flight', error);
        return false;
      }

      inFlightRef.current = true;
      setStatus('recovering');
      try {
        // The repository is the source of truth: reconciling discards whatever
        // partially applied optimistic state the failed mutation left behind.
        reconcileFromRepo();
        setLastError(null);
        setStatus('idle');
        reportOutcome(operation, 'recovered', error);
        return true;
      } catch (recoveryError) {
        setMilestones(() => lastSnapshotRef.current);
        setLastError(toMessage(recoveryError));
        setStatus('failed');
        reportOutcome(operation, 'recovery_failed', recoveryError);
        return false;
      } finally {
        inFlightRef.current = false;
      }
    },
    [reconcileFromRepo, setMilestones],
  );

  const retry = useCallback(() => {
    if (inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    setStatus('recovering');
    try {
      reconcileFromRepo();
      setLastError(null);
      setStatus('idle');
    } catch (error) {
      setMilestones(() => lastSnapshotRef.current);
      setLastError(toMessage(error));
      setStatus('failed');
      reportOutcome('retry', 'recovery_failed', error);
    } finally {
      inFlightRef.current = false;
    }
  }, [reconcileFromRepo, setMilestones]);

  const reset = useCallback(() => {
    setLastError(null);
    setStatus('idle');
  }, []);

  return useMemo(
    () => ({
      status,
      lastError,
      isRecovering: status === 'recovering',
      recordFailure,
      retry,
      reset,
    }),
    [status, lastError, recordFailure, retry, reset],
  );
}

export default useMilestonesRecovery;
