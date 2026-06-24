'use client';

import React, { useState, useMemo } from 'react';
import EmptyState from '../../components/EmptyState';
import MilestonesList from '../../components/MilestonesList';
import MilestoneFilter, { type MilestoneStatusFilter } from '../../components/milestones/MilestoneFilter';
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

const MilestonesPage: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<MilestoneStatusFilter>('All');

  const filtered = useMemo(() => {
    if (statusFilter === 'All') return SAMPLE_MILESTONES;
    return SAMPLE_MILESTONES.filter((m) => m.status === statusFilter);
  }, [statusFilter]);

  const handleAddMilestone = () => {
    console.log('Add milestone');
  };

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-6">Milestones</h1>

      {SAMPLE_MILESTONES.length === 0 ? (
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
