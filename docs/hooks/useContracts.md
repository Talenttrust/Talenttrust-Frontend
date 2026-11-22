# Data & Mutation Hooks (`useContracts` & `useEscrowMutation`)

SWR-backed hooks for fetching escrows and freelancer reputation and executing escrow mutations with automatic SWR cache updates.

## File Locations

- Query hooks: `src/hooks/useContracts.ts`
- Mutation hook: `src/hooks/useEscrowMutation.ts`
- SWR key helpers & provider: `src/lib/swr.tsx`
- Arbiter check hook: `src/lib/stellar/useIsArbiter.ts`
- Tests: `src/hooks/useContracts.test.tsx`

## `useContracts`, `useContract`, `useReputation` (`src/hooks/useContracts.ts`)

```ts
export function useContracts(filters?: ContractFilters): {
  contracts: EscrowContract[] | null;
  error: ApiError | null;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<{ data: EscrowContract[] }>;
};

export function useContract(id: number | string | null): {
  contract: EscrowContract | null;
  error: ApiError | null;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<EscrowContract>;
};

export function useReputation(address: string | null): {
  reputation: Reputation | null;
  error: ApiError | null;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<Reputation>;
};
```

- `useContracts` sorts returned escrows descending by `id` (`b.id - a.id`).
- Passing `null` to `useContract` or `useReputation` disables the SWR request.

## `useEscrowMutation` (`src/hooks/useEscrowMutation.ts`)

```ts
export type EscrowAction =
  | 'create'
  | 'deposit'
  | 'release'
  | 'dispute'
  | 'cancel'
  | 'resolve'
  | 'reputation';

export interface EscrowRunOptions {
  body?: unknown;
  milestoneIndex?: number;
}

export interface EscrowActionResult {
  response: unknown;
  contract: EscrowContract | null;
}

export function useEscrowMutation(): {
  run: (
    id: number | 'new',
    action: EscrowAction,
    options?: EscrowRunOptions,
  ) => Promise<EscrowActionResult>;
};
```

When an action endpoint returns an updated `EscrowContract`, `run` writes it directly into both the individual `contractKey(contract.id)` cache entry and any active `contractsListKey` cache entries without triggering a redundant revalidation round-trip. When the endpoint returns another shape (such as `reputation`), it revalidates all contract list keys.
