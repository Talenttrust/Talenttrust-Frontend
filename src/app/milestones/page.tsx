'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import EmptyState from '../../components/EmptyState';
import MilestonesList from '../../components/MilestonesList';
import MilestoneFilter, { type MilestoneStatusFilter } from '../../components/milestones/MilestoneFilter';
import { MilestoneCreationForm } from '../../components/milestones/MilestoneCreationForm';
import { listMilestones, saveMilestone } from '@/lib/repository';
import type { Milestone } from '@/types/domain';

/**
 * Sample milestones shown when the user has not yet created any of their own.
 * Acts as a demo / onboarding scaffold; replaced by real persisted data once
 * the first milestone is saved via `saveMilestone`.
 */
const SAMPLE_MILESTONES: Milestone[] = [
  {
    id: '1',
    title: 'Project Kickoff & Discovery',
    status: 'Completed',
    payout: 2500,
    currency: 'USD',
    dueDate: '2026-03-15',
  },
  {
    id: '2',
    title: 'UI/UX Design Handoff',
    status: 'Paid',
    payout: 3500,
    currency: 'USD',
    dueDate: '2026-04-01',
  },
  {
    id: '3',
    title: 'Frontend Development – Sprint 1',
    status: 'Pending',
    payout: 5000,
    currency: 'USD',
    dueDate: '2026-05-01',
  },
  {
    id: '4',
    title: 'API Integration & Testing',
    status: 'Pending',
    payout: 4000,
    currency: 'USD',
    dueDate: '2026-05-15',
  },
  {
    id: '5',
    title: 'Payment Gateway Integration',
    status: 'Disputed',
    payout: 3000,
    currency: 'USD',
    dueDate: '2026-04-20',
  },
];

/**
 * Reads persisted milestones from the repository after the client mounts.
 *
 * Deferring the `localStorage` read to client-side avoids hydration mismatches
 * during Next.js server prerendering. When no milestones have been saved yet,
 * falls back to `SAMPLE_MILESTONES` so the demo experience remains intact.
 */
function loadMilestonesFromRepository(): Milestone[] {
  const persisted = listMilestones();
  return persisted.length > 0 ? persisted : SAMPLE_MILESTONES;
}

const MilestonesPage: React.FC = () => {
  const [milestones, setMilestones] = useState<Milestone[]>(SAMPLE_MILESTONES);
  const searchParams = useSearchParams();
  const router = useRouter();
  const validStatuses: MilestoneStatusFilter[] = ['All','Pending','Completed','Paid','Disputed'];
  const getInitialStatus = (): MilestoneStatusFilter => {
    const param = searchParams.get('status');
    return param && validStatuses.includes(param as MilestoneStatusFilter) ? (param as MilestoneStatusFilter) : 'All';
  };
  const [statusFilter, setStatusFilter] = useState<MilestoneStatusFilter>(getInitialStatus());
  const [showForm, setShowForm] = useState(false);

  // Sync filter to URL without adding history entries
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('status', statusFilter);
    router.replace(`?${params.toString()}`);
  }, [statusFilter, router, searchParams]);

  // Rehydrate from localStorage after the client mounts to avoid SSR mismatches.
  useEffect(() => {
    setMilestones(loadMilestonesFromRepository());
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === 'All') return milestones;
    return milestones.filter((m) => m.status === statusFilter);
  }, [milestones, statusFilter]);

  /**
   * Opens the milestone creation modal.
   */
  const handleAddMilestone = useCallback(() => {
    setShowForm(true);
  }, []);

  /**
   * Persists the new milestone, refreshes state from the repository, then
   * closes the form.
   */
  const handleSubmitMilestone = useCallback((milestone: Milestone) => {
    saveMilestone(milestone);
    // Re-read from storage so the list reflects the persisted state exactly.
    setMilestones(listMilestones());
    setShowForm(false);
  }, []);

  /**
   * Closes the milestone creation modal without saving.
   */
  const handleCancelForm = useCallback(() => {
    setShowForm(false);
  }, []);

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-6">Milestones</h1>

      {milestones.length === 0 ? (
        <EmptyState
          illustration="milestones"
          title="No milestones tracked"
          description="Track your progress by adding milestones to your contracts. Milestones help you stay organized and ensure timely delivery."
          actionLabel="Add Milestone"
          onAction={handleAddMilestone}
        />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-4">
            <MilestoneFilter
              selected={statusFilter}
              onChange={setStatusFilter}
              resultCount={filtered.length}
            />
            <button
              type="button"
              onClick={handleAddMilestone}
              className="flex-shrink-0 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
            >
              Add Milestone
            </button>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              illustration="milestones"
              title="No milestones match this filter"
              description={`There are no ${statusFilter.toLowerCase()} milestones at the moment. Try a different filter or add a new milestone.`}
              actionLabel="Add Milestone"
              onAction={handleAddMilestone}
            />
          ) : (
            <MilestonesList milestones={filtered} />
          )}
        </>
      )}

      {showForm && (
        <MilestoneCreationForm
          onSubmit={handleSubmitMilestone}
          onCancel={handleCancelForm}
        />
      )}
    </main>
  );
};

export default MilestonesPage;
