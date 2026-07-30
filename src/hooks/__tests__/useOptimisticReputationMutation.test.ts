import { renderHook, act } from '@testing-library/react';
import { useOptimisticReputationMutation } from '../useOptimisticReputationMutation';
import * as repository from '@/lib/repository';
import type { ReputationEvent } from '@/types/domain';

jest.mock('@/lib/repository', () => ({
  ...jest.requireActual('@/lib/repository'),
  upsertReputationEvent: jest.fn(),
  getReputationEventVersion: jest.fn(),
  deleteReputationEvents: jest.fn(),
}));

const mockedUpsertReputationEvent = jest.mocked(repository.upsertReputationEvent);
const mockedGetReputationEventVersion = jest.mocked(repository.getReputationEventVersion);
const mockedDeleteReputationEvents = jest.mocked(repository.deleteReputationEvents);

const baseEvents: ReputationEvent[] = [
  {
    id: 'evt-1',
    type: 'contract_completed',
    summary: 'Completed Design Contract',
    date: '2025-01-01',
  },
  {
    id: 'evt-2',
    type: 'milestone_completed',
    summary: 'Completed UI Design Milestone',
    date: '2025-02-01',
  },
];

// =============================================================================
// optimisticCreate
// =============================================================================

describe('useOptimisticReputationMutation — optimisticCreate', () => {
  const newEvent: ReputationEvent = {
    id: 'evt-new',
    type: 'review_received',
    summary: 'Received 5 stars',
    date: '2025-03-01',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('applies the new event optimistically before persistence', async () => {
    mockedUpsertReputationEvent.mockReturnValue({ success: true, stale: false });

    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    await act(async () => {
      await result.current.optimisticCreate(newEvent);
    });

    expect(setEvents).toHaveBeenCalledWith(expect.any(Function));
    const stateUpdater = setEvents.mock.calls[0][0];
    const optimisticState = stateUpdater(baseEvents);
    expect(optimisticState).toEqual([...baseEvents, newEvent]);
    expect(mockedUpsertReputationEvent).toHaveBeenCalledWith(newEvent);
  });

  it('returns { ok: true } on successful persistence', async () => {
    mockedUpsertReputationEvent.mockReturnValue({ success: true, stale: false });

    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    let outcome: Awaited<ReturnType<typeof result.current.optimisticCreate>> | undefined;
    await act(async () => {
      outcome = await result.current.optimisticCreate(newEvent);
    });

    expect(outcome).toEqual({ ok: true });
  });

  it('rolls back the optimistic event when persistence fails', async () => {
    mockedUpsertReputationEvent.mockReturnValue({ success: false, stale: false });

    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    let outcome: Awaited<ReturnType<typeof result.current.optimisticCreate>> | undefined;
    await act(async () => {
      outcome = await result.current.optimisticCreate(newEvent);
    });

    expect(outcome).toEqual({
      ok: false,
      stale: false,
      error: 'The reputation event could not be saved. Please try again.',
    });

    expect(setEvents).toHaveBeenCalledTimes(2);
    const rollbackUpdater = setEvents.mock.calls[1][0];
    const rolledBack = rollbackUpdater([...baseEvents, newEvent]);
    expect(rolledBack).toEqual(baseEvents);
  });

  it('rolls back and returns stale:true when a stale overwrite is detected', async () => {
    mockedUpsertReputationEvent.mockReturnValue({ success: false, stale: true });

    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    let outcome: Awaited<ReturnType<typeof result.current.optimisticCreate>> | undefined;
    await act(async () => {
      outcome = await result.current.optimisticCreate(newEvent);
    });

    expect(outcome).toEqual({
      ok: false,
      stale: true,
      error: 'This reputation event was updated in another session. Please reload and try again.',
    });
  });

  it('calls onError callback when persistence fails', async () => {
    mockedUpsertReputationEvent.mockReturnValue({ success: false, stale: false });

    const setEvents = jest.fn();
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents, { onError }),
    );

    await act(async () => {
      await result.current.optimisticCreate(newEvent);
    });

    expect(onError).toHaveBeenCalledWith(
      'The reputation event could not be saved. Please try again.',
    );
  });

  it('calls onError with stale message on stale conflict', async () => {
    mockedUpsertReputationEvent.mockReturnValue({ success: false, stale: true });

    const setEvents = jest.fn();
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents, { onError }),
    );

    await act(async () => {
      await result.current.optimisticCreate(newEvent);
    });

    expect(onError).toHaveBeenCalledWith(
      'This reputation event was updated in another session. Please reload and try again.',
    );
  });

  it('does not call onError on success', async () => {
    mockedUpsertReputationEvent.mockReturnValue({ success: true, stale: false });

    const setEvents = jest.fn();
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents, { onError }),
    );

    await act(async () => {
      await result.current.optimisticCreate(newEvent);
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it('rolls back and calls onError when upsert throws', async () => {
    mockedUpsertReputationEvent.mockImplementation(() => {
      throw new Error('storage full');
    });

    const setEvents = jest.fn();
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents, { onError }),
    );

    let outcome: Awaited<ReturnType<typeof result.current.optimisticCreate>> | undefined;
    await act(async () => {
      outcome = await result.current.optimisticCreate(newEvent);
    });

    expect(outcome).toEqual({
      ok: false,
      stale: false,
      error: 'The reputation event could not be saved. Please try again.',
    });
    expect(onError).toHaveBeenCalled();
    expect(setEvents).toHaveBeenCalledTimes(2);
  });
});

