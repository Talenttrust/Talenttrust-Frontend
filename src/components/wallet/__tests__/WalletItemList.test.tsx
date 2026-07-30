import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { WalletItemList } from '../WalletItemList';
import { testA11y } from '@/test-utils/a11y';
import type { WalletItem } from '@/types/domain';

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
    name: 'Escrow Lock Key #402',
    type: 'Security Credential',
    balance: 1,
    currency: 'KEY',
    status: 'Pending',
    createdAt: '2026-03-10',
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

describe('WalletItemList', () => {
  const defaultProps = {
    items: ITEMS,
    selectedIds: new Set<string>(),
    onToggleSelect: jest.fn(),
    onToggleSelectAll: jest.fn(),
    onDeleteItem: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders nothing when items is empty', () => {
      const { container } = render(<WalletItemList {...defaultProps} items={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders a row for each item', () => {
      render(<WalletItemList {...defaultProps} />);
      expect(screen.getByTestId('wallet-item-row-w-1')).toBeInTheDocument();
      expect(screen.getByTestId('wallet-item-row-w-2')).toBeInTheDocument();
      expect(screen.getByTestId('wallet-item-row-w-3')).toBeInTheDocument();
    });

    it('renders item name, type, balance, currency, and created date', () => {
      render(<WalletItemList {...defaultProps} />);
      expect(screen.getByText('Stellar Lumens (XLM)')).toBeInTheDocument();
      expect(screen.getByText('Native Asset')).toBeInTheDocument();
      expect(screen.getByText('12,500 XLM')).toBeInTheDocument();
      expect(screen.getByText('2026-01-15')).toBeInTheDocument();
    });

    it('renders the wallet address when present', () => {
      render(<WalletItemList {...defaultProps} />);
      expect(screen.getByText(ITEMS[0].address!)).toBeInTheDocument();
    });

    it('omits the address line when not present', () => {
      render(<WalletItemList {...defaultProps} />);
      const row = screen.getByTestId('wallet-item-row-w-2');
      expect(row.querySelector('.font-mono')).not.toBeInTheDocument();
    });

    it('renders the accessible table label', () => {
      render(<WalletItemList {...defaultProps} />);
      expect(screen.getByLabelText('Wallet items table')).toBeInTheDocument();
    });
  });

  describe('status badge integration (a11y/wallet-71-contrast)', () => {
    it('renders a StatusBadge (role="status") for each item, not a color-only pill', () => {
      render(<WalletItemList {...defaultProps} />);
      const statuses = screen.getAllByRole('status');
      expect(statuses).toHaveLength(3);
    });

    it('exposes each status via an accessible label rather than color alone', () => {
      render(<WalletItemList {...defaultProps} />);
      expect(screen.getByLabelText('Status: Active')).toBeInTheDocument();
      expect(screen.getByLabelText('Status: Pending')).toBeInTheDocument();
      expect(screen.getByLabelText('Status: Archived')).toBeInTheDocument();
    });

    it('no longer renders the old color-only inline status pill classes (regression guard)', () => {
      const { container } = render(<WalletItemList {...defaultProps} />);
      expect(container.innerHTML).not.toMatch(/bg-(emerald|amber)-100/);
    });
  });

  describe('selection', () => {
    it('calls onToggleSelect with the item id when its checkbox is clicked', () => {
      render(<WalletItemList {...defaultProps} />);
      fireEvent.click(screen.getByTestId('select-item-checkbox-w-1'));
      expect(defaultProps.onToggleSelect).toHaveBeenCalledWith('w-1');
    });

    it('checks the checkbox for a selected item', () => {
      render(<WalletItemList {...defaultProps} selectedIds={new Set(['w-1'])} />);
      expect(screen.getByTestId('select-item-checkbox-w-1')).toBeChecked();
      expect(screen.getByTestId('select-item-checkbox-w-2')).not.toBeChecked();
    });

    it('marks a selected row with aria-selected="true" (forced-colors-safe indicator)', () => {
      render(<WalletItemList {...defaultProps} selectedIds={new Set(['w-1'])} />);
      expect(screen.getByTestId('wallet-item-row-w-1')).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('wallet-item-row-w-2')).toHaveAttribute('aria-selected', 'false');
    });

    it('calls onToggleSelectAll when the header checkbox is clicked', () => {
      render(<WalletItemList {...defaultProps} />);
      fireEvent.click(screen.getByTestId('select-all-checkbox'));
      expect(defaultProps.onToggleSelectAll).toHaveBeenCalledTimes(1);
    });

    it('checks the select-all checkbox when every item is selected', () => {
      render(<WalletItemList {...defaultProps} selectedIds={new Set(['w-1', 'w-2', 'w-3'])} />);
      expect(screen.getByTestId('select-all-checkbox')).toBeChecked();
    });

    it('sets the select-all checkbox to indeterminate when some (not all) items are selected', () => {
      render(<WalletItemList {...defaultProps} selectedIds={new Set(['w-1'])} />);
      const checkbox = screen.getByTestId('select-all-checkbox') as HTMLInputElement;
      expect(checkbox.indeterminate).toBe(true);
    });

    it('clears indeterminate when selection becomes empty', () => {
      const { rerender } = render(
        <WalletItemList {...defaultProps} selectedIds={new Set(['w-1'])} />
      );
      rerender(<WalletItemList {...defaultProps} selectedIds={new Set()} />);
      const checkbox = screen.getByTestId('select-all-checkbox') as HTMLInputElement;
      expect(checkbox.indeterminate).toBe(false);
    });
  });

  describe('delete action', () => {
    it('renders a delete button per row when onDeleteItem is provided', () => {
      render(<WalletItemList {...defaultProps} />);
      expect(screen.getByLabelText('Delete Stellar Lumens (XLM)')).toBeInTheDocument();
    });

    it('calls onDeleteItem with the item id when clicked', () => {
      render(<WalletItemList {...defaultProps} />);
      fireEvent.click(screen.getByLabelText('Delete Stellar Lumens (XLM)'));
      expect(defaultProps.onDeleteItem).toHaveBeenCalledWith('w-1');
    });

    it('omits the delete button entirely when onDeleteItem is not provided', () => {
      render(<WalletItemList {...defaultProps} onDeleteItem={undefined} />);
      expect(screen.queryByLabelText('Delete Stellar Lumens (XLM)')).not.toBeInTheDocument();
    });

    // a11y/wallet-71-contrast: Tailwind's `outline-none` sets outline-color
    // to transparent (not outline-style: none) -- forced-colors mode
    // explicitly preserves `transparent`, so the ring stayed invisible.
    // The box-shadow-based `ring` is also stripped under forced-colors.
    // Regression guard: `focus:outline-none` must never come back.
    it('uses a real focus-visible outline instead of outline-none + ring (forced-colors regression guard)', () => {
      render(<WalletItemList {...defaultProps} />);
      const deleteBtn = screen.getByLabelText('Delete Stellar Lumens (XLM)');
      expect(deleteBtn.className).not.toMatch(/focus:outline-none/);
      expect(deleteBtn.className).toContain('focus-visible:outline');
      expect(deleteBtn.className).toContain('focus-visible:outline-2');
      expect(deleteBtn.className).toContain('focus-visible:outline-offset-2');
      expect(deleteBtn.className).toContain('focus-visible:outline-rose-500');
    });
  });

  describe('accessibility', () => {
    it('has zero axe violations with no selection', async () => {
      await testA11y(<WalletItemList {...defaultProps} />);
    });

    it('has zero axe violations with a partial selection (indeterminate select-all)', async () => {
      await testA11y(<WalletItemList {...defaultProps} selectedIds={new Set(['w-1'])} />);
    });

    it('has zero axe violations with all items selected', async () => {
      await testA11y(
        <WalletItemList {...defaultProps} selectedIds={new Set(['w-1', 'w-2', 'w-3'])} />
      );
    });
  });
});
