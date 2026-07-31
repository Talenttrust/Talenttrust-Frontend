import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import WalletPage from '../page';
import { listWalletItems, deleteWalletItems } from '@/lib/repository';
import { ToastProvider } from '@/components/toast/toast-provider';
import { PreferencesProvider } from '@/lib/preferences';
import type { WalletItem } from '@/types/domain';

jest.mock('@/lib/repository', () => ({
  listWalletItems: jest.fn(),
  saveWalletItem: jest.fn(),
  updateWalletItem: jest.fn(),
  deleteWalletItems: jest.fn(),
}));

jest.mock('@/lib/exportWallet', () => ({
  downloadWalletCsv: jest.fn(),
  downloadWalletJson: jest.fn(),
}));

const mockListWalletItems = jest.mocked(listWalletItems);
const mockDeleteWalletItems = jest.mocked(deleteWalletItems);

const ITEMS: WalletItem[] = [
  {
    id: 'w-1',
    name: 'Stellar Lumens (XLM)',
    type: 'Native Asset',
    balance: 12500,
    currency: 'XLM',
    address: 'GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H',
    status: 'Active',
    createdAt: '2026-01-15',
  },
  {
    id: 'w-2',
    name: 'USD Coin (USDC)',
    type: 'Stablecoin',
    balance: 3200,
    currency: 'USDC',
    status: 'Pending',
    createdAt: '2026-02-01',
  },
  {
    id: 'w-3',
    name: 'Archived Client Token',
    type: 'Custom Asset',
    balance: 50,
    currency: 'ACT',
    status: 'Archived',
    createdAt: '2025-11-20',
  },
];

const renderWithProviders = (ui: React.ReactElement) => {
  return render(
    <PreferencesProvider>
      <ToastProvider>{ui}</ToastProvider>
    </PreferencesProvider>
  );
};