// =============================================================================
// optimisticUpdate
// =============================================================================

describe('useOptimisticReputationMutation — optimisticUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetReputationEventVersion.mockReturnValue(0);
  });

  it('applies the patch optimistically before persistence', async () => {
    mockedUpsertReputationEvent.mockReturnValue({ success: true, stale: false });

    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    await act(async () => {
      await result.current.optimisticUpdate('evt-1', { summary: 'Updated Summary' });
    });

    const stateUpdater = setEvents.mock.calls[0][0];
    const updatedState = stateUpdater(baseEvents);
    expect(updatedState[0]).toEqual(
      expect.objectContaining({ id: 'evt-1', summary: 'Updated Summary' }),
    );
    expect(updatedState[1]).toEqual(baseEvents[1]);

    expect(mockedGetReputationEventVersion).toHaveBeenCalledWith('evt-1');
    expect(mockedUpsertReputationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt-1', summary: 'Updated Summary', version: 0 }),
    );
  });

  it('returns { ok: true } on successful persistence', async () => {
    mockedUpsertReputationEvent.mockReturnValue({ success: true, stale: false });

    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    let outcome: Awaited<ReturnType<typeof result.current.optimisticUpdate>> | undefined;
    await act(async () => {
      outcome = await result.current.optimisticUpdate('evt-1', { summary: 'Updated' });
    });

    expect(outcome).toEqual({ ok: true });
  });

  it('rolls back the optimistic update when persistence fails', async () => {
    mockedUpsertReputationEvent.mockReturnValue({ success: false, stale: false });

    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    await act(async () => {
      await result.current.optimisticUpdate('evt-1', { summary: 'Updated' });
    });

    expect(setEvents).toHaveBeenCalledTimes(2);
    const rollbackUpdater = setEvents.mock.calls[1][0];
    const rolledBack = rollbackUpdater(
      baseEvents.map((e) => (e.id === 'evt-1' ? { ...e, summary: 'Updated' } : e)),
    );
    expect(rolledBack[0]).toEqual(baseEvents[0]);
  });

  it('rolls back and returns stale:true when a stale overwrite is detected', async () => {
    mockedUpsertReputationEvent.mockReturnValue({ success: false, stale: true });

    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    let outcome: Awaited<ReturnType<typeof result.current.optimisticUpdate>> | undefined;
    await act(async () => {
      outcome = await result.current.optimisticUpdate('evt-1', { summary: 'Updated' });
    });

    expect(outcome).toEqual({
      ok: false,
      stale: true,
      error: 'This reputation event was updated in another session. Please reload and try again.',
    });
  });

  it('rolls back and returns error when the event id is not found in state', async () => {
    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    let outcome: Awaited<ReturnType<typeof result.current.optimisticUpdate>> | undefined;
    await act(async () => {
      outcome = await result.current.optimisticUpdate('nonexistent-id', { summary: 'Updated' });
    });

    expect(outcome).toEqual({
      ok: false,
      stale: false,
      error: 'Reputation event not found in the current list. Please reload and try again.',
    });

    expect(setEvents).not.toHaveBeenCalled();
  });

  it('passes the correct stored version to upsertReputationEvent', async () => {
    mockedGetReputationEventVersion.mockReturnValue(3);
    mockedUpsertReputationEvent.mockReturnValue({ success: true, stale: false });

    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    await act(async () => {
      await result.current.optimisticUpdate('evt-1', { summary: 'Updated' });
    });

    expect(mockedGetReputationEventVersion).toHaveBeenCalledWith('evt-1');
    expect(mockedUpsertReputationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'evt-1', version: 3 }),
    );
  });

  it('calls onError callback when persistence fails', async () => {
    mockedUpsertReputationEvent.mockReturnValue({ success: false, stale: false });

    const setEvents = jest.fn();
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents, { onError }),
    );

    await act(async () => {
      await result.current.optimisticUpdate('evt-1', { summary: 'Updated' });
    });

    expect(onError).toHaveBeenCalledWith(
      'The reputation event could not be saved. Please try again.',
    );
  });

  it('calls onError when event id is not found', async () => {
    const setEvents = jest.fn();
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents, { onError }),
    );

    await act(async () => {
      await result.current.optimisticUpdate('nonexistent-id', { summary: 'Updated' });
    });

    expect(onError).toHaveBeenCalledWith(
      'Reputation event not found in the current list. Please reload and try again.',
    );
  });

  it('rolls back and calls onError when upsert throws', async () => {
    mockedUpsertReputationEvent.mockImplementation(() => {
      throw new Error('disk error');
    });

    const setEvents = jest.fn();
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents, { onError }),
    );

    let outcome: Awaited<ReturnType<typeof result.current.optimisticUpdate>> | undefined;
    await act(async () => {
      outcome = await result.current.optimisticUpdate('evt-1', { summary: 'Updated' });
    });

    expect(outcome).toEqual({
      ok: false,
      stale: false,
      error: 'The reputation event could not be saved. Please try again.',
    });
    expect(onError).toHaveBeenCalled();
  });
});

