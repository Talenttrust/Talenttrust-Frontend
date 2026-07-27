import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WalletItemList } from '@/components/wallet/WalletItemList';
import type { WalletItem } from '@/types/domain';

const SAMPLE: WalletItem[] = [
  {
    id: 'w-1',
    name: 'Primary',
    address: '0x1111111111111111111111111111111111111111',
    type: 'EOA',
    balance: 1000,
    currency: 'ETH',
    status: 'Active',
    createdAt: '2024-01-01',
  },
];

describe('WalletItemList inline edit', () => {
  it('allows editing a row and saving changes', async () => {
    const onUpdate = jest.fn();
    const user = userEvent.setup();

    render(
      <WalletItemList
        items={SAMPLE}
        selectedIds={new Set()}
        onToggleSelect={() => {}}
        onToggleSelectAll={() => {}}
        onUpdateItem={onUpdate}
      />
    );

    const editBtn = screen.getByTestId('edit-w-1');
    await user.click(editBtn);

    const nameInput = screen.getByTestId('edit-name-w-1') as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, 'Primary Renamed');

    const saveBtn = screen.getByTestId('save-w-1');
    await user.click(saveBtn);

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'w-1', name: 'Primary Renamed' }));

    // announcer should reflect saved state
    expect(screen.getByTestId('wallet-live-announcer').textContent).toContain('Changes saved');
  });

  it('pressing Escape cancels edit', async () => {
    const onUpdate = jest.fn();
    const user = userEvent.setup();

    render(
      <WalletItemList
        items={SAMPLE}
        selectedIds={new Set()}
        onToggleSelect={() => {}}
        onToggleSelectAll={() => {}}
        onUpdateItem={onUpdate}
      />
    );

    await user.click(screen.getByTestId('edit-w-1'));
    // press escape while focused in the row
    const nameInput = screen.getByTestId('edit-name-w-1');
    nameInput.focus();
    await user.keyboard('{Escape}');

    // the edit inputs should be gone and original name present
    expect(screen.queryByTestId('edit-name-w-1')).toBeNull();
    expect(screen.getByTestId('wallet-live-announcer').textContent).toContain('Edit cancelled');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('blocks save on invalid address and announces error', async () => {
    const onUpdate = jest.fn();
    const user = userEvent.setup();

    render(
      <WalletItemList
        items={SAMPLE}
        selectedIds={new Set()}
        onToggleSelect={() => {}}
        onToggleSelectAll={() => {}}
        onUpdateItem={onUpdate}
      />
    );

    await user.click(screen.getByTestId('edit-w-1'));
    const addrInput = screen.getByTestId('edit-address-w-1') as HTMLInputElement;
    await user.clear(addrInput);
    await user.type(addrInput, 'bad-address');

    await user.click(screen.getByTestId('save-w-1'));

    // validation error shown
    expect(await screen.findByTestId('validation-error-w-1')).toHaveTextContent('Address must be a valid 0x... address');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByTestId('wallet-live-announcer').textContent).toContain('Save failed');
  });
});
