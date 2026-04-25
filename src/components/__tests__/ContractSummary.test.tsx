import React from 'react';
import { render, screen } from '@testing-library/react';
import ContractSummary from '../ContractSummary';

describe('ContractSummary', () => {
  it('renders the summary card with truncated party addresses', () => {
    render(
      <ContractSummary
        contractName="Escrow Contract"
        parties={[
          { label: 'Client', address: 'GABC1234DEF5678HIJK9012LMNO3456PQRS7890' },
          { label: 'Freelancer', address: 'GXYZ9876STU5432VWXQ1098ABCD7654EFGH3210' },
        ]}
        totalValue={1200}
        currency="USD"
        status="Active"
        createdAt="May 1, 2026"
        milestoneCount={2}
      />
    );

    expect(screen.getByText('Escrow Contract')).toBeInTheDocument();
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Freelancer')).toBeInTheDocument();
    expect(screen.getByText(/GABC12...7890/)).toBeInTheDocument();
    expect(screen.getByText(/GXYZ98...3210/)).toBeInTheDocument();
    expect(screen.getByText('$1,200.00')).toBeInTheDocument();
  });
});
