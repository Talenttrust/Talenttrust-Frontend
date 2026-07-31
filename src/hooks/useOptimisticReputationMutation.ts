'use client';

import { useCallback, useRef, useState } from 'react';
import { upsertReputationEvent, getReputationEventVersion, deleteReputationEvents } from '@/lib/repository';
import type { ReputationEvent } from '@/types/domain';

export type OptimisticResult =
  | { ok: true }
  | { ok: false; stale: boolean; error: string };

export type OptimisticReputationOptions = {
  onError?: (message: string) => void;
};

export function useOptimisticReputationMutation(
  events: ReputationEvent[],
  setEvents: React.Dispatch<React.SetStateAction<ReputationEvent[]>>,
  options?: OptimisticReputationOptions,
) {
  const onError = options?.onError;
  const pendingCountRef = useRef(0);
  const [pending, setPending] = useState(false);

  const trackStart = useCallback(() => {
    pendingCountRef.current += 1;
    setPending(true);
  }, []);

  const trackEnd = useCallback(() => {
    pendingCountRef.current -= 1;
    if (pendingCountRef.current <= 0) {
      pendingCountRef.current = 0;
      setPending(false);
    }
  }, []);

  const optimisticCreate = useCallback(
    (event: ReputationEvent): Promise<OptimisticResult> => {
      setEvents((prev) => [...prev, event]);
      trackStart();

      return Promise.resolve().then(() => {
        try {
          const result = upsertReputationEvent(event);

          if (!result.success) {
            setEvents((prev) => prev.filter((e) => e.id !== event.id));
            const msg = result.stale
              ? 'This reputation event was updated in another session. Please reload and try again.'
              : 'The reputation event could not be saved. Please try again.';
            onError?.(msg);
            trackEnd();
            return { ok: false as const, stale: result.stale, error: msg };
          }

          trackEnd();
          return { ok: true as const };
        } catch {
          setEvents((prev) => prev.filter((e) => e.id !== event.id));
          const msg = 'The reputation event could not be saved. Please try again.';
          onError?.(msg);
          trackEnd();
          return { ok: false as const, stale: false, error: msg };
        }
      });
    },
    [setEvents, onError, trackStart, trackEnd],
  );

  const optimisticUpdate = useCallback(
    (id: string, patch: Partial<ReputationEvent>): Promise<OptimisticResult> => {
      const existing = events.find((e) => e.id === id);

      if (!existing) {
        const msg = 'Reputation event not found in the current list. Please reload and try again.';
        onError?.(msg);
        return Promise.resolve({ ok: false as const, stale: false, error: msg });
      }

      const snapshot = { ...existing };
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      );
      trackStart();

      return Promise.resolve().then(() => {
        try {
          const version = getReputationEventVersion(id);
          const updatedEvent: ReputationEvent = { ...snapshot, ...patch, version };
          const result = upsertReputationEvent(updatedEvent);

          if (!result.success) {
            setEvents((prev) =>
              prev.map((e) => (e.id === id ? snapshot : e)),
            );
            const msg = result.stale
              ? 'This reputation event was updated in another session. Please reload and try again.'
              : 'The reputation event could not be saved. Please try again.';
            onError?.(msg);
            trackEnd();
            return { ok: false as const, stale: result.stale, error: msg };
          }

          trackEnd();
          return { ok: true as const };
        } catch {
          setEvents((prev) =>
            prev.map((e) => (e.id === id ? snapshot : e)),
          );
          const msg = 'The reputation event could not be saved. Please try again.';
          onError?.(msg);
          trackEnd();
          return { ok: false as const, stale: false, error: msg };
        }
      });
    },
    [events, setEvents, onError, trackStart, trackEnd],
  );

  const optimisticDelete = useCallback(
    (ids: string[]): Promise<OptimisticResult> => {
      const idSet = new Set(ids);
      const removedEvents = events.filter((e) => idSet.has(e.id));
      setEvents((prev) => prev.filter((e) => !idSet.has(e.id)));
      trackStart();

      return Promise.resolve().then(() => {
        try {
          const removed = deleteReputationEvents(ids);

          if (removed === 0 && ids.length > 0) {
            setEvents((prev) => [...prev, ...removedEvents]);
            const msg = 'No reputation events were found to delete. Please reload and try again.';
            onError?.(msg);
            trackEnd();
            return { ok: false as const, stale: false, error: msg };
          }

          trackEnd();
          return { ok: true as const };
        } catch {
          setEvents((prev) => [...prev, ...removedEvents]);
          const msg = 'No reputation events were found to delete. Please reload and try again.';
          onError?.(msg);
          trackEnd();
          return { ok: false as const, stale: false, error: msg };
        }
      });
    },
    [events, setEvents, onError, trackStart, trackEnd],
  );

  return { optimisticCreate, optimisticUpdate, optimisticDelete, pending };
}
