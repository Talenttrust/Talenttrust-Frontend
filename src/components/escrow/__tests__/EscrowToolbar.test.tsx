import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SORTS, STATUSES, type ContractQuery, type Sort } from '@/lib/contractQuery';
import { EscrowToolbar } from '../EscrowToolbar';

function setup(overrides: { status?: ContractQuery['status']; sort?: Sort; search?: string } = {}) {
  const onStatusChange = vi.fn();
  const onSortChange = vi.fn();
  const onSearchChange = vi.fn();
  render(
    <EscrowToolbar
      status={overrides.status ?? ''}
      sort={overrides.sort ?? 'newest'}
      search={overrides.search ?? ''}
      onStatusChange={onStatusChange}
      onSortChange={onSortChange}
      onSearchChange={onSearchChange}
    />,
  );
  return { onStatusChange, onSortChange, onSearchChange };
}

describe('EscrowToolbar', () => {
  describe('landmarks and labels', () => {
    it('exposes a search landmark with an accessible name', () => {
      setup();
      expect(screen.getByRole('search', { name: 'Filter escrows' })).toBeInTheDocument();
    });

    it('labels the search input, status select and sort select', () => {
      setup();
      expect(screen.getByRole('searchbox', { name: 'Search' })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument();
    });
  });

  describe('options', () => {
    it('renders "All" followed by every status', () => {
      setup();
      const options = Array.from(screen.getByRole('combobox', { name: 'Status' }).querySelectorAll('option'));
      expect(options.map((o) => o.value)).toEqual(['', ...STATUSES]);
      expect(options[0]).toHaveTextContent('All');
    });

    it('renders every sort with its label', () => {
      setup();
      const options = Array.from(screen.getByRole('combobox', { name: 'Sort' }).querySelectorAll('option'));
      expect(options.map((o) => o.value)).toEqual(Object.keys(SORTS));
      expect(options.map((o) => o.textContent)).toEqual(Object.values(SORTS));
    });
  });

  describe('controlled values', () => {
    it('reflects the status, sort and search props', () => {
      setup({ status: 'Disputed', sort: 'total', search: 'abc' });
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('Disputed');
      expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('total');
      expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('abc');
    });
  });

  describe('change handlers', () => {
    it('calls onStatusChange with the selected status value', async () => {
      const { onStatusChange } = setup();
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'Funded');
      expect(onStatusChange).toHaveBeenCalledTimes(1);
      expect(onStatusChange).toHaveBeenCalledWith('Funded');
    });

    it('calls onStatusChange with an empty string when "All" is chosen', async () => {
      const { onStatusChange } = setup({ status: 'Completed' });
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'All');
      expect(onStatusChange).toHaveBeenCalledWith('');
    });

    it('calls onSortChange with the sort key, not its label', async () => {
      const { onSortChange } = setup();
      await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort' }), 'Most in escrow');
      expect(onSortChange).toHaveBeenCalledTimes(1);
      expect(onSortChange).toHaveBeenCalledWith('escrow');
    });

    it('calls onSearchChange with the typed text', async () => {
      const { onSearchChange } = setup();
      await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'g');
      expect(onSearchChange).toHaveBeenCalledTimes(1);
      expect(onSearchChange).toHaveBeenCalledWith('g');
    });

    it('does not call the status or sort handlers when searching', async () => {
      const { onStatusChange, onSortChange } = setup();
      await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'x');
      expect(onStatusChange).not.toHaveBeenCalled();
      expect(onSortChange).not.toHaveBeenCalled();
    });
  });

  describe('Escape to clear search', () => {
    it('clears the search when Escape is pressed with text present', async () => {
      const { onSearchChange } = setup({ search: 'escrow' });
      const input = screen.getByRole('searchbox', { name: 'Search' });
      input.focus();
      await userEvent.keyboard('{Escape}');
      expect(onSearchChange).toHaveBeenCalledTimes(1);
      expect(onSearchChange).toHaveBeenCalledWith('');
    });

    it('does nothing when Escape is pressed on an empty search', async () => {
      const { onSearchChange } = setup({ search: '' });
      screen.getByRole('searchbox', { name: 'Search' }).focus();
      await userEvent.keyboard('{Escape}');
      expect(onSearchChange).not.toHaveBeenCalled();
    });

    it('ignores other keys when text is present', async () => {
      const { onSearchChange } = setup({ search: 'escrow' });
      screen.getByRole('searchbox', { name: 'Search' }).focus();
      await userEvent.keyboard('{Enter}{Tab}');
      expect(onSearchChange).not.toHaveBeenCalled();
    });
  });
});
