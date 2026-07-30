/**
 * contracts-keyboard-navigation.test.tsx
 *
 * Coverage for contracts's keyboard operability (issue: "Add tests for
 * contracts keyboard navigation"). This is test-only: no behavioural
 * changes are made unless a defect is found while writing these tests.
 *
 * Covers:
 *  - Logical tab order across the toolbar (search -> sort -> CSV -> JSON ->
 *    Create Contract -> density toggle)
 *  - Enter / Space activation of toolbar buttons
 *  - Create Contract dialog: opens with focus on the first field, Tab/
 *    Shift+Tab wrap at the dialog boundary, Escape cancels and restores
 *    focus to the trigger button
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContractsPage from '../page';
import * as repository from '@/lib/repository';
import * as exportContracts from '@/lib/exportContracts';
import { PreferencesProvider } from '@/lib/preferences';
import type { Contract } from '@/types/domain';

jest.mock('@/lib/exportContracts', () => ({
  downloadContractsCsv: jest.fn(),
  downloadContractsJson: jest.fn(),
}));

jest.mock('@/components/toast/toast-provider', () => ({
  useToast: () => ({
    showSuccess: jest.fn(),
    showError: jest.fn(),
    toasts: [],
    dismissToast: jest.fn(),
  }),
}));

const CONTRACTS: Contract[] = [
  {
    id: 'contract-1',
    contractName: 'Website redesign',
    parties: [
      { label: 'Client', address: 'GCLIENT' },
      { label: 'Freelancer', address: 'GFREELANCER' },
    ],
    totalValue: 2500,
    currency: 'USD',
    status: 'Active',
    createdAt: '2026-07-20',
    milestoneCount: 3,
  },
];

const mockedDownloadCsv = exportContracts.downloadContractsCsv as jest.MockedFunction<
  typeof exportContracts.downloadContractsCsv
>;
const mockedDownloadJson = exportContracts.downloadContractsJson as jest.MockedFunction<
  typeof exportContracts.downloadContractsJson
>;

function renderContractsPage() {
  jest.spyOn(repository, 'listContracts').mockReturnValue(CONTRACTS);
  return render(
    <PreferencesProvider>
      <ContractsPage />
    </PreferencesProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('contracts keyboard navigation — tab order', () => {
  it('tabs from search to sort to CSV to JSON to Create Contract to density toggle', async () => {
    const user = userEvent.setup();
    renderContractsPage();

    const search = screen.getByLabelText('Search contracts');
    search.focus();
    expect(search).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText('Sort by')).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Export contracts as CSV' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Export contracts as JSON' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Create Contract' })).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole('button', { name: /switch to compact density/i }),
    ).toHaveFocus();
  });
});

describe('contracts keyboard navigation — Enter/Space activation', () => {
  it('Enter on the CSV button triggers the CSV export', async () => {
    const user = userEvent.setup();
    renderContractsPage();

    screen.getByRole('button', { name: 'Export contracts as CSV' }).focus();
    await user.keyboard('{Enter}');

    expect(mockedDownloadCsv).toHaveBeenCalledTimes(1);
  });

  it('Space on the JSON button triggers the JSON export', async () => {
    const user = userEvent.setup();
    renderContractsPage();

    screen.getByRole('button', { name: 'Export contracts as JSON' }).focus();
    await user.keyboard('[Space]');

    expect(mockedDownloadJson).toHaveBeenCalledTimes(1);
  });

  it('Enter on the density toggle switches to compact density', async () => {
    const user = userEvent.setup();
    renderContractsPage();

    const toggle = screen.getByRole('button', { name: /switch to compact density/i });
    toggle.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: /switch to comfortable density/i })).toHaveFocus();
  });

  it('Enter on Create Contract opens the creation dialog', async () => {
    const user = userEvent.setup();
    renderContractsPage();

    screen.getByRole('button', { name: 'Create Contract' }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('contracts keyboard navigation — creation dialog', () => {
  it('opens with focus on the Contract Name field', async () => {
    const user = userEvent.setup();
    renderContractsPage();

    await user.click(screen.getByRole('button', { name: 'Create Contract' }));

    expect(screen.getByLabelText(/contract name/i)).toHaveFocus();
  });

  it('Escape cancels the dialog and restores focus to the trigger button', async () => {
    const user = userEvent.setup();
    renderContractsPage();

    await user.click(screen.getByRole('button', { name: 'Create Contract' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The toolbar (and its "Create Contract" button) unmounts while the
    // dialog is open, so this must be the freshly-remounted button, not the
    // pre-open reference.
    expect(screen.getByRole('button', { name: 'Create Contract' })).toHaveFocus();
  });

  it('Shift+Tab from the first field wraps focus to the last dialog control (Create Contract submit)', async () => {
    const user = userEvent.setup();
    renderContractsPage();

    await user.click(screen.getByRole('button', { name: 'Create Contract' }));
    expect(screen.getByLabelText(/contract name/i)).toHaveFocus();

    await user.tab({ shift: true });

    const dialog = screen.getByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Create Contract' });
    expect(submit).toHaveFocus();
  });

  it('Tab from the last dialog control wraps focus back to the first field', async () => {
    const user = userEvent.setup();
    renderContractsPage();

    await user.click(screen.getByRole('button', { name: 'Create Contract' }));
    const dialog = screen.getByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: 'Create Contract' });
    submit.focus();

    await user.tab();

    expect(screen.getByLabelText(/contract name/i)).toHaveFocus();
  });

  it('Enter on Cancel closes the dialog', async () => {
    const user = userEvent.setup();
    renderContractsPage();

    const trigger = screen.getByRole('button', { name: 'Create Contract' });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog');
    within(dialog).getByRole('button', { name: 'Cancel' }).focus();
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
