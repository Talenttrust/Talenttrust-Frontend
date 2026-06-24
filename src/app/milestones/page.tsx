'use client';

import React, { useState, useMemo } from 'react';
import EmptyState from '../../components/EmptyState';
import type { Milestone } from '@/types/domain';

const MilestonesPage: React.FC = () => {
  const milestones: Milestone[] = [];

  const handleAddMilestone = () => {
    // TODO: Implement add milestone logic
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
