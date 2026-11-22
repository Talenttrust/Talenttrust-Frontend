import { createRef } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DisputeDialog } from './DisputeDialog';
import type { EscrowContract } from '@/lib/api';

const { mockGetAddress } = vi.hoisted(() => ({
  mockGetAddress: vi.fn<() => Promise<string | null>>(),
}));

vi.mock('@/lib/stellar/freighter', () => ({
  getAddress: mockGetAddress,
}));

const CLIENT_ADDRESS = 'GCLIENTADDRESS1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';
const FREELANCER_ADDRESS = 'GFREELANCERADDR1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ12345';
const UNRELATED_ADDRESS = 'GUNRELATEDADDR1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456';

const sampleContract: EscrowContract = {
  id: 42,
  title: 'Design System Overhaul',
  client: CLIENT_ADDRESS,
  freelancer: FREELANCER_ADDRESS,
  token: 'USDC',
  milestones: [],
  totalAmount: 1000,
  fundedAmount: 1000,
  releasedAmount: 0,
  status: 'Funded',
  reputationIssued: false,
};

function renderDialog() {
  const triggerRef = createRef<HTMLButtonElement>();
  return render(
    <DisputeDialog
      contract={sampleContract}
      triggerRef={triggerRef}
      onClose={vi.fn()}
      onSuccess={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

describe('DisputeDialog', () => {
  const showModalMock = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  const closeMock = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });

  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = showModalMock;
    HTMLDialogElement.prototype.close = closeMock;
  });

  beforeEach(() => {
    mockGetAddress.mockReset();
    showModalMock.mockClear();
    closeMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the dialog and focuses the reason field', async () => {
    mockGetAddress.mockResolvedValue(null);

    renderDialog();

    expect(showModalMock).toHaveBeenCalledTimes(1);
    const reasonField = screen.getByLabelText('Reason');
    expect(reasonField).toHaveFocus();
    await waitFor(() => expect(mockGetAddress).toHaveBeenCalledTimes(1));
  });

  it('preselects client and shows wallet hint when connected wallet matches client', async () => {
    mockGetAddress.mockResolvedValue(CLIENT_ADDRESS);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByText('Detected from your wallet')).toBeInTheDocument();
    });
    expect(screen.getByRole('radio', { name: 'Client' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Freelancer' })).not.toBeChecked();
  });

  it('preselects freelancer and shows wallet hint when connected wallet matches freelancer', async () => {
    mockGetAddress.mockResolvedValue(FREELANCER_ADDRESS);

    renderDialog();

    await waitFor(() => {
      expect(screen.getByRole('radio', { name: 'Freelancer' })).toBeChecked();
    });
    expect(screen.getByRole('radio', { name: 'Client' })).not.toBeChecked();
    expect(screen.getByText('Detected from your wallet')).toBeInTheDocument();
  });

  it('keeps default role without hint when connected wallet is unrelated', async () => {
    mockGetAddress.mockResolvedValue(UNRELATED_ADDRESS);

    renderDialog();

    await waitFor(() => expect(mockGetAddress).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('radio', { name: 'Client' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Freelancer' })).not.toBeChecked();
    expect(screen.queryByText('Detected from your wallet')).not.toBeInTheDocument();
  });

  it('does not break the dialog when reading the wallet address rejects', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetAddress.mockRejectedValue(new Error('Freighter unavailable'));

    renderDialog();

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Could not read the connected wallet address.',
        expect.any(Error),
      );
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Client' })).toBeChecked();
    expect(screen.queryByText('Detected from your wallet')).not.toBeInTheDocument();
  });
});
