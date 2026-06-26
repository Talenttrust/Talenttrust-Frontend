import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContractsPage from '../page';
import { STORAGE_KEY } from '@/lib/repository';

describe('ContractsPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  it('renders EmptyState when contracts array is empty', () => {
    render(<ContractsPage />);

    expect(screen.getByText('No contracts found')).toBeInTheDocument();
    expect(screen.getByText('You haven\'t created any contracts yet. Start by creating your first contract to begin freelancing securely.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Contract' })).toBeInTheDocument();
  });

  it('renders persisted contracts when storage already contains data', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        contracts: [
          {
            contractName: 'Existing Contract',
            parties: [],
            totalValue: 1000,
            currency: 'USD',
            status: 'Active',
            createdAt: 'Apr 20, 2026',
            milestoneCount: 1,
          },
        ],
        milestones: [],
      })
    );

    render(<ContractsPage />);

    expect(screen.getByText('Existing Contract')).toBeInTheDocument();
    expect(screen.getByText(/Active · Created Apr 20, 2026/)).toBeInTheDocument();
  });

  it('creates and persists a new contract from the empty state action', async () => {
    const user = userEvent.setup();
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);

    render(<ContractsPage />);

    await user.click(screen.getByRole('button', { name: 'Create Contract' }));

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    expect(stored.contracts).toHaveLength(1);
    expect(stored.contracts[0].contractName).toBe('Contract 1700000000000');
    expect(screen.getByText('Contract 1700000000000')).toBeInTheDocument();
  });
});