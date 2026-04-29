'use client';

import React from 'react';
import EmptyState from '../../components/EmptyState';

const ContractsPage: React.FC = () => {
  const contracts: any[] = []; // Assume empty for now

  const handleCreateContract = () => {
    // TODO: Implement create contract logic
    console.log('Create contract');
  };

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-6">Contracts</h1>
      {contracts.length === 0 ? (
        <EmptyState
          icon={<svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2h12v8H4V6z" clipRule="evenodd" /></svg>}
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