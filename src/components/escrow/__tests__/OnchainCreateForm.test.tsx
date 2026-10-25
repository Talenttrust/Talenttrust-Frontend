import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const WALLET = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const FREELANCER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV';

const m = vi.hoisted(() => ({
  getWalletAddress: vi.fn(),
  getWalletNetworkDetails: vi.fn(),
  buildCreateContractTx: vi.fn(),
  simulateSignSubmit: vi.fn(),
}));

vi.mock('@/lib/stellar/createContract/freighter', () => ({
  getWalletAddress: m.getWalletAddress,
  getWalletNetworkDetails: m.getWalletNetworkDetails,
}));
vi.mock('@/lib/stellar/createContract/escrow', () => ({
  TESTNET_PASSPHRASE: 'Test SDF Network ; September 2015',
  XLM_SAC_ID: 'CXLMSAC',
  buildCreateContractTx: m.buildCreateContractTx,
}));
vi.mock('@/lib/stellar/createContract/submit', () => ({ simulateSignSubmit: m.simulateSignSubmit }));

import { OnchainCreateForm } from '../OnchainCreateForm';

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.getWalletAddress.mockResolvedValue({ address: WALLET });
  m.getWalletNetworkDetails.mockResolvedValue({ network: 'TESTNET', networkPassphrase: 'Test SDF Network ; September 2015' });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OnchainCreateForm', () => {
  it('builds create_contract with stroop amounts and shows the new escrow id', async () => {
    m.buildCreateContractTx.mockResolvedValue({ tx: true });
    m.simulateSignSubmit.mockResolvedValue({ hash: 'abc123', returnValue: 42n });
    const user = userEvent.setup();
    render(<OnchainCreateForm />);

    await waitFor(() => expect(screen.getByLabelText('Client address (your wallet)')).toHaveValue(WALLET));
    await user.type(screen.getByLabelText('Freelancer address'), FREELANCER);
    await user.click(screen.getByRole('button', { name: 'Create on-chain escrow' }));

    expect(await screen.findByText(/On-chain escrow #42 created!/)).toBeInTheDocument();
    expect(m.buildCreateContractTx).toHaveBeenCalledWith({
      client: WALLET,
      freelancer: FREELANCER,
      token: 'CXLMSAC',
      amounts: [1_000_000_000n, 2_000_000_000n],
    });
    expect(screen.getByRole('link', { name: /View transaction/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/tx/abc123'),
    );
  });

  it('blocks signing when the wallet is on the wrong network', async () => {
    m.getWalletNetworkDetails.mockResolvedValue({ network: 'PUBLIC', networkPassphrase: 'Public Global Stellar Network ; September 2015' });
    render(<OnchainCreateForm />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong network');
    expect(screen.getByRole('button', { name: 'Create on-chain escrow' })).toBeDisabled();
  });

  it('shows the submit error and does not report success', async () => {
    m.buildCreateContractTx.mockResolvedValue({ tx: true });
    m.simulateSignSubmit.mockRejectedValue(new Error('Transaction cancelled by user.'));
    const user = userEvent.setup();
    render(<OnchainCreateForm />);

    await waitFor(() => expect(screen.getByLabelText('Client address (your wallet)')).toHaveValue(WALLET));
    await user.type(screen.getByLabelText('Freelancer address'), FREELANCER);
    await user.click(screen.getByRole('button', { name: 'Create on-chain escrow' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Transaction cancelled by user.');
    expect(screen.queryByText(/created!/)).not.toBeInTheDocument();
  });
});
