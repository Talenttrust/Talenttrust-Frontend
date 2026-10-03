import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, jest } from '@jest/globals';
import {
  ContractStateError,
  canTransition,
  isTerminalStatus,
  validateContract,
} from '../../lib/contractsState';
import { useContracts } from '../../hooks/useContracts';

function makeContract(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'c-1',
    title: 'Service agreement',
    status: 'draft' as const,
    revision: 0,
    updatedAt: 1,
    ...overrides,
  };
}

describe('contractsState pure helpers', () => {
  it('enforces the allowed transition graph', () => {
    expect(canTransition('draft', 'active')).toBe(true);
    expect(canTransition('draft', 'cancelled')).toBe(true);
    expect(canTransition('active', 'completed')).toBe(true);
    expect(canTransition('active', 'cancelled')).toBe(true);
    expect(canTransition('draft', 'completed')).toBe(false);
    expect(canTransition('completed', 'active')).toBe(false);
    expect(canTransition('cancelled', 'draft')).toBe(false);
    // Idempotent no-op.
    expect(canTransition('draft', 'draft')).toBe(true);
  });

  it('marks terminal states correctly', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('draft')).toBe(false);
    expect(isTerminalStatus('active')).toBe(false);
  });

  it('rejects invalid payloads', () => {
    expect(() => validateContract(null)).toThrow(ContractStateError);
    expect(() => validateContract({})).toThrow(ContractStateError);
    expect(() => validateContract(makeContract({ status: 'bogus' }))).toThrow(ContractStateError);
    expect(() => validateContract(makeContract({ revision: -1 }))).toThrow(ContractStateError);
  });

  it('accepts valid payloads and normalizes optional fields', () => {
    const c = validateContract(makeContract());
    expect(c.id).toBe('c-1');
    expect(c.status).toBe('draft');
    expect(typeof c.updatedAt).toBe('number');
  });
});

describe('useContracts hook', () => {
  it('hydrates and dedupes by id keeping the newest revision', () => {
    const { result } = renderHook(() => useContracts());
    act(() => {
      result.current.hydrate([
        makeContract({ id: 'a', revision: 1 }),
        makeContract({ id: 'a' , revision: 3, title: 'Newest' }),
        makeContract({ id: 'b', revision: 2 }),
      ]);
    });
    expect(result.current.contracts.map((c) => c.id)).toEqual(['a', 'b']);
    expect(result.current.contracts.find((c) => c.id === 'a')?.title).toBe('Newest');
  });

  it('skips invalid entries during hydration and reports them', () => {
    const onError = jest.fn();
    const { result } = renderHook(() => useContracts({ onError }));
    act(() => {
      result.current.hydrate([makeContract(), null, { id: 'bad' }]);
    });
    expect(result.current.contracts).toHaveLength(1);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate adds as a no-op', () => {
    const { result } = renderHook(() => useContracts());
    act(() => {
      result.current.add(makeContract());
      result.current.add(makeContract());
    });
    expect(result.current.contracts).toHaveLength(1);
  });

  it('transitions along allowed graph and confirms on success', async () => {
    const mutateStatus = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useContracts({ mutateStatus }));

    act(() => {
      result.current.hydrate([makeContract({ id: 'c-1', status: 'draft' })]);
    });

    await act(async () => {
      await result.current.transition('c-1', 'active');
    });

    expect(mutateStatus).toHaveBeenCalledWith('c-1', 'active');
    expect(result.current.contracts.find((c) => c.id === 'c-1')?.status).toBe('active');
  });
});