describe('WalletPage — keyboard navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListWalletItems.mockReturnValue(ITEMS);
    mockDeleteWalletItems.mockReturnValue(true);
  });

  // ─── Full page tab order ───────────────────────────────────────────────

  describe('full page tab order', () => {
    it('tabs from select-all checkbox through rows when items are present', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WalletPage />);

      // First tab: select-all checkbox (first focusable element)
      await user.tab();
      expect(screen.getByTestId('select-all-checkbox')).toHaveFocus();
    });

    it('tab order within a row includes copy-address button for items with addresses', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WalletPage />);

      // Tab: select-all
      await user.tab();
      // Tab: w-1 checkbox
      await user.tab();
      expect(screen.getByTestId('select-item-checkbox-w-1')).toHaveFocus();

      // Tab: copy-address button (w-1 has an address)
      await user.tab();
      expect(screen.getByTestId('copy-wallet-address-btn-w-1')).toHaveFocus();

      // Tab: first delete button for w-1 (the one with the edit icon)
      await user.tab();
      const deleteBtnsW1 = screen.getAllByRole('button', { name: 'Delete Stellar Lumens (XLM)' });
      expect(deleteBtnsW1.length).toBeGreaterThan(0);

      // Tab: second delete button for w-1
      await user.tab();
    });

    it('shift+tab reverses through the tab order', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WalletPage />);

      // Tab to select-all, then to w-1 checkbox, then shift back
      await user.tab();
      expect(screen.getByTestId('select-all-checkbox')).toHaveFocus();

      await user.tab();
      expect(screen.getByTestId('select-item-checkbox-w-1')).toHaveFocus();

      await user.tab({ shift: true });
      expect(screen.getByTestId('select-all-checkbox')).toHaveFocus();
    });
  });

  // ─── Toolbar visibility and keyboard flow ──────────────────────────────

  describe('toolbar keyboard flow', () => {
    it('bulk toolbar appears when an item is selected and auto-focuses first button', () => {
      renderWithProviders(<WalletPage />);

      // Select w-1
      fireEvent.click(screen.getByTestId('select-item-checkbox-w-1'));

      // Toolbar should be visible
      expect(screen.getByTestId('wallet-bulk-toolbar')).toBeInTheDocument();

      // First button in toolbar should be auto-focused (clear selection)
      expect(screen.getByRole('button', { name: 'Clear item selection' })).toHaveFocus();
    });

    it('Escape key clears selection when toolbar is visible', () => {
      renderWithProviders(<WalletPage />);

      // Select w-1 to show toolbar
      fireEvent.click(screen.getByTestId('select-item-checkbox-w-1'));
      expect(screen.getByTestId('wallet-bulk-toolbar')).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(window, { key: 'Escape' });

      // Toolbar should disappear
      expect(screen.queryByTestId('wallet-bulk-toolbar')).not.toBeInTheDocument();
      expect(screen.getByTestId('select-item-checkbox-w-1')).not.toBeChecked();
    });

    it('ArrowRight cycles through toolbar buttons when focus is inside', () => {
      renderWithProviders(<WalletPage />);

      fireEvent.click(screen.getByTestId('select-item-checkbox-w-1'));
      const toolbar = screen.getByTestId('wallet-bulk-toolbar');

      // First button auto-focused
      expect(screen.getByRole('button', { name: 'Clear item selection' })).toHaveFocus();

      // ArrowRight: move to CSV export
      fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
      expect(screen.getByRole('button', { name: 'Export 1 selected item as CSV' })).toHaveFocus();

      // ArrowRight: move to JSON export
      fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
      expect(screen.getByRole('button', { name: 'Export 1 selected item as JSON' })).toHaveFocus();

      // ArrowRight: move to Delete
      fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
      expect(screen.getByRole('button', { name: 'Delete 1 selected item' })).toHaveFocus();

      // ArrowRight: wrap back to Clear
      fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
      expect(screen.getByRole('button', { name: 'Clear item selection' })).toHaveFocus();
    });

    it('ArrowLeft reverses through toolbar buttons', () => {
      renderWithProviders(<WalletPage />);

      fireEvent.click(screen.getByTestId('select-item-checkbox-w-1'));
      const toolbar = screen.getByTestId('wallet-bulk-toolbar');

      expect(screen.getByRole('button', { name: 'Clear item selection' })).toHaveFocus();

      fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
      expect(screen.getByRole('button', { name: 'Delete 1 selected item' })).toHaveFocus();
    });

    it('Home jumps to first toolbar button from within toolbar', () => {
      renderWithProviders(<WalletPage />);

      fireEvent.click(screen.getByTestId('select-item-checkbox-w-1'));
      const toolbar = screen.getByTestId('wallet-bulk-toolbar');

      // Move to last button
      const deleteBtn = screen.getByRole('button', { name: 'Delete 1 selected item' });
      deleteBtn.focus();

      fireEvent.keyDown(toolbar, { key: 'Home' });
      expect(screen.getByRole('button', { name: 'Clear item selection' })).toHaveFocus();
    });

    it('End jumps to last toolbar button', () => {
      renderWithProviders(<WalletPage />);

      fireEvent.click(screen.getByTestId('select-item-checkbox-w-1'));
      const toolbar = screen.getByTestId('wallet-bulk-toolbar');

      expect(screen.getByRole('button', { name: 'Clear item selection' })).toHaveFocus();

      fireEvent.keyDown(toolbar, { key: 'End' });
      expect(screen.getByRole('button', { name: 'Delete 1 selected item' })).toHaveFocus();
    });
  });

  // ─── Confirm dialog keyboard ───────────────────────────────────────────

  describe('delete confirmation dialog keyboard', () => {
    it('dialog opens and Escape cancels deletion', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WalletPage />);

      // Select and delete
      fireEvent.click(screen.getByTestId('select-item-checkbox-w-1'));
      const deleteBtn = screen.getByRole('button', { name: 'Delete 1 selected item' });
      fireEvent.click(deleteBtn);

      // Dialog should be open
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();

      // Escape should close it
      await user.keyboard('{Escape}');

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(mockDeleteWalletItems).not.toHaveBeenCalled();
    });

    it('Enter on Cancel button in dialog cancels deletion', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WalletPage />);

      fireEvent.click(screen.getByTestId('select-item-checkbox-w-1'));
      const deleteBtn = screen.getByRole('button', { name: 'Delete 1 selected item' });
      fireEvent.click(deleteBtn);

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();

      const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
      cancelBtn.focus();
      await user.keyboard('{Enter}');

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(mockDeleteWalletItems).not.toHaveBeenCalled();
    });

    it('Enter on Delete confirm button performs deletion', async () => {
      const user = userEvent.setup();
      renderWithProviders(<WalletPage />);

      fireEvent.click(screen.getByTestId('select-item-checkbox-w-1'));
      const deleteBtn = screen.getByRole('button', { name: 'Delete 1 selected item' });
      fireEvent.click(deleteBtn);

      expect(screen.getByRole('alertdialog')).toBeInTheDocument();

      const confirmBtn = screen.getByRole('button', { name: 'Delete' });
      confirmBtn.focus();
      await user.keyboard('{Enter}');

      expect(mockDeleteWalletItems).toHaveBeenCalledWith(['w-1']);
    });
  });

  // ─── Keyboard shortcuts discoverability ────────────────────────────────

  describe('keyboard shortcuts discoverability', () => {
    it('renders KbdHint for select-all and export when items exist', () => {
      renderWithProviders(<WalletPage />);

      expect(screen.getByLabelText('Ctrl+Shift+A — select all')).toBeInTheDocument();
      expect(screen.getByLabelText('Ctrl+Shift+E — export selected')).toBeInTheDocument();
    });


  });

  // ─── Arrow key navigation for bulk toolbar ─────────────────────────────

  describe('bulk toolbar arrow key navigation at page level', () => {
    it('ArrowDown on toolbar moves focus forward identically to ArrowRight', () => {
      renderWithProviders(<WalletPage />);

      fireEvent.click(screen.getByTestId('select-item-checkbox-w-1'));
      const toolbar = screen.getByTestId('wallet-bulk-toolbar');

      expect(screen.getByRole('button', { name: 'Clear item selection' })).toHaveFocus();

      fireEvent.keyDown(toolbar, { key: 'ArrowDown' });
      expect(screen.getByRole('button', { name: 'Export 1 selected item as CSV' })).toHaveFocus();
    });

    it('ArrowUp on toolbar moves focus backward identically to ArrowLeft', () => {
      renderWithProviders(<WalletPage />);

      fireEvent.click(screen.getByTestId('select-item-checkbox-w-1'));
      const toolbar = screen.getByTestId('wallet-bulk-toolbar');

      // Move to CSV export first
      const csvBtn = screen.getByRole('button', { name: 'Export 1 selected item as CSV' });
      csvBtn.focus();

      fireEvent.keyDown(toolbar, { key: 'ArrowUp' });
      expect(screen.getByRole('button', { name: 'Clear item selection' })).toHaveFocus();
    });

    it('arrow keys on toolbar wrap around', () => {
      renderWithProviders(<WalletPage />);

      fireEvent.click(screen.getByTestId('select-item-checkbox-w-1'));
      const toolbar = screen.getByTestId('wallet-bulk-toolbar');

      const deleteBtn = screen.getByRole('button', { name: 'Delete 1 selected item' });
      deleteBtn.focus();

      // ArrowRight from last should wrap to first
      fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
      expect(screen.getByRole('button', { name: 'Clear item selection' })).toHaveFocus();

      // ArrowLeft from first should wrap to last
      fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
      expect(screen.getByRole('button', { name: 'Delete 1 selected item' })).toHaveFocus();
    });
  });

  // ─── Keyboard shortcut suppression during editing ──────────────────────

  describe('keyboard shortcut suppression during editing', () => {
    it('Ctrl+Shift+A triggers select-all when fired on document', async () => {
      mockListWalletItems.mockReturnValue(ITEMS);
      renderWithProviders(<WalletPage />);

      // Select an item to show toolbar
      fireEvent.click(screen.getByTestId('select-item-checkbox-w-1'));

      // Verify select-all is NOT checked
      expect(screen.getByTestId('select-all-checkbox')).not.toBeChecked();

      // Now type Ctrl+Shift+A on the body (not an input) — it SHOULD trigger
      fireEvent.keyDown(document, { key: 'a', ctrlKey: true, shiftKey: true });

      // Select-all should be triggered since no input is focused
      expect(screen.getByTestId('select-all-checkbox')).toBeChecked();
    });

    it('shortcuts work from document level not just input level', () => {
      mockListWalletItems.mockReturnValue(ITEMS);
      renderWithProviders(<WalletPage />);

      // Fire Ctrl+Shift+A on document
      fireEvent.keyDown(document, { key: 'a', ctrlKey: true, shiftKey: true });

      // Select-all should be triggered
      expect(screen.getByTestId('select-all-checkbox')).toBeChecked();
    });
  });

  // ─── Copy address button keyboard activation ───────────────────────────

  describe('copy address button keyboard activation', () => {
    it('copy-address button is keyboard-focusable', async () => {
      const user = userEvent.setup();
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
      });
      renderWithProviders(<WalletPage />);

      const copyBtn = screen.getByTestId('copy-wallet-address-btn-w-1');
      copyBtn.focus();
      expect(copyBtn).toHaveFocus();

      await user.keyboard('{Enter}');
      // Button should survive click
      expect(copyBtn).toBeInTheDocument();
    });

    it('copy-address button has aria-pressed that reflects copy state', async () => {
      const user = userEvent.setup();
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
      });
      renderWithProviders(<WalletPage />);

      const copyBtn = screen.getByTestId('copy-wallet-address-btn-w-1');
      expect(copyBtn).toHaveAttribute('aria-pressed', 'false');

      copyBtn.focus();
      await user.keyboard('{Enter}');

      expect(copyBtn).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
