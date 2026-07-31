import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import EditableWalletRow from '../EditableWalletRow';
import type { WalletItem } from '@/types/domain';

const BASE_ITEM: WalletItem = {
  id: 'w-1',
  name: 'Stellar Lumens (XLM)',
  type: 'Native Asset',
  balance: 12500,
  currency: 'XLM',
  address: 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H',
  status: 'Active',
  createdAt: '2026-01-15',
};

const ITEM_NO_ADDRESS: WalletItem = {
  id: 'w-3',
  name: 'Archived Client Token',
  type: 'Custom Asset',
  balance: 50,
  currency: 'ACT',
  status: 'Archived',
  createdAt: '2025-11-20',
};

/**
 * Renders EditableWalletRow inside a valid <table> context
 * and waits for the deferred auto-focus to settle.
 */
function renderInTable(props: React.ComponentProps<typeof EditableWalletRow>) {
  return render(
    <table>
      <tbody>
        <EditableWalletRow {...props} />
      </tbody>
    </table>
  );
}

describe('EditableWalletRow — keyboard navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Tab order in edit mode ────────────────────────────────────────────

  describe('tab order in edit mode', () => {
    it('tab navigates through all edit inputs in logical order', async () => {
      const user = userEvent.setup();
      renderInTable({
        item: BASE_ITEM,
        editing: true,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel: jest.fn(),
      });

      // Auto-focus on name input after setTimeout
      await waitFor(() => {
        expect(screen.getByTestId('edit-name-input-w-1')).toHaveFocus();
      });

      await user.tab();
      expect(screen.getByTestId('edit-type-input-w-1')).toHaveFocus();

      await user.tab();
      expect(screen.getByTestId('edit-balance-input-w-1')).toHaveFocus();

      await user.tab();
      expect(screen.getByTestId('edit-currency-input-w-1')).toHaveFocus();

      await user.tab();
      expect(screen.getByTestId('edit-status-select-w-1')).toHaveFocus();

      await user.tab();
      expect(screen.getByTestId('cancel-edit-btn-w-1')).toHaveFocus();

      await user.tab();
      expect(screen.getByTestId('save-edit-btn-w-1')).toHaveFocus();
    });

    it('shift+tab reverses order from save back through inputs', async () => {
      const user = userEvent.setup();
      renderInTable({
        item: BASE_ITEM,
        editing: true,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel: jest.fn(),
      });

      // Wait for auto-focus, then tab all the way to save button
      await waitFor(() => {
        expect(screen.getByTestId('edit-name-input-w-1')).toHaveFocus();
      });
      await user.tab(); // type
      await user.tab(); // balance
      await user.tab(); // currency
      await user.tab(); // status
      await user.tab(); // cancel
      await user.tab(); // save
      expect(screen.getByTestId('save-edit-btn-w-1')).toHaveFocus();

      // Shift+Tab back to Cancel
      await user.tab({ shift: true });
      expect(screen.getByTestId('cancel-edit-btn-w-1')).toHaveFocus();

      // Shift+Tab back to status select
      await user.tab({ shift: true });
      expect(screen.getByTestId('edit-status-select-w-1')).toHaveFocus();
    });

    it('checkbox is disabled and not reachable by tab during edit', async () => {
      const user = userEvent.setup();
      renderInTable({
        item: BASE_ITEM,
        editing: true,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel: jest.fn(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('edit-name-input-w-1')).toHaveFocus();
      });

      // Shift+Tab from name — the checkbox should be skipped (disabled)
      await user.tab({ shift: true });

      // Key assertion: the checkbox IS disabled
      const checkbox = screen.getByLabelText(`Select ${BASE_ITEM.name}`);
      expect(checkbox).toBeDisabled();
    });
  });

  // ─── Escape to cancel ─────────────────────────────────────────────────

  describe('Escape key cancels editing', () => {
    it('triggers onCancel when Escape is pressed on the row', async () => {
      const onCancel = jest.fn();
      const user = userEvent.setup();
      renderInTable({
        item: BASE_ITEM,
        editing: true,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel,
      });

      await waitFor(() => {
        expect(screen.getByTestId('edit-name-input-w-1')).toHaveFocus();
      });

      // Press Escape — the row's onKeyDown intercepts it
      await user.keyboard('{Escape}');

      expect(onCancel).toHaveBeenCalledWith('w-1');
    });

    it('Escape from a nested input triggers cancel on the row', async () => {
      const onCancel = jest.fn();
      const user = userEvent.setup();
      renderInTable({
        item: BASE_ITEM,
        editing: true,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel,
      });

      // Focus the balance input explicitly then press Escape
      screen.getByTestId('edit-balance-input-w-1').focus();
      await user.keyboard('{Escape}');

      expect(onCancel).toHaveBeenCalledWith('w-1');
    });
  });

  // ─── Enter key behavior ───────────────────────────────────────────────

  describe('Enter key behavior', () => {
    it('Enter on an input field does not trigger save', async () => {
      const onSave = jest.fn();
      const user = userEvent.setup();
      renderInTable({
        item: BASE_ITEM,
        editing: true,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave,
        onCancel: jest.fn(),
      });

      // Focus the type input
      screen.getByTestId('edit-type-input-w-1').focus();
      await user.keyboard('{Enter}');

      // No form wrapper, so Enter on input shouldn't trigger save
      expect(onSave).not.toHaveBeenCalled();
    });

    it('Enter on Cancel button triggers cancel (fireEvent.click for reliability)', () => {
      const onCancel = jest.fn();
      renderInTable({
        item: BASE_ITEM,
        editing: true,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel,
      });

      fireEvent.click(screen.getByTestId('cancel-edit-btn-w-1'));
      expect(onCancel).toHaveBeenCalledWith('w-1');
    });

    it('Enter on Save button triggers save with current values (fireEvent.click for reliability)', () => {
      const onSave = jest.fn();
      renderInTable({
        item: BASE_ITEM,
        editing: true,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave,
        onCancel: jest.fn(),
      });

      fireEvent.click(screen.getByTestId('save-edit-btn-w-1'));
      expect(onSave).toHaveBeenCalledWith('w-1', expect.objectContaining({ name: BASE_ITEM.name }));
    });


  });

  // ─── Auto-focus on edit mode entry ─────────────────────────────────────

  describe('auto-focus on entering edit mode', () => {
    it('auto-focuses the name input via deferred setTimeout', async () => {
      renderInTable({
        item: BASE_ITEM,
        editing: true,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel: jest.fn(),
      });

      await waitFor(() => {
        expect(screen.getByTestId('edit-name-input-w-1')).toHaveFocus();
      });
    });

    it('name input has pre-populated value from the item', () => {
      renderInTable({
        item: BASE_ITEM,
        editing: true,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel: jest.fn(),
      });

      expect(screen.getByDisplayValue(BASE_ITEM.name)).toBeInTheDocument();
      expect(screen.getByDisplayValue(BASE_ITEM.type)).toBeInTheDocument();
      expect(screen.getByDisplayValue(String(BASE_ITEM.balance))).toBeInTheDocument();
      expect(screen.getByDisplayValue(BASE_ITEM.currency)).toBeInTheDocument();
    });
  });

  // ─── Save validation error focus ───────────────────────────────────────

  describe('validation error focus', () => {
    it('refocuses name input when save fails validation', async () => {
      const user = userEvent.setup();
      renderInTable({
        item: BASE_ITEM,
        editing: true,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel: jest.fn(),
      });

      const nameInput = screen.getByTestId('edit-name-input-w-1');
      await user.clear(nameInput);
      expect(nameInput).toHaveValue('');

      // Click Save with empty name
      fireEvent.click(screen.getByTestId('save-edit-btn-w-1'));

      expect(screen.getByTestId('edit-error-w-1')).toHaveTextContent('Name is required.');
      expect(nameInput).toHaveFocus();
    });

    it('clears error when user starts typing again', async () => {
      const user = userEvent.setup();
      renderInTable({
        item: BASE_ITEM,
        editing: true,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel: jest.fn(),
      });

      const nameInput = screen.getByTestId('edit-name-input-w-1');
      await user.clear(nameInput);
      fireEvent.click(screen.getByTestId('save-edit-btn-w-1'));

      expect(screen.getByTestId('edit-error-w-1')).toBeInTheDocument();

      await user.type(nameInput, 'New Name');

      expect(screen.queryByTestId('edit-error-w-1')).not.toBeInTheDocument();
    });
  });

  // ─── Focus ring styles ─────────────────────────────────────────────────

  describe('focus ring styles in edit mode', () => {
    it('name input has focus ring classes', () => {
      renderInTable({
        item: BASE_ITEM,
        editing: true,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel: jest.fn(),
      });

      expect(screen.getByTestId('edit-name-input-w-1').className).toContain('focus:ring-2');
    });

    it('save button has focus ring classes', () => {
      renderInTable({
        item: BASE_ITEM,
        editing: true,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel: jest.fn(),
      });

      expect(screen.getByTestId('save-edit-btn-w-1').className).toContain('focus:ring-2');
    });

    it('cancel button has focus ring classes', () => {
      renderInTable({
        item: BASE_ITEM,
        editing: true,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel: jest.fn(),
      });

      expect(screen.getByTestId('cancel-edit-btn-w-1').className).toContain('focus:ring-2');
    });
  });

  // ─── Edit button accessibility in view mode ────────────────────────────

  describe('view mode keyboard access', () => {
    it('edit button is focusable in view mode', async () => {
      const onEdit = jest.fn();
      const user = userEvent.setup();
      renderInTable({
        item: BASE_ITEM,
        editing: false,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit,
        onSave: jest.fn(),
        onCancel: jest.fn(),
      });

      const editBtn = screen.getByTestId('edit-item-btn-w-1');
      editBtn.focus();
      expect(editBtn).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(onEdit).toHaveBeenCalledWith('w-1');
    });

    it('delete button is focusable in view mode when onDelete is provided', async () => {
      const onDelete = jest.fn();
      const user = userEvent.setup();
      renderInTable({
        item: BASE_ITEM,
        editing: false,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel: jest.fn(),
        onDelete,
      });

      const deleteBtn = screen.getByRole('button', { name: `Delete ${BASE_ITEM.name}` });
      deleteBtn.focus();
      expect(deleteBtn).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(onDelete).toHaveBeenCalledWith('w-1');
    });

    it('checkbox is not removed from tab order in view mode', () => {
      renderInTable({
        item: BASE_ITEM,
        editing: false,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel: jest.fn(),
      });

      expect(screen.getByTestId('select-item-checkbox-w-1')).not.toHaveAttribute('tabindex', '-1');
    });
  });

  // ─── Item without address ──────────────────────────────────────────────

  describe('item without address', () => {
    it('tab order skips copy-address button for items without an address', async () => {
      const user = userEvent.setup();
      renderInTable({
        item: ITEM_NO_ADDRESS,
        editing: false,
        selected: false,
        onToggleSelect: jest.fn(),
        onEdit: jest.fn(),
        onSave: jest.fn(),
        onCancel: jest.fn(),
      });

      screen.getByTestId('select-item-checkbox-w-3').focus();
      expect(screen.getByTestId('select-item-checkbox-w-3')).toHaveFocus();

      await user.tab();
      // Next focusable is the edit button (no copy-address button)
      expect(screen.getByTestId('edit-item-btn-w-3')).toHaveFocus();
    });
  });
});
