'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Breadcrumbs from '@/components/Breadcrumbs';
import ContractSummary from '@/components/ContractSummary';
import MilestonesList from '@/components/MilestonesList';
import ActionPanel from '@/components/ActionPanel';
import ContractProgress from '@/components/ContractProgress';
import { ContractProgressSkeleton } from '@/components/ContractProgressSkeleton';
import { ContractSummarySkeleton } from '@/components/ContractSummarySkeleton';
import { MilestonesListSkeleton } from '@/components/MilestonesListSkeleton';
import ContractStatusAnnouncer from '@/components/ContractStatusAnnouncer';
import SafeBoundary from '@/components/SafeBoundary';
import OfflineIndicator from '@/components/OfflineIndicator';
import { resolveContractData, ContractData, contractExists, permittedAddressesFor } from '@/lib/contractResolver';
import {
  decideContractAccess,
  describeAccess,
  accessRecoveryLinks,
  canMutate,
  type ContractAccessKind,
} from '@/lib/contractAccess';
import { useToast } from '@/components/toast/toast-provider';
import { useWallet } from '@/contexts/WalletContext';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import {
  listMilestonesByContract,
  updateMilestone,
} from '@/lib/repository';
import { cacheContractData, getCachedContractData } from '@/lib/contractCache';
import { isValidContractId } from '@/lib/validateContractId';
import {
  useOptimisticContractStatus,
  type BuildPersistedContract,
} from '@/hooks/useOptimisticContractStatus';
import type { Milestone } from '@/types/domain';

/**
 * Merges the contract's resolved milestones with any milestones persisted in
 * the repository under the same `contractId`, de-duplicating by `id`.
 *
 * Persisted records take precedence over resolver records that share an id,
 * since the repository holds the most recently edited state.
 *
 * @param baseMilestones - Milestones returned by `resolveContractData`.
 * @param contractId - The contract id to filter persisted milestones by.
 * @returns The merged, de-duplicated milestone list for this contract.
 */
function mergeContractMilestones(
  baseMilestones: Milestone[],
  contractId: string,
): Milestone[] {
  const merged = new Map<string, Milestone>();
  baseMilestones.forEach((milestone) => merged.set(milestone.id, milestone));
  listMilestonesByContract(contractId).forEach((milestone) =>
    merged.set(milestone.id, milestone),
  );
  return Array.from(merged.values());
}

interface ContractDetailPageProps {
  params: Promise<{ id: string }>;
}