// =============================================================================
// optimisticDelete
// =============================================================================

describe('useOptimisticReputationMutation — optimisticDelete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes events optimistically before persistence', async () => {
    mockedDeleteReputationEvents.mockReturnValue(1);

    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    await act(async () => {
      await result.current.optimisticDelete(['evt-1']);
    });

    const stateUpdater = setEvents.mock.calls[0][0];
    const updatedState = stateUpdater(baseEvents);
    expect(updatedState).toHaveLength(1);
    expect(updatedState[0].id).toBe('evt-2');

    expect(mockedDeleteReputationEvents).toHaveBeenCalledWith(['evt-1']);
  });

  it('returns { ok: true } on successful deletion', async () => {
    mockedDeleteReputationEvents.mockReturnValue(1);

    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    let outcome: Awaited<ReturnType<typeof result.current.optimisticDelete>> | undefined;
    await act(async () => {
      outcome = await result.current.optimisticDelete(['evt-1']);
    });

    expect(outcome).toEqual({ ok: true });
  });

  it('rolls back when no events were actually deleted', async () => {
    mockedDeleteReputationEvents.mockReturnValue(0);

    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    await act(async () => {
      await result.current.optimisticDelete(['nonexistent-id']);
    });

    expect(setEvents).toHaveBeenCalledTimes(2);
    const rollbackUpdater = setEvents.mock.calls[1][0];
    const rolledBack = rollbackUpdater([]);
    expect(rolledBack).toEqual([baseEvents[0]]);
  });

  it('calls onError callback when delete fails', async () => {
    mockedDeleteReputationEvents.mockReturnValue(0);

    const setEvents = jest.fn();
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents, { onError }),
    );

    await act(async () => {
      await result.current.optimisticDelete(['nonexistent-id']);
    });

    expect(onError).toHaveBeenCalledWith(
      'No reputation events were found to delete. Please reload and try again.',
    );
  });

  it('does not call onError on successful deletion', async () => {
    mockedDeleteReputationEvents.mockReturnValue(1);

    const setEvents = jest.fn();
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents, { onError }),
    );

    await act(async () => {
      await result.current.optimisticDelete(['evt-1']);
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it('rolls back and calls onError when delete throws', async () => {
    mockedDeleteReputationEvents.mockImplementation(() => {
      throw new Error('storage error');
    });

    const setEvents = jest.fn();
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents, { onError }),
    );

    let outcome: Awaited<ReturnType<typeof result.current.optimisticDelete>> | undefined;
    await act(async () => {
      outcome = await result.current.optimisticDelete(['evt-1']);
    });

    expect(outcome).toEqual({
      ok: false,
      stale: false,
      error: 'No reputation events were found to delete. Please reload and try again.',
    });
    expect(onError).toHaveBeenCalled();
  });
});

// =============================================================================
// pending state
// =============================================================================

describe('useOptimisticReputationMutation — pending state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts with pending = false', () => {
    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    expect(result.current.pending).toBe(false);
  });

  it('returns pending = false after operation completes', async () => {
    mockedUpsertReputationEvent.mockReturnValue({ success: true, stale: false });

    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    await act(async () => {
      await result.current.optimisticCreate({
        id: 'evt-p',
        type: 'test',
        summary: 'Pending test',
        date: '2025-04-01',
      });
    });

    expect(result.current.pending).toBe(false);
  });
});

// =============================================================================
// concurrent actions
// =============================================================================

