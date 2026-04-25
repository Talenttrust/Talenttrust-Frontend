'use client';

import Link from 'next/link';
import ContractSummary from '@/components/ContractSummary';
import MilestonesList, { Milestone } from '@/components/MilestonesList';
import ActionPanel from '@/components/ActionPanel';

const sampleMilestones: Milestone[] = [
  {
    id: 'ms-1',
    title: 'Kickoff and scope approval',
    status: 'Completed',
    payout: 1500,
    currency: 'USD',
    dueDate: '2026-05-04',
  },
  {
    id: 'ms-2',
    title: 'Design and review',
    status: 'Pending',
    payout: 2500,
    currency: 'USD',
    dueDate: '2026-06-01',
  },
  {
    id: 'ms-3',
    title: 'Final delivery',
    status: 'Pending',
    payout: 3000,
    currency: 'USD',
    dueDate: '2026-07-12',
  },
];

const ContractDetailPage = ({ params }: { params: { id: string } }) => {
  const status = 'Active' as const;

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

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm text-slate-500">Contract details</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Contract #{params.id}</h1>
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
            <ContractSummary
              contractName="Stellar Escrow Implementation"
              parties={[
                { label: 'Client', address: 'GABC1234DEF5678HIJK9012LMNO3456PQRS7890' },
                { label: 'Freelancer', address: 'GXYZ9876STU5432VWXQ1098ABCD7654EFGH3210' },
              ]}
              totalValue={7000}
              currency="USD"
              status={status}
              createdAt="Apr 20, 2026"
              milestoneCount={sampleMilestones.length}
            />

            <MilestonesList milestones={sampleMilestones} />
          </div>

          <div className="space-y-6">
            <ActionPanel
              status={status}
              onSubmitMilestone={handleSubmitMilestone}
              onReleaseFunds={handleReleaseFunds}
              onDispute={handleDispute}
              onViewSummary={handleViewSummary}
            />
          </div>
        </div>
      </div>
    </main>
  );
};

export default ContractDetailPage;
