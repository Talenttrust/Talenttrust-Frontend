/**
 * contracts-skeleton-transition.test.tsx
 *
 * Coverage for the loading -> loaded transition on the contracts page
 * (issue: "Add a skeleton loading state to contracts"). ContractsSkeleton
 * already existed but wasn't wired into ContractsPage — the loading state
 * rendered a plain text box instead, which caused a layout shift once the
 * full contract list replaced it. This covers the fix: ContractsSkeleton is
 * now rendered while `fetchState.status === 'loading'`, and swapped for the
 * real content once loading resolves.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContractsPage from '../page';
import * as repository from '@/lib/repository';
import type { Contract } from '@/types/domain';

jest.mock('@/lib/exportContracts', () => ({
  downloadContractsCsv: jest.fn(),
  downloadContractsJson: jest.fn(),
}));

jest.mock('@/components/toast/toast-provider', () => ({
  useToast: () => ({
    showSuccess: jest.fn(),
    showError: jest.fn(),
    toasts: [],
    dismissToast: jest.fn(),
  }),
}));

function makeContract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-1',
    contractName: 'Website redesign',
    parties: [],
    totalValue: 2500,
    currency: 'USD',
    status: 'Active',
    createdAt: '2026-07-20',
    milestoneCount: 0,
    ...overrides,
  };
}

describe('contracts skeleton — loading -> loaded transition', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the skeleton (not the plain text box) while a retry is in flight', async () => {
    jest
      .spyOn(repository, 'listContracts')
      .mockImplementationOnce(() => {
        throw new Error('Storage error');
      })
      .mockImplementationOnce(() => []);
    render(<ContractsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading contracts' }));

    expect(screen.getByRole('status', { name: 'Loading contracts' })).toBeInTheDocument();
    expect(screen.getByTestId('contracts-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('Loading contracts…')).not.toBeInTheDocument();

    // Let the pending retry microtask settle so it doesn't leak a state
    // update into the next test outside of act().
    await waitFor(() => {
      expect(screen.queryByTestId('contracts-skeleton')).not.toBeInTheDocument();
    });
  });

  it('swaps the skeleton for the real contract list once loading resolves', async () => {
    jest
      .spyOn(repository, 'listContracts')
      .mockImplementationOnce(() => {
        throw new Error('Storage error');
      })
      .mockImplementationOnce(() => [makeContract()]);
    render(<ContractsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry loading contracts' }));
    expect(screen.getByTestId('contracts-skeleton')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Website redesign')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('contracts-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading contracts' })).not.toBeInTheDocument();
  });

  it('does not render the skeleton in the steady success state', () => {
    jest.spyOn(repository, 'listContracts').mockReturnValue([makeContract()]);
    render(<ContractsPage />);

    expect(screen.queryByTestId('contracts-skeleton')).not.toBeInTheDocument();
  });

  it('does not render the skeleton in the error state (shows the alert instead)', () => {
    jest.spyOn(repository, 'listContracts').mockImplementation(() => {
      throw new Error('Storage error');
    });
    render(<ContractsPage />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByTestId('contracts-skeleton')).not.toBeInTheDocument();
  });

  it('skeleton mirrors the loaded layout (heading, create-button, and card-row placeholders)', async () => {
    jest
      .spyOn(repository, 'listContracts')
      .mockImplementationOnce(() => {
        throw new Error('Storage error');
      })
      .mockImplementationOnce(() => []);
    render(<ContractsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading contracts' }));

    const skeleton = screen.getByTestId('contracts-skeleton');
    expect(skeleton.querySelector('ul[aria-label="Loading contract list"]')).toBeInTheDocument();
    expect(skeleton.querySelectorAll('ul[aria-label="Loading contract list"] > li').length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(screen.queryByTestId('contracts-skeleton')).not.toBeInTheDocument();
    });
  });
});
