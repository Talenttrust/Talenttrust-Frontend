import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/toast/toast-provider';
import ContractDetailPage from '../page';
import * as contractResolver from '@/lib/contractResolver';
import { upsertContract } from '@/lib/repository';
import { useWallet } from '@/contexts/WalletContext';

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

jest.mock('@/lib/contractResolver');
jest.mock('@/lib/repository', () => ({
  upsertContract: jest.fn(),
}));

const mockedResolveContractData = jest.mocked(contractResolver.resolveContractData);
const mockedUpsertContract = jest.mocked(upsertContract);
const mockedUseWallet = useWallet as jest.MockedFunction<typeof useWallet>;

const contractData: contractResolver.ContractData = {
  id: '123',
  name: 'Stellar Escrow Implementation',
  status: 'Active',
  parties: [
    { label: 'Client', address: 'GABC1234DEF5678HIJK9012LMNO3456PQRS7890' },
    { label: 'Freelancer', address: 'GXYZ9876STU5432VWXQ1098ABCD7654EFGH3210' },
  ],
  totalValue: 7000,
  currency: 'USD',
  createdAt: 'Apr 20, 2026',
  milestones: [
    {
      id: 'ms-1',
      title: 'Kickoff and scope approval',
      status: 'Completed',
      payout: 1500,
      currency: 'USD',
      dueDate: '2026-05-04',
    },
    {
      id: 'ms-2',
      title: 'Design and review',
      status: 'Pending',
      payout: 2500,
      currency: 'USD',
      dueDate: '2026-06-01',
    },
    {
      id: 'ms-3',
      title: 'Final delivery',
      status: 'Pending',
      payout: 3000,
      currency: 'USD',
      dueDate: '2026-07-12',
    },
  ],
};

async function renderPage(id = '123') {
  const Component = await ContractDetailPage({ params: Promise.resolve({ id }) });
  return render(
    <ToastProvider>
      {Component}
    </ToastProvider>,
  );
}

function getContractSummarySection() {
  const contractHeading = screen.getByRole('heading', { name: contractData.name });
  const section = contractHeading.closest('section');

  if (!section) {
    throw new Error('Contract summary section was not found.');
  }

  return section;
}

describe('ContractDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolveContractData.mockResolvedValue(contractData);
    mockedUpsertContract.mockReturnValue(true);
    mockedUseWallet.mockReturnValue({
      address: '0x123',
      isConnecting: false,
      error: null,
      connect: jest.fn(),
      disconnect: jest.fn(),
    });
  });

  it('renders the resolved contract details and action panel', async () => {
    await renderPage();

    expect(await screen.findByText('Contract #123')).toBeInTheDocument();
    expect(screen.getByText('Milestones')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to contracts/i })).toHaveAttribute('href', '/contracts');
    expect(within(getContractSummarySection()).getByLabelText('Status: Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit milestone for approval/i })).toBeInTheDocument();
  });

  it('persists the confirmed release flow, updates UI state, and moves focus back to the panel', async () => {
    const user = userEvent.setup();

    await renderPage();

    const releaseButton = await screen.findByRole('button', {
      name: /release funds to the contractor/i,
    });

    await user.click(releaseButton);

    const dialog = screen.getByRole('dialog', { name: /confirm release funds/i });
    expect(within(dialog).getByRole('button', { name: /cancel/i })).toHaveFocus();

    await user.click(within(dialog).getByRole('button', { name: /^release funds$/i }));

    await waitFor(() => {
      expect(mockedUpsertContract).toHaveBeenCalledWith({
        contractName: contractData.name,
        parties: contractData.parties,
        totalValue: contractData.totalValue,
        currency: contractData.currency,
        status: 'Completed',
        createdAt: contractData.createdAt,
        milestoneCount: contractData.milestones.length,
      });
    });

    expect(within(getContractSummarySection()).getByLabelText('Status: Completed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view contract summary details/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /release funds to the contractor/i })).not.toBeInTheDocument();
    expect(await screen.findByText('Funds released')).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByRole('complementary', { name: /what would you like to do/i }),
      ).toHaveFocus();
    });
  });

  it('persists the confirmed dispute flow and reflects the disputed status in the page', async () => {
    const user = userEvent.setup();

    await renderPage();

    await user.click(await screen.findByRole('button', { name: /open a dispute for this contract/i }));
    await user.click(within(screen.getByRole('dialog', { name: /confirm dispute/i })).getByRole('button', { name: /^dispute$/i }));

    await waitFor(() => {
      expect(mockedUpsertContract).toHaveBeenCalledWith(
        expect.objectContaining({ contractName: contractData.name, status: 'Disputed' }),
      );
    });

    expect(within(getContractSummarySection()).getByLabelText('Status: Disputed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /release funds to the contractor/i })).not.toBeInTheDocument();
    expect(await screen.findByText('Dispute opened')).toBeInTheDocument();
  });

  it('keeps destructive actions disabled when the wallet is disconnected', async () => {
    const user = userEvent.setup();
    mockedUseWallet.mockReturnValue({
      address: null,
      isConnecting: false,
      error: null,
      connect: jest.fn(),
      disconnect: jest.fn(),
    });

    await renderPage();

    const releaseButton = await screen.findByRole('button', {
      name: /release funds to the contractor/i,
    });
    const disputeButton = screen.getByRole('button', {
      name: /open a dispute for this contract/i,
    });

    expect(screen.getByText(/connect wallet to perform this action/i)).toBeInTheDocument();
    expect(releaseButton).toBeDisabled();
    expect(disputeButton).toBeDisabled();

    await user.click(releaseButton);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockedUpsertContract).not.toHaveBeenCalled();
  });

  it('shows error feedback and preserves the current status when persistence fails', async () => {
    const user = userEvent.setup();
    mockedUpsertContract.mockReturnValue(false);

    await renderPage();

    await user.click(await screen.findByRole('button', { name: /release funds to the contractor/i }));
    await user.click(within(screen.getByRole('dialog', { name: /confirm release funds/i })).getByRole('button', { name: /^release funds$/i }));

    await waitFor(() => {
      expect(mockedUpsertContract).toHaveBeenCalledTimes(1);
    });

    expect(within(getContractSummarySection()).getByLabelText('Status: Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /release funds to the contractor/i })).toHaveFocus();
    expect(screen.getByText('Unable to update contract')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The contract status could not be persisted. Please try again.',
    );
  });

  it('returns focus to the destructive trigger when the confirmation dialog is cancelled', async () => {
    const user = userEvent.setup();

    await renderPage();

    const releaseButton = await screen.findByRole('button', {
      name: /release funds to the contractor/i,
    });

    await user.click(releaseButton);
    await user.click(
      within(screen.getByRole('dialog', { name: /confirm release funds/i })).getByRole('button', {
        name: /cancel/i,
      }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(releaseButton).toHaveFocus();
    expect(mockedUpsertContract).not.toHaveBeenCalled();
  });

  it.each([
    ['empty string', ''],
    ['path traversal', '../admin'],
    ['script tag', '<script>alert(1)</script>'],
    ['oversized', 'a'.repeat(65)],
    ['special chars', 'id#1!'],
  ])('calls notFound() for invalid id: %s', async (_label, id) => {
    await expect(ContractDetailPage({ params: Promise.resolve({ id }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });
});
