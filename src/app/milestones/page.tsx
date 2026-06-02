'use client';

import React from 'react';
import EmptyState from '../../components/EmptyState';

const MilestonesPage: React.FC = () => {
  const milestones: any[] = []; // Assume empty for now

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
        // TODO: Render milestones list
        <div>Milestones list</div>
      )}
    </main>
  );
};

export default MilestonesPage;
