'use client';

import React, { useState, useMemo, useCallback } from 'react';
import EmptyState from '../../components/EmptyState';
import MilestoneFilter, { MilestoneStatusFilter } from '@/components/milestones/MilestoneFilter';
import MilestonesList from '@/components/MilestonesList';
import { listMilestones, saveMilestone } from '@/lib/repository';
import type { Milestone } from '@/types/domain';

const MilestonesPage: React.FC = () => {
  // Initialise from localStorage on first render; saves trigger a state
  // update so the list reflects newly added items immediately without refresh.
  const [milestones, setMilestones] = useState<Milestone[]>(() => listMilestones());
  const [statusFilter, setStatusFilter] = useState<MilestoneStatusFilter>('All');

  /** Derived list — filters the persisted array by the active status chip. */
  const filtered = useMemo<Milestone[]>(() => {
    if (statusFilter === 'All') return milestones;
    return milestones.filter((m) => m.status === statusFilter);
  }, [milestones, statusFilter]);

  /**
   * Placeholder handler — wire up a form/modal here to collect milestone
   * details, then call `saveMilestone` and refresh local state.
   *
   * Example (once a form is implemented):
   *   const newMilestone = collectMilestoneFromForm();
   *   saveMilestone(newMilestone);
   *   setMilestones(listMilestones());
   */
  const handleAddMilestone = useCallback(() => {
    // TODO: open a creation form/modal; replace stub data with real input.
    const stub: Milestone = {
      id: `ms-${Date.now()}`,
      title: `New Milestone ${Date.now()}`,
      status: 'Pending',
      payout: 0,
      currency: 'USD',
      dueDate: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
    };

    saveMilestone(stub);
    // Re-read storage so the component reflects the persisted state.
    setMilestones(listMilestones());
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
