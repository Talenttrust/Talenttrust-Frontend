/**
 * ReputationKeyboardNavigation.test.tsx
 *
 * Keyboard-operability coverage for ReputationProfile's interactive
 * controls (select-all checkbox, per-item checkboxes, copy-id buttons,
 * toolbar actions, "Load more"): tab order and Enter/Space activation.
 * Mirrors the existing wallet keyboard test's approach
 * (`src/components/wallet/__tests__/WalletItemListKeyboard.test.tsx`).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReputationProfile, {
  ReputationEvent,
  ReputationProfileProps,
} from '../ReputationProfile';

const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();

jest.mock('../toast/toast-provider', () => ({
  useToast: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    dismissToast: jest.fn(),
    toasts: [],
  }),
}));

const HISTORY: ReputationEvent[] = [
  { id: 'ev-1', type: 'Verification', summary: 'Completed identity verification', date: '2026-04-24' },
  { id: 'ev-2', type: 'On-chain review', summary: 'Received positive trust signal', date: '2026-04-23' },
];

function renderProfile(props: ReputationProfileProps) {
  return render(<ReputationProfile syncUrl={false} {...props} />);
}

describe('ReputationProfile — keyboard operation', () => {
  it('tabs from the type filter through the sort control to select-all', async () => {
    const user = userEvent.setup();
    renderProfile({ name: 'Nav User', score: 70, history: HISTORY });

    const typeFilter = screen.getByTestId('reputation-type-filter');
    const sortDir = screen.getByTestId('reputation-sort-dir');
    const selectAll = screen.getByLabelText('Select all reputation items');

    typeFilter.focus();
    expect(typeFilter).toHaveFocus();

    await user.tab();
    expect(sortDir).toHaveFocus();

    await user.tab();
    expect(selectAll).toHaveFocus();
  });

  it('tabs through the toolbar buttons in DOM order once they are enabled by a selection', async () => {
    const user = userEvent.setup();
    renderProfile({ name: 'Toolbar Nav User', score: 70, history: HISTORY });

    // Export/Delete/Clear are disabled (and so skipped in tab order) until
    // at least one item is selected.
    const selectAll = screen.getByLabelText(
      'Select all reputation items'
    ) as HTMLInputElement;
    await user.click(selectAll);
    expect(selectAll.checked).toBe(true);

    selectAll.focus();

    await user.tab();
    expect(screen.getByLabelText('Export selected reputation items')).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText('Delete selected reputation items')).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText('Clear selected reputation items; clear selection')).toHaveFocus();
  });

  it('tabs from a history item checkbox to its copy-id button', async () => {
    const user = userEvent.setup();
    renderProfile({ name: 'Row Nav User', score: 70, history: HISTORY });

    screen.getByLabelText(/Select reputation item Verification/i).focus();

    await user.tab();
    expect(screen.getByTestId('copy-reputation-id-btn-ev-1')).toHaveFocus();
  });

  it('toggles a history item checkbox via the keyboard (Space)', async () => {
    const user = userEvent.setup();
    renderProfile({ name: 'Space User', score: 70, history: HISTORY });

    const checkbox = screen.getByLabelText(
      /Select reputation item Verification/i
    ) as HTMLInputElement;
    checkbox.focus();
    expect(checkbox.checked).toBe(false);

    await user.keyboard(' ');
    expect(checkbox.checked).toBe(true);

    await user.keyboard(' ');
    expect(checkbox.checked).toBe(false);
  });

  it('activates "Export selected" via the keyboard (Enter) once an item is selected', async () => {
    const user = userEvent.setup();
    mockShowSuccess.mockClear();
    renderProfile({ name: 'Enter User', score: 70, history: HISTORY });

    await user.click(screen.getByLabelText(/Select reputation item Verification/i));
    screen.getByLabelText('Export selected reputation items').focus();
    await user.keyboard('{Enter}');

    expect(mockShowSuccess).toHaveBeenCalled();
  });

  it('export/delete/clear toolbar buttons are keyboard-disabled (not tab-reachable via activation) until a selection exists', () => {
    renderProfile({ name: 'Disabled User', score: 70, history: HISTORY });

    expect(screen.getByLabelText('Export selected reputation items')).toBeDisabled();
    expect(screen.getByLabelText('Delete selected reputation items')).toBeDisabled();
    expect(screen.getByLabelText('Clear selected reputation items; clear selection')).toBeDisabled();
  });

  it('activates "Load more" via the keyboard (Enter) when more history exists beyond the first page', async () => {
    const user = userEvent.setup();
    const manyEvents: ReputationEvent[] = Array.from({ length: 7 }, (_, i) => ({
      id: `ev-${i + 1}`,
      type: 'Verification',
      summary: `Event number ${i + 1}`,
      date: '2026-04-24',
    }));
    renderProfile({ name: 'Load More User', score: 70, history: manyEvents });

    const loadMore = screen.getByRole('button', { name: /Showing 5 of 7 events\. Load more/i });
    loadMore.focus();
    expect(screen.queryByText('Event number 6')).not.toBeInTheDocument();

    await user.keyboard('{Enter}');

    expect(screen.getByText('Event number 6')).toBeInTheDocument();
  });
});
