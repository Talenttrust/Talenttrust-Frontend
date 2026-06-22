'use client';

import React, { useMemo, useState } from 'react';
import EmptyState from '../../components/EmptyState';
import MilestonesList, { Milestone } from '../../components/MilestonesList';

type MilestoneStatusFilter = 'All' | 'Pending' | 'Completed' | 'Paid' | 'Disputed';

const MILESTONE_FILTERS: MilestoneStatusFilter[] = ['All', 'Pending', 'Completed', 'Paid', 'Disputed'];

const DEFAULT_MILESTONES: Milestone[] = [
  {
    id: 'scope-signoff',
    title: 'Scope sign-off',
    status: 'Completed',
    payout: 750,
    currency: 'USD',
    dueDate: 'May 10, 2026',
  },
  {
    id: 'wallet-integration',
    title: 'Wallet integration',
    status: 'Pending',
    payout: 1200,
    currency: 'USD',
    dueDate: 'Jun 1, 2026',
  },
  {
    id: 'escrow-release',
    title: 'Escrow release review',
    status: 'Paid',
    payout: 980,
    currency: 'USD',
    dueDate: 'Jun 14, 2026',
  },
  {
    id: 'identity-dispute',
    title: 'Identity dispute follow-up',
    status: 'Disputed',
    payout: 450,
    currency: 'USD',
    dueDate: 'Jun 22, 2026',
  },
];

function getResultsMessage(filter: MilestoneStatusFilter, count: number) {
  const plural = count === 1 ? 'milestone' : 'milestones';

  if (filter === 'All') {
    return `Showing ${count} ${plural}.`;
  }

  return `Showing ${count} ${filter.toLowerCase()} ${plural}.`;
}

export function MilestonesPageContent({
  milestones = DEFAULT_MILESTONES,
}: {
  milestones?: Milestone[];
}) {
  const [statusFilter, setStatusFilter] = useState<MilestoneStatusFilter>('All');
  const filteredMilestones = useMemo(
    () =>
      statusFilter === 'All'
        ? milestones
        : milestones.filter((milestone) => milestone.status === statusFilter),
    [statusFilter, milestones]
  );
  const resultsMessage = getResultsMessage(statusFilter, filteredMilestones.length);
  const hasMilestones = milestones.length > 0;
  const handleAddMilestone = () => undefined;

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Milestones</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Track escrow delivery points, payouts, due dates, and review status in one place.
            </p>
          </div>
          {hasMilestones ? (
            <p
              id="milestone-results-summary"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="text-sm font-medium text-slate-600"
            >
              {resultsMessage}
            </p>
          ) : null}
        </div>

        {hasMilestones ? (
          <fieldset
            className="mb-6"
            aria-describedby="milestone-results-summary"
          >
            <legend className="mb-3 text-sm font-semibold text-slate-800">Status filter</legend>
            <div className="flex flex-wrap gap-2">
              {MILESTONE_FILTERS.map((filter) => (
                <label key={filter} className="cursor-pointer">
                  <input
                    type="radio"
                    name="milestone-status-filter"
                    value={filter}
                    checked={statusFilter === filter}
                    onChange={() => setStatusFilter(filter)}
                    className="peer sr-only"
                  />
                  <span className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors peer-checked:border-blue-700 peer-checked:bg-blue-700 peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-4 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-900">
                    {filter}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {!hasMilestones ? (
          <EmptyState
            illustration="milestones"
            title="No milestones tracked"
            description="Track your progress by adding milestones to your contracts. Milestones help you stay organized and ensure timely delivery."
            actionLabel="Add Milestone"
            onAction={handleAddMilestone}
          />
        ) : filteredMilestones.length === 0 ? (
          <EmptyState
            illustration="milestones"
            title={`No ${statusFilter.toLowerCase()} milestones`}
            description="Choose another status to review matching milestones."
            actionLabel="Show all milestones"
            onAction={() => setStatusFilter('All')}
          />
        ) : (
          <MilestonesList milestones={filteredMilestones} />
        )}
      </div>
    </main>
  );
}
