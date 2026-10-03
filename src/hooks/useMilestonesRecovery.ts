import { useCallback, useRef, useState } from 'react';
import { reportError } from '@/lib/errorReporter';
import type { Milestone } from '@/types/domain';

export type MilestonesBoardRecoveryStatus = 'idle' | 'recovering' | 'failed';

export interface MilestonesBoardFailureMeta {
  code: string;
  operation: string;
  recovered: boolean;
}

export interface MilestonesBoardRecovery {
  status: MilestonesBoardRecoveryStatus;
  isRecoveryInFlight: boolean;
  recoveryNotice: string | null;
  lastError: string | null;
  retry: () => boolean;
  reset: () => void;
}

export function useMilestonesRecovery(
  milestones: readonly Milestone[],
  setMilestones: React.Dispatch<React.SetStateAction<Milestone[]>>,
  reconcileFromRepo: () => void,
): MilestonesBoardRecovery {
  const recoveryInFlightRef = useRef<boolean>(false);
  const [status, setStatus] = useState<MilestonesBoardRecoveryStatus>('idle');
  const [lastError, setLastError] = useState<string | null>(null);

  const reportMilestoneFailure = useCallback(
    (operation: string, outcome: string, error?: unknown): void => {
      const codeMap: Record<string, string> = {
        recovered: 'MILESTONES_RECOVERED',
        recovery_skipped_in_flight: 'MILESTONES_RECOVERY_SKIPPED',
        recovery_failed: 'MILESTONES_RECOVERY_FAILED',
      };
      const code = codeMap[outcome] ?? 'MILESTONES_RECOVERY_FAILED';
      const message = `${operation}: ${outcome}`;
      reportError(
        new Error(message),
        'Milestones page',
        'error',
        { code, operation, recovered: outcome === 'recovered' },
      );
      if (outcome !== 'recovered') {
        setLastError(
          error instanceof Error ? error.message : String(error ?? 'unknown error'),
        );
      } else {
        setLastError(null);
      }
    },
    [],
  );

  const retry = useCallback((): boolean => {
    if (recoveryInFlightRef.current) {
      reportMilestoneFailure('recovery', 'recovery_skipped_in_flight');
      return false;
    }
    recoveryInFlightRef.current = true;
    try {
      reconcileFromRepo();
      reportMilestoneFailure('recovery', 'recovered');
      return true;
    } catch (recoveryError) {
      reportMilestoneFailure('recovery', 'recovery_failed', recoveryError);
      return false;
    } finally {
      recoveryInFlightRef.current = false;
    }
  }, [reconcileFromRepo, reportMilestoneFailure]);

  const reset = useCallback((): void => {
    setStatus('idle');
    setLastError(null);
  }, []);

  return {
    status,
    isRecoveryInFlight: recoveryInFlightRef.current,
    recoveryNotice: status === 'failed' ? 'Milestones recovery failed.' : null,
    lastError,
    retry,
    reset,
  };
}
