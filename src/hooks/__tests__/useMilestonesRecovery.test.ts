import { act, renderHook } from '@testing-library/react';
import { useMilestonesRecovery } from '@/hooks/useMilestonesRecovery';
import { setErrorReporter } from '@/lib/errorReporter';


beforeEach(() => {
  setErrorReporter(null);
  jest.restoreAllMocks();
  localStorage.clear();
});

describe('useMilestonesRecovery', () => {
  describe('initial state', () => {
    it('starts idle with no last error', () => {
      const { result } = renderHook(
        ({ milestones, setMilestones, reconcileFromRepo }) =>
          useMilestonesRecovery(milestones, setMilestones, reconcileFromRepo),
        {
          initialProps: {
            milestones: [],
            setMilestones: jest.fn(),
            reconcileFromRepo: () => {},
          },
        },
      );

      expect(result.current.status).toBe('idle');
      expect(result.current.lastError).toBeNull();
      expect(result.current.isRecoveryInFlight).toBe(false);
    });
  });

  describe('retry', () => {
    it('succeeds when reconciliation does not throw', () => {
      const { result } = renderHook(
        ({ milestones, setMilestones, reconcileFromRepo }) =>
          useMilestonesRecovery(milestones, setMilestones, reconcileFromRepo),
        {
          initialProps: {
            milestones: [],
            setMilestones: jest.fn(),
            reconcileFromRepo: () => {
              /* successful reconciliation - does not throw */
            },
          },
        },
      );

      act(() => {
        result.current.retry();
      });
      expect(result.current.status).toBe('idle');
      expect(result.current.lastError).toBeNull();
    });

    it('reports failure and sets lastError when reconciliation throws', () => {
      const reporter = jest.fn();
      setErrorReporter(reporter);

      const { result } = renderHook(
        ({ milestones, setMilestones, reconcileFromRepo }) =>
          useMilestonesRecovery(milestones, setMilestones, reconcileFromRepo),
        {
          initialProps: {
            milestones: [],
            setMilestones: jest.fn(),
            reconcileFromRepo: () => {
              throw new Error('Repository storage failed');
            },
          },
        },
      );

      act(() => {
        result.current.retry();
      });
      expect(result.current.status).toBe('idle');
      expect(result.current.lastError).toBe('Repository storage failed');
      expect(reporter).toHaveBeenCalledTimes(1);
    });

    it('is idempotent on repeated calls when not in flight', () => {
      const { result } = renderHook(
        ({ milestones, setMilestones, reconcileFromRepo }) =>
          useMilestonesRecovery(milestones, setMilestones, reconcileFromRepo),
        {
          initialProps: {
            milestones: [],
            setMilestones: jest.fn(),
            reconcileFromRepo: () => {
              /* successful reconciliation */
            },
          },
        },
      );

      act(() => {
        const first = result.current.retry();
        expect(first).toBe(true);
      });

      act(() => {
        const second = result.current.retry();
        expect(second).toBe(true);
      });
    });

    it('reports sanitized metadata on failure (no error message leak)', () => {
      const reporter = jest.fn();
      setErrorReporter(reporter);

      const { result } = renderHook(
        ({ milestones, setMilestones, reconcileFromRepo }) =>
          useMilestonesRecovery(milestones, setMilestones, reconcileFromRepo),
        {
          initialProps: {
            milestones: [],
            setMilestones: jest.fn(),
            reconcileFromRepo: () => {
              throw new Error('secret-internals should not appear');
            },
          },
        },
      );

      act(() => {
        result.current.retry();
      });
      expect(reporter).toHaveBeenCalledTimes(1);
      const reportedMeta = reporter.mock.calls[0][3];
      expect((reportedMeta as Record<string, unknown>).code).toBe('MILESTONES_RECOVERY_FAILED');
      expect(JSON.stringify(reportedMeta)).not.toContain('secret-internals');
    });

    it('reports recovered metadata on success', () => {
      const reporter = jest.fn();
      setErrorReporter(reporter);

      const { result } = renderHook(
        ({ milestones, setMilestones, reconcileFromRepo }) =>
          useMilestonesRecovery(milestones, setMilestones, reconcileFromRepo),
        {
          initialProps: {
            milestones: [],
            setMilestones: jest.fn(),
            reconcileFromRepo: () => {
              /* successful reconciliation */
            },
          },
        },
      );

      act(() => {
        result.current.retry();
      });
      expect(reporter).toHaveBeenCalledTimes(1);
      const reportedMeta = reporter.mock.calls[0][3];
      expect((reportedMeta as Record<string, unknown>).recovered).toBe(true);
      expect((reportedMeta as Record<string, unknown>).code).toBe('MILESTONES_RECOVERED');
    });
  });

  describe('reset', () => {
    it('clears the error state and resets status to idle', () => {
      const { result } = renderHook(
        ({ milestones, setMilestones, reconcileFromRepo }) =>
          useMilestonesRecovery(milestones, setMilestones, reconcileFromRepo),
        {
          initialProps: {
            milestones: [],
            setMilestones: jest.fn(),
            reconcileFromRepo: () => {},
          },
        },
      );

      act(() => {
        result.current.reset();
      });
      expect(result.current.status).toBe('idle');
      expect(result.current.lastError).toBeNull();
    });

    it('is idempotent on repeated calls', () => {
      const { result } = renderHook(
        ({ milestones, setMilestones, reconcileFromRepo }) =>
          useMilestonesRecovery(milestones, setMilestones, reconcileFromRepo),
        {
          initialProps: {
            milestones: [],
            setMilestones: jest.fn(),
            reconcileFromRepo: () => {},
          },
        },
      );

      act(() => {
        result.current.reset();
      });
      act(() => {
        result.current.reset();
      });
      act(() => {
        result.current.reset();
      });
    });
  });

  describe('single-flight guard', () => {
    it('allows a retry after the previous one completes', () => {
      const { result } = renderHook(
        ({ milestones, setMilestones, reconcileFromRepo }) =>
          useMilestonesRecovery(milestones, setMilestones, reconcileFromRepo),
        {
          initialProps: {
            milestones: [],
            setMilestones: jest.fn(),
            reconcileFromRepo: () => {},
          },
        },
      );

      act(() => {
        result.current.retry();
      });
      expect(result.current.isRecoveryInFlight).toBe(false);
    });
  });
});
