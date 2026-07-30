/**
 * reputation-a11y-high-contrast.test.tsx
 *
 * Structural coverage for forced-colors / high-contrast support on
 * ReputationProfile (issue: "Add high-contrast mode support to
 * reputation"). jsdom does not evaluate `@media (forced-colors: active)`,
 * so — mirroring the existing wallet high-contrast tests
 * (`wallet-a11y-motion-contrast.test.tsx`) — these assert the presence of
 * the `data-*` hooks the CSS in `globals.css` targets, plus an axe audit
 * of the rendered structure.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ReputationProfile, {
  ReputationEvent,
  ReputationProfileProps,
} from '../ReputationProfile';
import { assertNoA11yViolations } from '@/test-utils/a11y';

jest.mock('../toast/toast-provider', () => ({
  useToast: () => ({
    showSuccess: jest.fn(),
    showError: jest.fn(),
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

describe('a11y: high-contrast — ReputationProfile', () => {
  it('score meter has role="meter" for forced-colors targeting', () => {
    renderProfile({ name: 'Score User', score: 70, history: HISTORY });
    expect(screen.getByRole('meter')).toBeInTheDocument();
  });

  it('history list has data-reputation-list attribute for forced-colors targeting', () => {
    const { container } = renderProfile({ name: 'List User', score: 70, history: HISTORY });
    expect(container.querySelector('[data-reputation-list]')).toBeInTheDocument();
  });

  it('toolbar has data-reputation-toolbar attribute for forced-colors targeting', () => {
    const { container } = renderProfile({ name: 'Toolbar User', score: 70, history: HISTORY });
    expect(container.querySelector('[data-reputation-toolbar]')).toBeInTheDocument();
  });

  it('toolbar retains role="toolbar" for assistive technology in high-contrast', () => {
    renderProfile({ name: 'Toolbar Role User', score: 70, history: HISTORY });
    expect(screen.getByRole('toolbar', { name: 'Reputation history actions' })).toBeInTheDocument();
  });

  it('selected history items gain data-selected for forced-colors highlighting, unselected do not', () => {
    const { container } = renderProfile({ name: 'Select User', score: 70, history: HISTORY });

    const firstCheckbox = screen.getByLabelText(/Select reputation item Verification/i);
    fireEvent.click(firstCheckbox);

    const items = container.querySelectorAll('[data-reputation-list] li');
    expect(items[0]).toHaveAttribute('data-selected', 'true');
    expect(items[1]).not.toHaveAttribute('data-selected');
  });

  it('data-selected is removed again when the item is deselected', () => {
    const { container } = renderProfile({ name: 'Deselect User', score: 70, history: HISTORY });

    const firstCheckbox = screen.getByLabelText(/Select reputation item Verification/i);
    fireEvent.click(firstCheckbox);
    fireEvent.click(firstCheckbox);

    const items = container.querySelectorAll('[data-reputation-list] li');
    expect(items[0]).not.toHaveAttribute('data-selected');
  });

  it('has no axe violations with an item selected (structural a11y for high-contrast rendering)', async () => {
    const { container } = renderProfile({ name: 'Axe User', score: 70, history: HISTORY });
    fireEvent.click(screen.getByLabelText(/Select reputation item Verification/i));
    await assertNoA11yViolations(container);
  });
});
