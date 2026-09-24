import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContractCreationForm } from '@/components/ContractCreationForm';
import {
  CONTRACT_DRAFT_STORAGE_KEY,
  loadContractDraft,
  saveContractDraft,
} from '@/lib/contractDraft';
import { safeStorage } from '@/lib/safeStorage';

// Real Stellar keys: the form runs isValidStellarAddress, which verifies the
// StrKey CRC16-XModem checksum, so hand-made strings are rejected on submit.
// These are the same keys the repo's other suites use.
const WALLET_A = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const WALLET_B = 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H';

const draft = {
  contractName: 'Half-typed contract',
  parties: [
    { label: 'Client', address: WALLET_A },
    { label: 'Freelancer', address: '' },
  ],
  totalValue: '4200',
  currency: 'USD',
};

function renderForm(props: Partial<React.ComponentProps<typeof ContractCreationForm>> = {}) {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();
  const utils = render(
    <ContractCreationForm onSubmit={onSubmit} onCancel={onCancel} identity={WALLET_A} {...props} />,
  );
  return { ...utils, onSubmit, onCancel };
}

beforeEach(() => {
  window.localStorage.clear();
  safeStorage.resetCache();
  jest.restoreAllMocks();
});

describe('ContractCreationForm draft persistence', () => {
  it('restores this wallet\'s draft on mount and announces it', async () => {
    saveContractDraft(WALLET_A, draft);

    renderForm();

    await waitFor(() => {
      expect(screen.getByLabelText(/contract name/i)).toHaveValue('Half-typed contract');
    });
    expect(screen.getByLabelText(/total value/i)).toHaveValue('4200');
    // Announced through a live region: restoring without saying so would look
    // like the form came pre-filled by itself.
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent(/draft restored/i);
  });

  it('offers "Discard draft" and clears both the form and the stored envelope', async () => {
    const user = userEvent.setup();
    saveContractDraft(WALLET_A, draft);
    renderForm();

    const discard = await screen.findByRole('button', { name: /discard draft/i });
    await user.click(discard);

    expect(screen.getByLabelText(/contract name/i)).toHaveValue('');
    expect(window.localStorage.getItem(CONTRACT_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('starts clean when there is no stored draft', async () => {
    renderForm();

    expect(screen.getByLabelText(/contract name/i)).toHaveValue('');
    expect(screen.queryByText(/draft restored/i)).not.toBeInTheDocument();
  });

  it('persists typing as the draft for this wallet', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/contract name/i), 'New escrow');

    await waitFor(() => {
      const stored = loadContractDraft(WALLET_A);
      expect(stored.status).toBe('restored');
      if (stored.status === 'restored') {
        expect(stored.draft.contractName).toBe('New escrow');
      }
    });
  });

  it('clears the draft after a successful submission', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText(/contract name/i), 'Submittable');
    await user.type(screen.getByLabelText(/total value/i), '100');

    // Party rows are addressed by placeholder, the same idiom the existing
    // form suite uses (both rows share the same label text).
    const partyLabels = screen.getAllByPlaceholderText(/e\.g\., client, freelancer/i);
    const partyAddresses = screen.getAllByPlaceholderText(/GXXXXXXXXXX/i);
    await user.type(partyLabels[0], 'Client');
    await user.type(partyAddresses[0], WALLET_A);
    await user.type(partyLabels[1], 'Freelancer');
    await user.type(partyAddresses[1], WALLET_B);

    await user.click(screen.getByRole('button', { name: /create contract/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(window.localStorage.getItem(CONTRACT_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('drops another wallet\'s draft and says so instead of showing it', async () => {
    saveContractDraft(WALLET_B, draft);

    renderForm({ identity: WALLET_A });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/different wallet/i);
    });
    expect(screen.getByLabelText(/contract name/i)).toHaveValue('');
    // The other wallet's data is gone, not merely hidden.
    expect(window.localStorage.getItem(CONTRACT_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('resets when the wallet switches while the form is open', async () => {
    saveContractDraft(WALLET_A, draft);
    const { rerender } = renderForm();

    await waitFor(() => expect(screen.getByLabelText(/contract name/i)).toHaveValue('Half-typed contract'));

    rerender(
      <ContractCreationForm onSubmit={jest.fn()} onCancel={jest.fn()} identity={WALLET_B} />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/contract name/i)).toHaveValue('');
    });
  });

  it('never stores a draft for an anonymous session', async () => {
    const user = userEvent.setup();
    renderForm({ identity: null });

    await user.type(screen.getByLabelText(/contract name/i), 'Anonymous typing');

    // Give the save effect its chance to run before asserting nothing landed.
    await waitFor(() => {
      expect(screen.getByLabelText(/contract name/i)).toHaveValue('Anonymous typing');
    });
    expect(window.localStorage.getItem(CONTRACT_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('tells the user when the draft could not be saved', async () => {
    const user = userEvent.setup();
    renderForm();

    // Quota failure: the write is refused from the first keystroke.
    jest.spyOn(safeStorage, 'setItem').mockReturnValue(false);

    await user.type(screen.getByLabelText(/contract name/i), 'Risky draft');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/could not be saved/i);
    });
  });

  it('keeps the restored notice accessible and non-blocking', async () => {
    saveContractDraft(WALLET_A, draft);
    renderForm();

    const notice = await screen.findByRole('status');
    // A live region, not a modal: it must not steal focus from the first field.
    expect(notice).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByLabelText(/contract name/i)).toHaveFocus();
  });
});
