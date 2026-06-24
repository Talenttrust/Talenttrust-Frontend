'use client';

import React from 'react';
import EmptyState from '../../components/EmptyState';
import type { Contract } from '@/types/domain';

const ContractsPage: React.FC = () => {
  const contracts: Contract[] = [];

  const handleCreateContract = () => {
    // TODO: Implement create contract logic
    console.log('Create contract');
  };

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-6">Contracts</h1>
      {contracts.length === 0 ? (
        <EmptyState
          illustration="contracts"
          title="No contracts found"
          description="You haven't created any contracts yet. Start by creating your first contract to begin freelancing securely."
          actionLabel="Create Contract"
          onAction={handleCreateContract}
        />
      ) : (
        // TODO: Render contracts list
        <div>Contracts list</div>
      )}
    </main>
  );
};

export default ContractsPage;
