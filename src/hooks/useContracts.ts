'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { ApiError, EscrowContract, Reputation } from '@/lib/api';
import { contractKey, contractsListKey, type ContractFilters } from '@/lib/swr';

interface ContractListResponse {
  data: EscrowContract[];
}

export function useContracts(filters?: ContractFilters) {
  const { data, error, isValidating, isLoading, mutate } = useSWR<ContractListResponse>(contractsListKey(filters), {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
  });
  const contracts = useMemo(
    () => (data?.data ? [...data.data].sort((a, b) => b.id - a.id) : null),
    [data],
  );
  return {
    contracts,
    error: (error as ApiError | null) ?? null,
    isLoading,
    isValidating,
    mutate,
  };
}

export function useContract(id: number | string | null) {
  const { data, error, isValidating, isLoading, mutate } = useSWR<
    EscrowContract | { data: EscrowContract }
  >(id == null ? null : contractKey(id));
  const contract = data && 'data' in data ? data.data : data ?? null;
  return {
    contract,
    error: (error as ApiError | null) ?? null,
    isLoading,
    isValidating,
    mutate,
  };
}

export function useReputation(address: string | null) {
  const key = address ? `/api/v1/reputation/${encodeURIComponent(address)}` : null;
  const { data, error, isValidating, isLoading, mutate } = useSWR<Reputation>(key);
  return {
    reputation: data ?? null,
    error: (error as ApiError | null) ?? null,
    isLoading,
    isValidating,
    mutate,
  };
}
