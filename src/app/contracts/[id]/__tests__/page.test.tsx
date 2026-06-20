import React from 'react';
import { render, screen } from '@testing-library/react';
import { notFound } from 'next/navigation';
import ContractDetailPage from '../page';

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

jest.mock('../ContractDetailClient', () => {
  const MockContractDetailClient = ({ contractId }: { contractId: string }) => (
    <main>
      <h1>Contract #{contractId}</h1>
      <p>Contract Summary</p>
      <p>Milestones</p>
      <button type="button">Submit milestone</button>
    </main>
  );

  return MockContractDetailClient;
});

describe('ContractDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the contract overview and action panel for a validated id', () => {
    render(<ContractDetailPage params={{ id: 'contract_123-ABC' }} />);

    expect(screen.getByText('Contract #contract_123-ABC')).toBeInTheDocument();
    expect(screen.getByText('Contract Summary')).toBeInTheDocument();
    expect(screen.getByText('Milestones')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit milestone/i })).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it.each(['', '../contracts', '<script>', 'contract id', 'a'.repeat(65)])(
    'renders the not-found route for invalid contract id %p',
    (id) => {
      expect(() => ContractDetailPage({ params: { id } })).toThrow('NEXT_NOT_FOUND');

      expect(notFound).toHaveBeenCalledTimes(1);
    },
  );
});
