import React from 'react';
import EmptyState from '../../components/EmptyState';
import type { Reputation } from '@/types/domain';

const ReputationPage: React.FC = () => {
  const reputation: Reputation[] = [];

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-6">Reputation</h1>
      {reputation.length === 0 ? (
        <EmptyState
          illustration="reputation"
          title="No reputation yet"
          description="Your reputation will be built as you complete contracts and receive feedback from clients. Start by creating and fulfilling your first contract."
        />
      ) : (
        <ReputationProfile {...profileProps} />
      )}
    </main>
  );
};

export default ReputationPage;