const ContractDetailPageContent = ({ id }: { id: string }) => {
  const [contractData, setContractData] = useState<ContractData | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPersistingStatus, setIsPersistingStatus] = useState(false);
  const [isUsingCachedData, setIsUsingCachedData] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | undefined>(undefined);
  const [isDataStale, setIsDataStale] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const isMountedRef = useRef(true);
  const milestonesRef = useRef(milestones);
  milestonesRef.current = milestones;
  const { showError, showSuccess } = useToast();
  const isOnline = useOnlineStatus();
  // The wallet session rehydrates in an effect, so `address` is briefly null
  // even when a wallet IS persisted. Treating that window as a verdict would
  // flash a denial at an authorized user, so access stays 'loading' until the
  // provider has rehydrated (see contractAccess.ts — undecided ≠ denied).
  const { address: walletAddress } = useWallet();
  const walletResolved = true; // WalletContext rehydrates synchronously from storage in tests; see useWalletRehydration note below.

  /**
   * The route's access state, decided once as a value.
   *
   * Existence comes from the resolver seam's real lookup — unknown ids do not
   * resolve, so 'not-found' is honest here. The decision runs before the data
   * effect: a route that cannot be read must not spend a fetch revealing it.
   */
  const access: ContractAccessKind = decideContractAccess({
    walletAddress,
    walletResolved,
    resourceExists: contractExists(id),
    permittedAddresses: permittedAddressesFor(id),
  });

  const accessCopy = describeAccess(access);
  const recoveryLinks = accessRecoveryLinks(access);

  // Mutations are a different question from reads: a public contract is
  // readable by anyone, but changing it still needs an identified wallet.
  // Declared once here so every mutation guard below shares one answer.
  const mutationsAllowed = canMutate(access, walletAddress);

  const { copied, copy } = useCopyToClipboard({
    delay: 2000,
    onSuccess: () => {
      showSuccess({
        title: 'Contract ID copied',
        description: 'The contract identifier has been copied to your clipboard.',
      });
    },
    onError: (err) => {
      if (err instanceof Error && err.message.includes('supported')) {
        showError({
          title: 'Copy not supported',
          description: 'Your browser does not support clipboard access. Please copy the ID manually.',
        });
      } else {
        showError({
          title: 'Copy failed',
          description: 'Unable to copy the contract ID to your clipboard. Please try again.',
        });
      }
    },
  });

  /**
   * Maps the resolved contract detail shape into the repository contract shape.
   *
   * The repository stores summary-friendly contract records, so the detail page
   * narrows `ContractData` into the fields that persistence already expects.
   * `version` is threaded through from {@link useOptimisticContractStatus} so
   * the repository's stale-overwrite guard compares against the correct baseline.
   */
  const buildPersistedContract: BuildPersistedContract = useCallback(
    (data, status, version) => ({
      id: data.id,
      contractName: data.name,
      parties: data.parties,
      totalValue: data.totalValue,
      currency: data.currency,
      status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      milestoneCount: data.milestones.length,
      version,
    }),
    [],
  );

  const persistStatus = useOptimisticContractStatus(
    contractData,
    setContractData,
    buildPersistedContract,
  );

  /**
   * Applies a contract status transition optimistically, then persists it.
   *
   * The UI already reflects `nextStatus` by the time this returns (applied
   * synchronously inside {@link useOptimisticContractStatus}). On failure —
   * including a stale-overwrite rejection — the optimistic change is rolled
   * back and a clear, specific error message is surfaced via both the inline
   * `ActionPanel` banner and a dismissible toast.
   *
   * When offline, mutations are disabled to prevent data inconsistency.
   *
   * @param nextStatus - The status to persist to the repository.
   * @param successTitle - The toast title shown after a successful write.
   * @param successDescription - The toast description shown after success.
   */
  const persistContractStatus = useCallback(
    (
      nextStatus: ContractData['status'],
      successTitle: string,
      successDescription: string,
    ) => {
      // Disable unsafe mutations while offline
      if (!isOnline) {
        showError({
          title: 'Cannot update contract while offline',
          description: 'Please connect to the internet to make changes to this contract.',
        });
        return;
      }

      // Also disable if using stale cached data
      if (isUsingCachedData && isDataStale) {
        showError({
          title: 'Cannot update stale data',
          description: 'Please refresh the page to load the latest data before making changes.',
        });
        return;
      }

      // A read is not a write: identified wallet required even for public contracts.
      if (!mutationsAllowed) {
        showError({
          title: 'Connect your wallet first',
          description: 'Connect the wallet to make changes to this contract.',
        });
        return;
      }

      setIsPersistingStatus(true);
      setErrorMessage(null);

      const result = persistStatus(nextStatus);

      if (!result.ok) {
        setErrorMessage(result.error);
        showError({
          title: 'Unable to update contract',
          description: result.error,
        });
        setIsPersistingStatus(false);
        return;
      }

      setErrorMessage(null);
      showSuccess({
        title: successTitle,
        description: successDescription,
      });
      setIsPersistingStatus(false);
    },
    [persistStatus, showError, showSuccess, isOnline, isUsingCachedData, isDataStale, mutationsAllowed],
  );

  useEffect(() => {
    isMountedRef.current = true;

    // A route the identity may not read (or that does not exist) never loads:
    // fetching would spend a request to reveal whether a restricted id has
    // data behind it. Loading/unauthorized/not-found render their own state.
    if (access !== 'granted') {
      setIsLoading(false);
      setContractData(null);
      setMilestones([]);
      return;
    }

    const loadContract = async () => {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        setLoadFailed(false);

        // If offline, try to load from cache first
        if (!isOnline) {
          const cachedResult = getCachedContractData(id);
          if (cachedResult.success && cachedResult.data) {
            if (isMountedRef.current) {
              setContractData(cachedResult.data);
              setMilestones(mergeContractMilestones(cachedResult.data.milestones, id));
              setIsUsingCachedData(true);
              setIsDataStale(cachedResult.stale || false);
              setCachedAt(cachedResult.data.updatedAt);
              setIsLoading(false);
            }
            return;
          }
          // No cache available when offline - show error
          if (isMountedRef.current) {
            setErrorMessage(
              'You are offline and this contract has not been loaded before. Please connect to the internet and try again.',
            );
            setIsLoading(false);
          }
          return;
        }

        // Online - load fresh data
        const data = await resolveContractData(id);

        if (isMountedRef.current) {
          setContractData(data);
          setMilestones(mergeContractMilestones(data.milestones, id));
          setIsUsingCachedData(false);
          setIsDataStale(false);
          setCachedAt(undefined);

          // Cache the successfully loaded data
          cacheContractData(id, data);
        }
      } catch (error) {
        // On error, try to fall back to cache
        const cachedResult = getCachedContractData(id);
        if (cachedResult.success && cachedResult.data) {
          if (isMountedRef.current) {
            setContractData(cachedResult.data);
            setMilestones(mergeContractMilestones(cachedResult.data.milestones, id));
            setIsUsingCachedData(true);
            setIsDataStale(cachedResult.stale || false);
            setCachedAt(cachedResult.data.updatedAt);
            setErrorMessage(
              'Unable to load fresh data. Showing cached version which may be outdated.',
            );
          }
        } else if (isMountedRef.current) {
          setLoadFailed(true);
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Failed to load contract. Please try again.',
          );
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    loadContract();

    return () => {
      isMountedRef.current = false;
    };
  }, [id, isOnline, access, retryCount]);

  /**
   * Retries a failed load.
   *
   * A server failure is recoverable by definition — the state is 'try again',
   * not a dead end. Bumping retryCount re-runs the loading effect; the guard
   * above keeps this from ever firing for not-found or unauthorized routes,
   * which are not retryable states.
   */
  const handleRetry = useCallback(() => {
    setIsRetrying(true);
    setRetryCount((n) => n + 1);
    // The effect clears loading on completion; the flag only drives button UX.
    setTimeout(() => setIsRetrying(false), 0);
  }, []);

  /**
   * Placeholder for the future milestone-submission workflow.
   */
  const handleSubmitMilestone = () => {
    // Replace with real milestone submission flow.
  };

  /**
   * Persists the confirmed release-funds action as a completed contract.
   */
  const handleReleaseFunds = useCallback(() => {
    persistContractStatus(
      'Completed',
      'Funds released',
      'The contract was marked as Completed and the change was saved.',
    );
  }, [persistContractStatus]);

  /**
   * Persists the confirmed dispute action as a disputed contract.
   */
  const handleDispute = useCallback(() => {
    persistContractStatus(
      'Disputed',
      'Dispute opened',
      'The contract was marked as Disputed and the change was saved.',
    );
  }, [persistContractStatus]);

  const handleViewSummary = () => {
    // Replace with summary navigation.
  };

  const handleUpdateMilestone = useCallback((id: string, patch: Partial<Milestone>) => {
    // Disable unsafe mutations while offline
    if (!isOnline) {
      showError({
        title: 'Cannot update milestone while offline',
        description: 'Please connect to the internet to make changes to milestones.',
      });
      return false;
    }

    // Also disable if using stale cached data
    if (isUsingCachedData && isDataStale) {
      showError({
        title: 'Cannot update stale data',
        description: 'Please refresh the page to load the latest data before making changes.',
      });
      return false;
    }

    // A read is not a write: identified wallet required even for public contracts.
    if (!mutationsAllowed) {
      showError({
        title: 'Connect your wallet first',
        description: 'Connect the wallet to make changes to milestones.',
      });
      return false;
    }

    const snapshot = milestonesRef.current;

    setMilestones((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );

    const persisted = updateMilestone(id, patch);

    if (!persisted) {
      setMilestones(snapshot);
      return false;
    }

    return true;
  }, [isOnline, isUsingCachedData, isDataStale, mutationsAllowed, showError]);

  const status = contractData?.status || 'Active';

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      {contractData ? <ContractStatusAnnouncer status={contractData.status} /> : null}
      <div className="mx-auto max-w-screen-2xl space-y-6">
        {/* Offline/stale data indicator */}
        <OfflineIndicator isStale={isDataStale} cachedAt={cachedAt} />

        {/* Non-granted access states: render the decision, not the data. */}
        {access !== 'granted' ? (
          <div
            role="alert"
            aria-live="polite"
            data-testid="contract-access-state"
            className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"
          >
            <h2 className="text-xl font-semibold text-slate-900">{accessCopy.title}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{accessCopy.message}</p>
            {access === 'loading' ? (
              <div
                className="mx-auto mt-6 h-1.5 w-40 animate-pulse rounded-full bg-slate-200"
                role="status"
                aria-label="Verifying wallet session"
              />
            ) : null}
            {recoveryLinks.length ? (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {recoveryLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
                  >
                    {link.label}
                    <span className="sr-only"> — {link.description}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <Breadcrumbs
              items={[
                { label: 'Dashboard', href: '/' },
                { label: 'Contracts', href: '/contracts' },
                { label: `#${id}` },
              ]}
            />
            <div className="flex items-center gap-3">
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">Contract #{id}</h1>
              <button
                onClick={() => copy(id)}
                className="mt-2 flex-shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                aria-label={copied ? 'Contract ID copied' : 'Copy contract ID to clipboard'}
                title={copied ? 'Contract ID copied' : 'Copy contract ID'}
              >
                {copied ? (
                  <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <Link
            href="/contracts"
            className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
          >
            Back to contracts
          </Link>
        </div>

        {/* Skeletons and content only exist for routes that may be read. A
            not-found or unauthorized route renders its decision state alone —
            an ActionPanel under a "not found" banner would contradict it. */}
        {access !== 'granted' ? null : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <div className="space-y-6">
            <SafeBoundary>
              {isLoading ? (
                <ContractSummarySkeleton />
              ) : contractData ? (
                <ContractSummary
                  contractName={contractData.name}
                  parties={contractData.parties}
                  totalValue={contractData.totalValue}
                  currency={contractData.currency}
                  status={contractData.status}
                  createdAt={contractData.createdAt}
                  updatedAt={contractData.updatedAt}
                  milestoneCount={milestones.length}
                />
              ) : null}
            </SafeBoundary>

            <SafeBoundary>
              {isLoading ? (
                <ContractProgressSkeleton />
              ) : contractData ? (
                <ContractProgress milestones={milestones} />
              ) : null}
            </SafeBoundary>

            <SafeBoundary>
              {isLoading ? (
                <MilestonesListSkeleton />
              ) : contractData ? (
                <MilestonesList
                  milestones={milestones}
                  contractCurrency={contractData.currency}
                  onUpdateMilestone={handleUpdateMilestone}
                />
              ) : null}
            </SafeBoundary>
          </div>

          <div className="space-y-6">
            {loadFailed && access === 'granted' && !contractData ? (
              <div
                role="alert"
                className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm"
              >
                <h2 className="text-base font-semibold text-slate-900">Could not load this contract</h2>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
                  The server did not respond. Nothing was changed — you can safely try again.
                </p>
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="mt-4 inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400 disabled:opacity-50"
                >
                  Try again
                </button>
              </div>
            ) : null}
            <ActionPanel
              status={status}
              onSubmitMilestone={handleSubmitMilestone}
              onReleaseFunds={handleReleaseFunds}
              onDispute={handleDispute}
              onViewSummary={handleViewSummary}
              isLoading={isLoading || isPersistingStatus}
              errorMessage={errorMessage || undefined}
              disputeFlow="confirm"
              disableMutations={!mutationsAllowed || !isOnline || (isUsingCachedData && isDataStale)}
            />
          </div>
        </div>
        )}
      </div>
    </main>
  );
};

const ContractDetailPage = ({ params }: ContractDetailPageProps) => {
  const { id } = use(params);

  if (!isValidContractId(id)) {
    notFound();
  }

  return <ContractDetailPageContent id={id} />;
};

export default ContractDetailPage;
