import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { WalletBulkToolbar } from '../WalletBulkToolbar';

const defaultProps = {
  selectedCount: 3,
  onClearSelection: jest.fn(),
  onExportCsv: jest.fn(),
  onExportJson: jest.fn(),
  onDelete: jest.fn(),
};

describe('WalletBulkToolbar — keyboard navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── Arrow key navigation ──────────────────────────────────────────────

  describe('arrow key navigation', () => {
    it('ArrowRight moves focus forward through toolbar buttons', () => {
      const { container } = render(<WalletBulkToolbar {...defaultProps} />);

      const clearBtn = screen.getByRole('button', { name: 'Clear item selection' });
      const csvBtn = screen.getByRole('button', { name: 'Export 3 selected items as CSV' });

      clearBtn.focus();
      expect(clearBtn).toHaveFocus();

      fireEvent.keyDown(container.firstChild!, { key: 'ArrowRight' });
      expect(csvBtn).toHaveFocus();
    });

    it('ArrowDown moves focus forward through toolbar buttons', () => {
      const { container } = render(<WalletBulkToolbar {...defaultProps} />);

      const clearBtn = screen.getByRole('button', { name: 'Clear item selection' });

      clearBtn.focus();
      fireEvent.keyDown(container.firstChild!, { key: 'ArrowDown' });
      expect(screen.getByRole('button', { name: 'Export 3 selected items as CSV' })).toHaveFocus();
    });

    it('ArrowLeft moves focus backward through toolbar buttons', () => {
      const { container } = render(<WalletBulkToolbar {...defaultProps} />);

      const csvBtn = screen.getByRole('button', { name: 'Export 3 selected items as CSV' });
      const clearBtn = screen.getByRole('button', { name: 'Clear item selection' });

      csvBtn.focus();
      fireEvent.keyDown(container.firstChild!, { key: 'ArrowLeft' });
      expect(clearBtn).toHaveFocus();
    });

    it('ArrowUp moves focus backward through toolbar buttons', () => {
      const { container } = render(<WalletBulkToolbar {...defaultProps} />);

      const csvBtn = screen.getByRole('button', { name: 'Export 3 selected items as CSV' });
      const clearBtn = screen.getByRole('button', { name: 'Clear item selection' });

      csvBtn.focus();
      fireEvent.keyDown(container.firstChild!, { key: 'ArrowUp' });
      expect(clearBtn).toHaveFocus();
    });

    it('ArrowRight wraps from last to first button', () => {
      const { container } = render(<WalletBulkToolbar {...defaultProps} />);

      const deleteBtn = screen.getByRole('button', { name: 'Delete 3 selected items' });
      const clearBtn = screen.getByRole('button', { name: 'Clear item selection' });

      deleteBtn.focus();
      expect(deleteBtn).toHaveFocus();

      fireEvent.keyDown(container.firstChild!, { key: 'ArrowRight' });
      expect(clearBtn).toHaveFocus();
    });

    it('ArrowLeft wraps from first to last button', () => {
      const { container } = render(<WalletBulkToolbar {...defaultProps} />);

      const clearBtn = screen.getByRole('button', { name: 'Clear item selection' });
      const deleteBtn = screen.getByRole('button', { name: 'Delete 3 selected items' });

      clearBtn.focus();
      fireEvent.keyDown(container.firstChild!, { key: 'ArrowLeft' });
      expect(deleteBtn).toHaveFocus();
    });
  });

  // ─── Home and End keys ─────────────────────────────────────────────────

  describe('Home and End keys', () => {
    it('Home jumps focus to the first focusable button', () => {
      const { container } = render(<WalletBulkToolbar {...defaultProps} />);

      const deleteBtn = screen.getByRole('button', { name: 'Delete 3 selected items' });
      const clearBtn = screen.getByRole('button', { name: 'Clear item selection' });

      deleteBtn.focus();
      expect(deleteBtn).toHaveFocus();

      fireEvent.keyDown(container.firstChild!, { key: 'Home' });
      expect(clearBtn).toHaveFocus();
    });

    it('End jumps focus to the last focusable button', () => {
      const { container } = render(<WalletBulkToolbar {...defaultProps} />);

      const clearBtn = screen.getByRole('button', { name: 'Clear item selection' });
      const deleteBtn = screen.getByRole('button', { name: 'Delete 3 selected items' });

      clearBtn.focus();
      expect(clearBtn).toHaveFocus();

      fireEvent.keyDown(container.firstChild!, { key: 'End' });
      expect(deleteBtn).toHaveFocus();
    });
  });

  // ─── Escape key clears selection ───────────────────────────────────────

  describe('Escape key', () => {
    it('Escape triggers onClearSelection via the window keydown listener', () => {
      const onClear = jest.fn();
      render(<WalletBulkToolbar {...defaultProps} onClearSelection={onClear} />);

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('Escape does not fire onClearSelection when selectedCount is 0', () => {
      const onClear = jest.fn();
      render(
        <WalletBulkToolbar
          selectedCount={0}
          onClearSelection={onClear}
          onExportCsv={jest.fn()}
          onExportJson={jest.fn()}
          onDelete={jest.fn()}
        />
      );

      // When selectedCount is 0, the component returns null, but the effect
      // still runs. The handler checks selectedCount > 0.
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClear).not.toHaveBeenCalled();
    });

    it('Escape does not fire after component unmounts', () => {
      const onClear = jest.fn();
      const { unmount } = render(<WalletBulkToolbar {...defaultProps} onClearSelection={onClear} />);

      unmount();

      fireEvent.keyDown(window, { key: 'Escape' });
      // The mountedRef prevents firing after unmount
      expect(onClear).not.toHaveBeenCalled();
    });
  });

  // ─── Auto-focus on toolbar appearance ──────────────────────────────────

  describe('auto-focus when toolbar appears', () => {
    it('auto-focuses the first focusable button when selection transitions from 0 to >0', () => {
      const { rerender } = render(
        <WalletBulkToolbar
          selectedCount={0}
          onClearSelection={jest.fn()}
          onExportCsv={jest.fn()}
          onExportJson={jest.fn()}
          onDelete={jest.fn()}
        />
      );

      // Toolbar is not rendered when count is 0
      expect(screen.queryByTestId('wallet-bulk-toolbar')).not.toBeInTheDocument();

      // Transition to selected
      rerender(
        <WalletBulkToolbar
          {...defaultProps}
          selectedCount={2}
        />
      );

      const clearBtn = screen.getByRole('button', { name: 'Clear item selection' });
      expect(clearBtn).toHaveFocus();
    });
  });

  // ─── Ignore arrow keys when not inside toolbar ─────────────────────────

  describe('arrow keys ignored when focus is outside toolbar', () => {
    it('ArrowRight does not move toolbar focus when focus is outside', () => {
      const { container } = render(
        <div>
          <button type="button">Outside Button</button>
          <WalletBulkToolbar {...defaultProps} />
        </div>
      );

      const outsideBtn = screen.getByRole('button', { name: 'Outside Button' });
      outsideBtn.focus();

      fireEvent.keyDown(container.firstChild!, { key: 'ArrowRight' });

      // Focus should remain on the outside button
      expect(outsideBtn).toHaveFocus();
    });
  });

  // ─── Enter and Space activation ────────────────────────────────────────

  describe('Enter and Space activation', () => {
    it('Enter activates CSV export button', async () => {
      const onExportCsv = jest.fn();
      const user = userEvent.setup();
      render(<WalletBulkToolbar {...defaultProps} onExportCsv={onExportCsv} />);

      const csvBtn = screen.getByRole('button', { name: 'Export 3 selected items as CSV' });
      csvBtn.focus();
      await user.keyboard('{Enter}');

      expect(onExportCsv).toHaveBeenCalledTimes(1);
    });

    it('Space activates CSV export button', async () => {
      const onExportCsv = jest.fn();
      const user = userEvent.setup();
      render(<WalletBulkToolbar {...defaultProps} onExportCsv={onExportCsv} />);

      const csvBtn = screen.getByRole('button', { name: 'Export 3 selected items as CSV' });
      csvBtn.focus();
      await user.keyboard('[Space]');

      expect(onExportCsv).toHaveBeenCalledTimes(1);
    });

    it('Enter activates Delete button', async () => {
      const onDelete = jest.fn();
      const user = userEvent.setup();
      render(<WalletBulkToolbar {...defaultProps} onDelete={onDelete} />);

      const deleteBtn = screen.getByRole('button', { name: 'Delete 3 selected items' });
      deleteBtn.focus();
      await user.keyboard('{Enter}');

      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it('Enter activates Clear selection button', async () => {
      const onClear = jest.fn();
      const user = userEvent.setup();
      render(<WalletBulkToolbar {...defaultProps} onClearSelection={onClear} />);

      const clearBtn = screen.getByRole('button', { name: 'Clear item selection' });
      clearBtn.focus();
      await user.keyboard('{Enter}');

      expect(onClear).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Tab order in toolbar ──────────────────────────────────────────────

  describe('tab order', () => {
    it('tab moves through all toolbar buttons in DOM order', async () => {
      const user = userEvent.setup();
      render(<WalletBulkToolbar {...defaultProps} />);

      const clearBtn = screen.getByRole('button', { name: 'Clear item selection' });
      const csvBtn = screen.getByRole('button', { name: 'Export 3 selected items as CSV' });
      const jsonBtn = screen.getByRole('button', { name: 'Export 3 selected items as JSON' });
      const deleteBtn = screen.getByRole('button', { name: 'Delete 3 selected items' });

      clearBtn.focus();
      expect(clearBtn).toHaveFocus();

      await user.tab();
      expect(csvBtn).toHaveFocus();

      await user.tab();
      expect(jsonBtn).toHaveFocus();

      await user.tab();
      expect(deleteBtn).toHaveFocus();
    });

    it('shift+tab reverses tab order through toolbar', async () => {
      const user = userEvent.setup();
      render(<WalletBulkToolbar {...defaultProps} />);

      const deleteBtn = screen.getByRole('button', { name: 'Delete 3 selected items' });
      const jsonBtn = screen.getByRole('button', { name: 'Export 3 selected items as JSON' });
      const csvBtn = screen.getByRole('button', { name: 'Export 3 selected items as CSV' });
      const clearBtn = screen.getByRole('button', { name: 'Clear item selection' });

      deleteBtn.focus();
      expect(deleteBtn).toHaveFocus();

      await user.tab({ shift: true });
      expect(jsonBtn).toHaveFocus();

      await user.tab({ shift: true });
      expect(csvBtn).toHaveFocus();

      await user.tab({ shift: true });
      expect(clearBtn).toHaveFocus();
    });
  });

  // ─── Singular/plural labels ────────────────────────────────────────────

  describe('singular item count', () => {
    it('renders correct aria-labels for single selection', () => {
      render(
        <WalletBulkToolbar
          selectedCount={1}
          onClearSelection={jest.fn()}
          onExportCsv={jest.fn()}
          onExportJson={jest.fn()}
          onDelete={jest.fn()}
        />
      );

      expect(screen.getByText('1 item selected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Export 1 selected item as CSV' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Export 1 selected item as JSON' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete 1 selected item' })).toBeInTheDocument();
    });
  });

  // ─── Toolbar returns null when no selection ────────────────────────────

  describe('null render when no selection', () => {
    it('returns null and renders nothing when selectedCount is 0', () => {
      const { container } = render(
        <WalletBulkToolbar
          selectedCount={0}
          onClearSelection={jest.fn()}
          onExportCsv={jest.fn()}
          onExportJson={jest.fn()}
          onDelete={jest.fn()}
        />
      );

      expect(screen.queryByTestId('wallet-bulk-toolbar')).not.toBeInTheDocument();
      expect(container.firstChild).toBeNull();
    });

    it('returns null when selectedCount is negative', () => {
      render(
        <WalletBulkToolbar
          selectedCount={-1}
          onClearSelection={jest.fn()}
          onExportCsv={jest.fn()}
          onExportJson={jest.fn()}
          onDelete={jest.fn()}
        />
      );

      expect(screen.queryByTestId('wallet-bulk-toolbar')).not.toBeInTheDocument();
    });
  });
});
