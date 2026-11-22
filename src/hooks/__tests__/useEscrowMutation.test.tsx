import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import useSWR, { SWRConfig, useSWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type EscrowContract, type Reputation } from '@/lib/api';
import { contractKey, contractsListKey, CONTRACTS_PREFIX, SwrProvider } from '@/lib/swr';
import { type EscrowAction, useEscrowMutation } from '../useEscrowMutation';

const { apiMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: apiMock,
  };
});

function makeContract(overrides: Partial<EscrowContract> = {}): EscrowContract {
  return {
    id: 1,
    title: 'Build landing page',
    client: 'GCLIENT111',
    freelancer: 'GFREELANCER222',
    token: 'USDC',
    milestones: [
      { index: 0, title: 'Design', amount: 200, released: false },
      { index: 1, title: 'Implementation', amount: 300, released: false },
    ],
    totalAmount: 500,
    fundedAmount: 500,
    releasedAmount: 0,
    status: 'Funded',
    reputationIssued: false,
    ...overrides,
  };
}

function createWrapper(cache: Map<string, unknown> = new Map()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        {children}
      </SWRConfig>
    );
  };
}

describe('useEscrowMutation', () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  describe('action paths, HTTP method, and body passthrough', () => {
    const cases: Array<{
      action: EscrowAction;
      id: number | 'new';
      milestoneIndex?: number;
      body?: unknown;
      expectedPath: string;
    }> = [
      {
        action: 'create',
        id: 'new',
        body: { title: 'New contract', totalAmount: 100 },
        expectedPath: CONTRACTS_PREFIX,
      },
      {
        action: 'deposit',
        id: 42,
        body: { amount: 250 },
        expectedPath: `${CONTRACTS_PREFIX}/42/deposit`,
      },
      {
        action: 'release',
        id: 42,
        milestoneIndex: 2,
        expectedPath: `${CONTRACTS_PREFIX}/42/milestones/2/release`,
      },
      {
        action: 'dispute',
        id: 42,
        body: { reason: 'Missed deadline' },
        expectedPath: `${CONTRACTS_PREFIX}/42/dispute`,
      },
      {
        action: 'cancel',
        id: 42,
        expectedPath: `${CONTRACTS_PREFIX}/42/cancel`,
      },
      {
        action: 'resolve',
        id: 42,
        body: { freelancerBps: 5000 },
        expectedPath: `${CONTRACTS_PREFIX}/42/resolve`,
      },
      {
        action: 'reputation',
        id: 42,
        body: { rating: 5 },
        expectedPath: `${CONTRACTS_PREFIX}/42/reputation`,
      },
    ];

    it.each(cases)(
      'calls POST $expectedPath for "$action" and forwards body',
      async ({ action, id, milestoneIndex, body, expectedPath }) => {
        const returned = makeContract({ id: typeof id === 'number' ? id : 99 });
        apiMock.mockResolvedValueOnce({ data: returned });

        const { result } = renderHook(() => useEscrowMutation(), {
          wrapper: createWrapper(),
        });

        const options =
          body !== undefined || milestoneIndex !== undefined
            ? { body, milestoneIndex }
            : undefined;

        const outcome = await act(async () => result.current.run(id, action, options));

        expect(apiMock).toHaveBeenCalledTimes(1);
        expect(apiMock).toHaveBeenCalledWith(expectedPath, {
          method: 'POST',
          body,
        });
        expect(outcome).toEqual({
          response: { data: returned },
          contract: returned,
        });
      },
    );
  });

  describe('cache updates for contract responses', () => {
    it('writes the returned contract to the detail key and replaces matching items in list caches', async () => {
      const original = makeContract({ id: 7, status: 'Created', fundedAmount: 0 });
      const other = makeContract({ id: 8, title: 'Audit smart contract' });
      const updated = makeContract({ id: 7, status: 'Funded', fundedAmount: 500 });

      apiMock.mockResolvedValueOnce({ data: updated });

      const cache = new Map<string, unknown>();
      const allListKey = contractsListKey();
      const filteredListKey = contractsListKey({ status: 'Created' });

      const noFetchOpts = {
        revalidateOnMount: false,
        revalidateIfStale: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      };

      const { result } = renderHook(
        () => {
          const mutation = useEscrowMutation();
          const swr = useSWRConfig();
          const detail = useSWR<EscrowContract>(contractKey(7), undefined, noFetchOpts);
          const allList = useSWR<{ data: EscrowContract[] }>(allListKey, undefined, noFetchOpts);
          const filteredList = useSWR<{ data: EscrowContract[] }>(filteredListKey, undefined, noFetchOpts);
          return {
            mutation,
            swr,
            detailData: detail.data,
            allListData: allList.data,
            filteredListData: filteredList.data,
          };
        },
        { wrapper: createWrapper(cache) },
      );

      // Seed existing list caches before running the mutation.
      await act(async () => {
        await result.current.swr.mutate(allListKey, { data: [original, other] }, { revalidate: false });
        await result.current.swr.mutate(filteredListKey, { data: [original] }, { revalidate: false });
      });

      const outcome = await act(async () =>
        result.current.mutation.run(7, 'deposit', { body: { amount: 500 } }),
      );

      expect(outcome.contract).toEqual(updated);
      expect(result.current.detailData).toEqual(updated);
      expect(result.current.allListData).toEqual({ data: [updated, other] });
      expect(result.current.filteredListData).toEqual({ data: [updated] });
      // Only the POST mutation should have been called (no revalidation GETs).
      expect(apiMock).toHaveBeenCalledTimes(1);
    });

    it('appends a newly created contract to existing list caches and populates its detail key', async () => {
      const existing = makeContract({ id: 1, title: 'Existing contract' });
      const created = makeContract({ id: 2, title: 'Brand new contract', status: 'Created' });

      apiMock.mockResolvedValueOnce(created);

      const cache = new Map<string, unknown>();
      const listKey = contractsListKey();

      const noFetchOpts = {
        revalidateOnMount: false,
        revalidateIfStale: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      };

      const { result } = renderHook(
        () => {
          const mutation = useEscrowMutation();
          const swr = useSWRConfig();
          const detail = useSWR<EscrowContract>(contractKey(2), undefined, noFetchOpts);
          const list = useSWR<{ data: EscrowContract[] }>(listKey, undefined, noFetchOpts);
          return {
            mutation,
            swr,
            detailData: detail.data,
            listData: list.data,
          };
        },
        { wrapper: createWrapper(cache) },
      );

      await act(async () => {
        await result.current.swr.mutate(listKey, { data: [existing] }, { revalidate: false });
      });

      const outcome = await act(async () =>
        result.current.mutation.run('new', 'create', { body: { title: 'Brand new contract' } }),
      );

      expect(outcome).toEqual({ response: created, contract: created });
      expect(result.current.detailData).toEqual(created);
      expect(result.current.listData).toEqual({ data: [existing, created] });
      expect(apiMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('non-contract responses', () => {
    it('returns contract: null and triggers list cache revalidation', async () => {
      const initial = makeContract({ id: 10, status: 'Completed', reputationIssued: false });
      const refreshed = makeContract({ id: 10, status: 'Completed', reputationIssued: true });
      const reputation: Reputation = {
        address: 'GFREELANCER222',
        completedContracts: 3,
        totalRating: 15,
        averageRating: 5,
      };

      // 1st call: initial list fetch; 2nd call: POST reputation; 3rd call: revalidated list fetch.
      apiMock
        .mockResolvedValueOnce({ data: [initial] })
        .mockResolvedValueOnce(reputation)
        .mockResolvedValueOnce({ data: [refreshed] });

      const cache = new Map<string, unknown>();
      const listKey = contractsListKey();

      const wrapper = ({ children }: { children: ReactNode }) => (
        <SwrProvider value={{ provider: () => cache, dedupingInterval: 0 }}>
          {children}
        </SwrProvider>
      );

      const { result } = renderHook(
        () => {
          const list = useSWR<{ data: EscrowContract[] }>(listKey);
          const mutation = useEscrowMutation();
          return { list, mutation };
        },
        { wrapper },
      );

      await waitFor(() => {
        expect(result.current.list.data).toEqual({ data: [initial] });
      });

      const outcome = await act(async () =>
        result.current.mutation.run(10, 'reputation', { body: { rating: 5 } }),
      );

      expect(outcome).toEqual({ response: reputation, contract: null });

      await waitFor(() => {
        expect(result.current.list.data).toEqual({ data: [refreshed] });
      });

      expect(apiMock).toHaveBeenNthCalledWith(1, CONTRACTS_PREFIX, { retries: 0 });
      expect(apiMock).toHaveBeenNthCalledWith(2, `${CONTRACTS_PREFIX}/10/reputation`, {
        method: 'POST',
        body: { rating: 5 },
      });
      expect(apiMock).toHaveBeenNthCalledWith(3, CONTRACTS_PREFIX, { retries: 0 });
    });
  });

  describe('error propagation', () => {
    it('propagates errors thrown by api without modifying existing caches', async () => {
      const existing = makeContract({ id: 5, status: 'Funded' });
      const apiError = new ApiError({
        kind: 'http',
        status: 400,
        code: 'invalid_status',
        message: 'Invalid status',
      });

      apiMock.mockRejectedValueOnce(apiError);

      const cache = new Map<string, unknown>();
      const listKey = contractsListKey();

      const noFetchOpts = {
        revalidateOnMount: false,
        revalidateIfStale: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
      };

      const { result } = renderHook(
        () => {
          const mutation = useEscrowMutation();
          const swr = useSWRConfig();
          const list = useSWR<{ data: EscrowContract[] }>(listKey, undefined, noFetchOpts);
          return { mutation, swr, listData: list.data };
        },
        { wrapper: createWrapper(cache) },
      );

      await act(async () => {
        await result.current.swr.mutate(listKey, { data: [existing] }, { revalidate: false });
      });

      await expect(
        act(async () => {
          await result.current.mutation.run(5, 'cancel');
        }),
      ).rejects.toBe(apiError);

      expect(result.current.listData).toEqual({ data: [existing] });
    });
  });
});
