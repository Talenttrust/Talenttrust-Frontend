'use client';

import React, { useEffect, useMemo, useState } from 'react';
import EmptyState from '../../components/EmptyState';
import MilestonesList from '../../components/MilestonesList';
import MilestoneFilter, { type MilestoneStatusFilter } from '../../components/milestones/MilestoneFilter';
import { listMilestones } from '@/lib/repository';
import type { Milestone } from '@/types/domain';

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
 * Loads milestones from the persisted repository after the client mounts.
 *
 * Reading `localStorage` only on the client avoids hydration mismatches during
 * Next.js prerendering. When no milestones have been saved yet, the page keeps
 * the existing sample-data experience as a fallback.
 *
 * @returns Persisted milestones when available, otherwise `SAMPLE_MILESTONES`.
 */
function loadMilestonesFromRepository(): Milestone[] {
  const persistedMilestones = listMilestones();

  return persistedMilestones.length > 0 ? persistedMilestones : SAMPLE_MILESTONES;
}

const MilestonesPage: React.FC = () => {
  const [milestones, setMilestones] = useState<Milestone[]>(SAMPLE_MILESTONES);
  const [statusFilter, setStatusFilter] = useState<MilestoneStatusFilter>('All');

  useEffect(() => {
    setMilestones(loadMilestonesFromRepository());
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === 'All') return milestones;
    return milestones.filter((milestone) => milestone.status === statusFilter);
  }, [milestones, statusFilter]);

  const handleAddMilestone = () => {
    console.log('Add milestone');
  };

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
          <MilestoneFilter
            selected={statusFilter}
            onChange={setStatusFilter}
            resultCount={filtered.length}
          />
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
    </main>
  );
};

export default MilestonesPage;