describe('useOptimisticReputationMutation — concurrent actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetReputationEventVersion.mockReturnValue(0);
  });

  it('handles concurrent create and update independently', async () => {
    const newEvent: ReputationEvent = {
      id: 'evt-new',
      type: 'review',
      summary: 'New review',
      date: '2025-03-01',
    };

    let upsertCallCount = 0;
    mockedUpsertReputationEvent.mockImplementation((event) => {
      upsertCallCount++;
      if ((event as ReputationEvent).id === 'evt-new') {
        return { success: false, stale: false };
      }
      return { success: true, stale: false };
    });

    const setEvents = jest.fn();
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents, { onError }),
    );

    await act(async () => {
      const createPromise = result.current.optimisticCreate(newEvent);
      const updatePromise = result.current.optimisticUpdate('evt-1', {
        summary: 'Concurrent update',
      });

      const [createResult, updateResult] = await Promise.all([createPromise, updatePromise]);

      expect(createResult).toEqual({
        ok: false,
        stale: false,
        error: 'The reputation event could not be saved. Please try again.',
      });
      expect(updateResult).toEqual({ ok: true });
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(upsertCallCount).toBe(2);
  });

  it('handles concurrent deletes without corrupting rollback', async () => {
    let deleteCallCount = 0;
    mockedDeleteReputationEvents.mockImplementation((ids) => {
      deleteCallCount++;
      if (ids.includes('nonexistent-id')) return 0;
      return ids.length;
    });

    const setEvents = jest.fn();
    const onError = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents, { onError }),
    );

    await act(async () => {
      const deleteSuccess = result.current.optimisticDelete(['evt-1']);
      const deleteFail = result.current.optimisticDelete(['nonexistent-id']);

      const [successResult, failResult] = await Promise.all([deleteSuccess, deleteFail]);

      expect(successResult).toEqual({ ok: true });
      expect(failResult).toEqual({
        ok: false,
        stale: false,
        error: 'No reputation events were found to delete. Please reload and try again.',
      });
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(deleteCallCount).toBe(2);
  });

  it('per-operation rollback only undoes its own change on create failure', async () => {
    const eventA: ReputationEvent = {
      id: 'evt-a',
      type: 'test',
      summary: 'Event A',
      date: '2025-03-01',
    };
    const eventB: ReputationEvent = {
      id: 'evt-b',
      type: 'test',
      summary: 'Event B',
      date: '2025-03-02',
    };

    mockedUpsertReputationEvent.mockImplementation((event) => {
      if ((event as ReputationEvent).id === 'evt-a') {
        return { success: false, stale: false };
      }
      return { success: true, stale: false };
    });

    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    await act(async () => {
      await Promise.all([
        result.current.optimisticCreate(eventA),
        result.current.optimisticCreate(eventB),
      ]);
    });

    const rollbackCalls = setEvents.mock.calls.filter(
      (call) => typeof call[0] === 'function',
    );

    const rollbackForA = rollbackCalls.find((call) => {
      const fn = call[0] as (prev: ReputationEvent[]) => ReputationEvent[];
      const result = fn([...baseEvents, eventA, eventB]);
      return result.length === baseEvents.length + 1 && !result.find((e) => e.id === 'evt-a');
    });
    expect(rollbackForA).toBeDefined();
  });

  it('per-operation rollback only undoes its own change on update failure', async () => {
    mockedUpsertReputationEvent.mockImplementation((event) => {
      if ((event as ReputationEvent).summary === 'Bad Update') {
        return { success: false, stale: false };
      }
      return { success: true, stale: false };
    });

    const setEvents = jest.fn();
    const { result } = renderHook(() =>
      useOptimisticReputationMutation(baseEvents, setEvents),
    );

    await act(async () => {
      await Promise.all([
        result.current.optimisticUpdate('evt-1', { summary: 'Bad Update' }),
        result.current.optimisticUpdate('evt-2', { summary: 'Good Update' }),
      ]);
    });

    const rollbackCalls = setEvents.mock.calls.filter(
      (call) => typeof call[0] === 'function',
    );

    const rollbackForEvt1 = rollbackCalls.find((call) => {
      const fn = call[0] as (prev: ReputationEvent[]) => ReputationEvent[];
      const state = baseEvents.map((e) =>
        e.id === 'evt-1'
          ? { ...e, summary: 'Bad Update' }
          : e.id === 'evt-2'
            ? { ...e, summary: 'Good Update' }
            : e,
      );
      const result = fn(state);
      return (
        result.find((e) => e.id === 'evt-1')?.summary === baseEvents[0].summary &&
        result.find((e) => e.id === 'evt-2')?.summary === 'Good Update'
      );
    });
    expect(rollbackForEvt1).toBeDefined();
  });
});
