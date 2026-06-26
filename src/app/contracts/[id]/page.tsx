'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import ContractSummary from '@/components/ContractSummary';
import MilestonesList from '@/components/MilestonesList';
import ActionPanel from '@/components/ActionPanel';
import ContractProgress from '@/components/ContractProgress';
import { ContractProgressSkeleton } from '@/components/ContractProgressSkeleton';
import { ContractSummarySkeleton } from '@/components/ContractSummarySkeleton';
import { MilestonesListSkeleton } from '@/components/MilestonesListSkeleton';
import SafeBoundary from '@/components/SafeBoundary';
import { resolveContractData, ContractData } from '@/lib/contractResolver';
import { isValidContractId } from '@/lib/validateContractId';

interface ContractDetailPageProps {
  params: Promise<{ id: string }>;
}

const ContractDetailPageContent = ({ id }: { id: string }) => {
  const [contractData, setContractData] = useState<ContractData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const loadContract = async () => {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        const data = await resolveContractData(id);

        if (isMountedRef.current) {
          setContractData(data);
        }
      } catch (error) {
        if (isMountedRef.current) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Failed to load contract. Please try again.'
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
  }, [id]);

  const handleSubmitMilestone = () => {
    // Replace with real milestone submission flow.
  };

  const handleReleaseFunds = () => {
    // Replace with real fund release flow.
  };

  const handleDispute = () => {
    // Replace with real dispute workflow.
  };

  const handleViewSummary = () => {
    // Replace with summary navigation.
  };

  const status = contractData?.status || 'Active';

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm text-slate-500">Contract details</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Contract #{id}</h1>
          </div>
          <Link
            href="/contracts"
            className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
          >
            Back to contracts
          </Link>
        </div>

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
                  milestoneCount={contractData.milestones.length}
                />
              ) : null}
            </SafeBoundary>

            <SafeBoundary>
              {isLoading ? (
                <ContractProgressSkeleton />
              ) : contractData ? (
                /**
                 * getMilestonesForContract – extracts the milestones that belong
                 * to a resolved contract.
                 *
                 * ContractData already carries its own `milestones` array (populated
                 * by resolveContractData), so no extra repository call is needed.
                 * The helper is inlined here for readability but could be extracted to
                 * a shared utility if more pages need the same slice.
                 *
                 * Currency is intentionally NOT hardcoded; each Milestone already
                 * carries its own `currency` field that matches the contract.
                 *
                 * @param data - The fully resolved ContractData object.
                 * @returns The milestone array for that contract, or [] if absent.
                 */
                <ContractProgress milestones={contractData.milestones} />
              ) : null}
            </SafeBoundary>

            <SafeBoundary>
              {isLoading ? (
                <MilestonesListSkeleton />
              ) : contractData ? (
                <MilestonesList milestones={contractData.milestones} />
              ) : null}
            </SafeBoundary>
          </div>

          <div className="space-y-6">
            <ActionPanel
              status={status}
              onSubmitMilestone={handleSubmitMilestone}
              onReleaseFunds={handleReleaseFunds}
              onDispute={handleDispute}
              onViewSummary={handleViewSummary}
              isLoading={isLoading}
              errorMessage={errorMessage || undefined}
            />
          </div>
        </div>
      </div>
    </main>
  );
};

const ContractDetailPage = async ({ params }: ContractDetailPageProps) => {
  const { id } = await params;

  if (!isValidContractId(id)) {
    const { notFound } = await import('next/navigation');
    notFound();
  }

  return <ContractDetailPageContent id={id} />;
};

export default ContractDetailPage;
