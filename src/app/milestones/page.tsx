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
          icon={<svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>}
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