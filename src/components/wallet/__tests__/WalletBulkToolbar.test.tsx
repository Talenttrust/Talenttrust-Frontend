import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { WalletBulkToolbar } from '../WalletBulkToolbar';
import { testA11y } from '@/test-utils/a11y';

describe('WalletBulkToolbar', () => {
  const defaultProps = {
    selectedCount: 2,
    onClearSelection: jest.fn(),
    onExport: jest.fn(),
    onDelete: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when selectedCount is 0', () => {
    const { container } = render(<WalletBulkToolbar {...defaultProps} selectedCount={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders toolbar with correct count for 1 selected item', () => {
    render(<WalletBulkToolbar {...defaultProps} selectedCount={1} />);
    expect(screen.getByTestId('wallet-bulk-toolbar')).toBeInTheDocument();
    expect(screen.getByText('1 item selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export 1 selected item/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete 1 selected item/i })).toBeInTheDocument();
  });

  it('renders toolbar with correct count for multiple selected items', () => {
    render(<WalletBulkToolbar {...defaultProps} selectedCount={3} />);
    expect(screen.getByText('3 items selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export 3 selected items/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete 3 selected items/i })).toBeInTheDocument();
  });

  it('calls onClearSelection when Clear selection button is clicked', () => {
    render(<WalletBulkToolbar {...defaultProps} />);
    const clearBtn = screen.getByRole('button', { name: /clear item selection/i });
    fireEvent.click(clearBtn);
    expect(defaultProps.onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('calls onExport when Export button is clicked', () => {
    render(<WalletBulkToolbar {...defaultProps} />);
    const exportBtn = screen.getByRole('button', { name: /export 2 selected items/i });
    fireEvent.click(exportBtn);
    expect(defaultProps.onExport).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete when Delete button is clicked', () => {
    render(<WalletBulkToolbar {...defaultProps} />);
    const deleteBtn = screen.getByRole('button', { name: /delete 2 selected items/i });
    fireEvent.click(deleteBtn);
    expect(defaultProps.onDelete).toHaveBeenCalledTimes(1);
  });

  it('clears selection when Escape key is pressed', () => {
    render(<WalletBulkToolbar {...defaultProps} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(defaultProps.onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('does not clear selection when a non-Escape key is pressed', () => {
    render(<WalletBulkToolbar {...defaultProps} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(defaultProps.onClearSelection).not.toHaveBeenCalled();
  });

  // a11y/wallet-71-contrast: the count pill's own background is stripped
  // under forced-colors, so it needs a stable selector for the CSS rule
  // in globals.css (`.wallet-count-badge`) to attach a visible border to.
  describe('forced-colors support (a11y/wallet-71-contrast)', () => {
    it('has role="toolbar" so the forced-colors container border applies', () => {
      render(<WalletBulkToolbar {...defaultProps} />);
      expect(screen.getByRole('toolbar')).toBeInTheDocument();
    });

    it('exposes the wallet-count-badge class hook on the selected-count pill', () => {
      render(<WalletBulkToolbar {...defaultProps} selectedCount={2} />);
      expect(screen.getByText('2').className).toContain('wallet-count-badge');
    });

    it('already uses a real focus-visible outline (not outline-none) on every action button', () => {
      render(<WalletBulkToolbar {...defaultProps} />);
      const exportBtn = screen.getByRole('button', { name: /export 2 selected items/i });
      const deleteBtn = screen.getByRole('button', { name: /delete 2 selected items/i });
      [exportBtn, deleteBtn].forEach((btn) => {
        expect(btn.className).not.toMatch(/focus:outline-none|focus-visible:outline-none/);
        expect(btn.className).toContain('focus-visible:outline');
      });
    });
  });

  describe('accessibility', () => {
    it('has zero axe violations', async () => {
      await testA11y(<WalletBulkToolbar {...defaultProps} />);
    });
  });
});
