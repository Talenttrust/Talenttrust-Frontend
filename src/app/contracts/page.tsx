'use client';

import React, { useState, useCallback } from 'react';
import EmptyState from '../../components/EmptyState';
import { listContracts, saveContract } from '@/lib/repository';
import type { Contract } from '@/types/domain';

const ContractsPage: React.FC = () => {
  // Initialise from localStorage on first render; subsequent saves trigger
  // a state update so the list reflects newly added items immediately.
  const [contracts, setContracts] = useState<Contract[]>(() => listContracts());

  /**
   * Placeholder handler — wire up a form/modal here to collect contract
   * details, then call `saveContract` and refresh local state.
   *
   * Example (once a form is implemented):
   *   const newContract = collectContractFromForm();
   *   saveContract(newContract);
   *   setContracts(listContracts());
   */
  const handleCreateContract = useCallback(() => {
    // TODO: open a creation form/modal; replace stub data with real input.
    const stub: Contract = {
      contractName: `Contract ${Date.now()}`,
      parties: [
        { label: 'Client', address: '0x0000000000000000000000000000000000000001' },
        { label: 'Freelancer', address: '0x0000000000000000000000000000000000000002' },
      ],
      totalValue: 0,
      currency: 'USD',
      status: 'Pending',
      createdAt: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      milestoneCount: 0,
    };

    saveContract(stub);
    // Re-read storage so the component reflects the persisted state.
    setContracts(listContracts());
  }, []);

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
        // TODO: Replace with a proper ContractSummary list component.
        <ul className="space-y-4">
          {contracts.map((contract, idx) => (
            <li
              key={`${contract.contractName}-${idx}`}
              className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="font-semibold text-slate-900">{contract.contractName}</p>
              <p className="text-sm text-slate-500">
                {contract.status} · Created {contract.createdAt}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};

export default ContractsPage;
