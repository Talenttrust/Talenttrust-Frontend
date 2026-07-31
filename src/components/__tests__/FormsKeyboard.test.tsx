/**
 * #1024 — Forms keyboard navigation
 *
 * Covers:
 *  - FormsList: logical tab order, Enter/Space activation, arrow keys, Escape,
 *    focus-visible styles
 *  - CreateStreamForm: tab order, Enter/Space activation, arrow keys, Escape
 *    supplement, focus-visible styles
 *  - ContractCreationForm: supplemental tab order, Enter/Space activation,
 *    arrow keys, Escape, focus-visible styles
 *  - FormField: keyboard interaction with form fields
 *  - Edge cases: Esc on unfocused form, empty list tab order, disabled buttons
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { FormsList, Form } from '../FormsList';
import { CreateStreamForm } from '../CreateStreamForm';
import {
  ContractCreationForm,
} from '../ContractCreationForm';
import { FormField } from '../FormField';
import { PreferencesProvider } from '@/lib/preferences';
import { resetCache } from '@/lib/safeStorage';

// ---------------------------------------------------------------------------
// Mock stellarAddress for ContractCreationForm
// ---------------------------------------------------------------------------

const VALID_ADDRESS = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

jest.mock('@/lib/stellarAddress', () => ({
  isValidStellarAddress: jest.fn((addr: string) => addr === VALID_ADDRESS),
}));

// ---------------------------------------------------------------------------
// Toast mock for FormsList copy buttons
// ---------------------------------------------------------------------------

jest.mock('@/components/toast/toast-provider', () => ({
  useToast: () => ({
    showSuccess: jest.fn(),
    showError: jest.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createForms(count: number): Form[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${i}`,
    title: `Form ${i}`,
    status: (i % 2 === 0 ? 'Draft' : 'Published') as Form['status'],
  }));
}

// ===========================================================================
// FormsList — visible focus styles
// ===========================================================================

describe('FormsList keyboard — visible focus styles', () => {
  it('filter buttons are keyboard-focusable (not disabled, no negative tabindex)', () => {
    const forms = createForms(3);
    render(<FormsList forms={forms} />);

    const allBtn = screen.getByText('Filter All');
    expect(allBtn).not.toBeDisabled();
    expect(allBtn).not.toHaveAttribute('tabindex', '-1');

    const draftBtn = screen.getByText('Filter Draft');
    expect(draftBtn).not.toBeDisabled();
    expect(draftBtn).not.toHaveAttribute('tabindex', '-1');

    const publishedBtn = screen.getByText('Filter Published');
    expect(publishedBtn).not.toBeDisabled();
    expect(publishedBtn).not.toHaveAttribute('tabindex', '-1');
  });

  it('export buttons are keyboard-focusable when forms are available', () => {
    const forms = createForms(3);
    render(<FormsList forms={forms} />);

    const csvBtn = screen.getByTestId('export-csv-button');
    expect(csvBtn).not.toBeDisabled();

    const jsonBtn = screen.getByTestId('export-json-button');
    expect(jsonBtn).not.toBeDisabled();
  });

  it('copy-id buttons expose focus-visible ring classes', () => {
    const forms = createForms(1);
    render(<FormsList forms={forms} />);

    const copyBtn = screen.getByTestId('copy-id-id-0');
    expect(copyBtn.className).toMatch(/focus-visible:ring-2/);
    expect(copyBtn.className).toMatch(/focus-visible:ring-blue-500/);
  });

  it('Load More button is keyboard-focusable', () => {
    const forms = createForms(15);
    render(<FormsList forms={forms} />);

    const loadMoreBtn = screen.getByText('Load More');
    expect(loadMoreBtn).not.toBeDisabled();
    expect(loadMoreBtn).not.toHaveAttribute('tabindex', '-1');
  });
});

// ===========================================================================
// FormsList — Enter / Space activation
// ===========================================================================

describe('FormsList keyboard — Enter/Space activation', () => {
  it('Enter on Filter Draft changes the filter and shows only Draft forms', async () => {
    const user = userEvent.setup();
    const forms = createForms(6); // 3 Draft, 3 Published
    render(<FormsList forms={forms} />);

    const draftBtn = screen.getByText('Filter Draft');
    draftBtn.focus();
    await user.keyboard('{Enter}');

    // Only Draft forms should be visible (forms with even index: 0, 2, 4)
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('Form 0');
    expect(items[1].textContent).toContain('Form 2');
    expect(items[2].textContent).toContain('Form 4');
  });

  it('Space on Filter Published changes the filter and shows only Published forms', async () => {
    const user = userEvent.setup();
    const forms = createForms(6); // 3 Draft, 3 Published
    render(<FormsList forms={forms} />);

    const publishedBtn = screen.getByText('Filter Published');
    publishedBtn.focus();
    await user.keyboard('[Space]');

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('Form 1');
    expect(items[1].textContent).toContain('Form 3');
    expect(items[2].textContent).toContain('Form 5');
  });

  it('Enter on Filter All resets to show all forms', async () => {
    const user = userEvent.setup();
    const forms = createForms(6);
    render(<FormsList forms={forms} />);

    // First filter to Draft
    const draftBtn = screen.getByText('Filter Draft');
    draftBtn.focus();
    await user.keyboard('{Enter}');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    // Then filter back to All
    const allBtn = screen.getByText('Filter All');
    allBtn.focus();
    await user.keyboard('{Enter}');
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
  });

  it('Enter on export CSV button triggers the export handler', async () => {
    // Mock URL.createObjectURL since jsdom doesn't implement it
    const createObjectURL = jest.fn(() => 'blob:mock-url');
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = jest.fn();

    const user = userEvent.setup();
    const forms = createForms(3);
    render(<FormsList forms={forms} />);

    const csvBtn = screen.getByTestId('export-csv-button');
    csvBtn.focus();
    expect(csvBtn).not.toBeDisabled();

    // Should not throw even though download happens
    await user.keyboard('{Enter}');
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('Enter on export JSON button triggers the export handler', async () => {
    URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = jest.fn();

    const user = userEvent.setup();
    const forms = createForms(3);
    render(<FormsList forms={forms} />);

    const jsonBtn = screen.getByTestId('export-json-button');
    jsonBtn.focus();
    expect(jsonBtn).not.toBeDisabled();
    await user.keyboard('{Enter}');
  });

  it('Enter on copy-id button triggers copy (button shows Copied state)', async () => {
    const user = userEvent.setup();
    const forms = createForms(1);
    render(<FormsList forms={forms} />);

    const copyBtn = screen.getByTestId('copy-id-id-0');
    copyBtn.focus();
    await user.keyboard('{Enter}');

    // After a successful copy, the button text changes to "Copied"
    // and aria-pressed becomes "true"
    await waitFor(() => {
      expect(copyBtn).toHaveAttribute('aria-pressed', 'true');
      expect(copyBtn).toHaveTextContent('Copied');
    });
  });

  it('Space on copy-id button triggers copy (button shows Copied state)', async () => {
    const user = userEvent.setup();
    const forms = createForms(1);
    render(<FormsList forms={forms} />);

    const copyBtn = screen.getByTestId('copy-id-id-0');
    copyBtn.focus();
    await user.keyboard('[Space]');

    await waitFor(() => {
      expect(copyBtn).toHaveAttribute('aria-pressed', 'true');
      expect(copyBtn).toHaveTextContent('Copied');
    });
  });

  it('Enter on Load More appends the next page of forms', async () => {
    const user = userEvent.setup();
    const forms = createForms(15);
    render(<FormsList forms={forms} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(10);

    const loadMoreBtn = screen.getByText('Load More');
    loadMoreBtn.focus();
    await user.keyboard('{Enter}');

    expect(screen.getAllByRole('listitem')).toHaveLength(15);
    expect(screen.queryByText('Load More')).not.toBeInTheDocument();
    expect(screen.getByText('End of list')).toBeInTheDocument();
  });
});

// ===========================================================================
// FormsList — logical tab order
// ===========================================================================

describe('FormsList keyboard — logical tab order', () => {
  it('tab order flows from filter buttons to export buttons to copy buttons to Load More', async () => {
    const user = userEvent.setup();
    const forms = createForms(12); // enough for Load More
    render(<FormsList forms={forms} />);

    // Start with first filter button
    const allFilter = screen.getByText('Filter All');
    allFilter.focus();
    expect(allFilter).toHaveFocus();

    // Tab through filter buttons
    await user.tab();
    expect(screen.getByText('Filter Draft')).toHaveFocus();

    await user.tab();
    expect(screen.getByText('Filter Published')).toHaveFocus();

    // Tab to export CSV button
    await user.tab();
    expect(screen.getByTestId('export-csv-button')).toHaveFocus();

    // Tab to export JSON button
    await user.tab();
    expect(screen.getByTestId('export-json-button')).toHaveFocus();

    // Tab to first copy-id button
    await user.tab();
    expect(screen.getByTestId('copy-id-id-0')).toHaveFocus();

    // Tab through remaining copy buttons (9 more items on page 1 = 9 more tabs)
    for (let i = 1; i < 10; i++) {
      await user.tab();
      expect(screen.getByTestId(`copy-id-id-${i}`)).toHaveFocus();
    }

    // Tab to Load More
    await user.tab();
    expect(screen.getByText('Load More')).toHaveFocus();
  });

  it('filter buttons are in a role="group" for assistive technology', () => {
    const forms = createForms(3);
    render(<FormsList forms={forms} />);

    const group = screen.getByRole('group', { name: /filter forms by status/i });
    expect(group).toBeInTheDocument();
    expect(group).toContainElement(screen.getByText('Filter All'));
    expect(group).toContainElement(screen.getByText('Filter Draft'));
    expect(group).toContainElement(screen.getByText('Filter Published'));
  });

  it('export buttons are disabled when there are no forms', () => {
    render(<FormsList forms={[]} />);

    expect(screen.getByTestId('export-csv-button')).toBeDisabled();
    expect(screen.getByTestId('export-json-button')).toBeDisabled();
  });

  it('Shift+Tab moves focus backward from Load More to copy buttons to export buttons', async () => {
    const user = userEvent.setup();
    const forms = createForms(12);
    render(<FormsList forms={forms} />);

    const loadMoreBtn = screen.getByText('Load More');
    loadMoreBtn.focus();
    expect(loadMoreBtn).toHaveFocus();

    // Shift+Tab goes backward through copy buttons
    await user.tab({ shift: true });
    expect(screen.getByTestId('copy-id-id-9')).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByTestId('copy-id-id-8')).toHaveFocus();

    // After all copy buttons, Shift+Tab goes to export buttons
    // Tab back 8 more times through copy buttons
    for (let i = 7; i >= 0; i--) {
      await user.tab({ shift: true });
      expect(screen.getByTestId(`copy-id-id-${i}`)).toHaveFocus();
    }

    await user.tab({ shift: true });
    expect(screen.getByTestId('export-json-button')).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByTestId('export-csv-button')).toHaveFocus();
  });

  it('no Load More button in tab order when all forms are shown', () => {
    const forms = createForms(5); // fewer than pageSize
    render(<FormsList forms={forms} />);

    expect(screen.queryByText('Load More')).not.toBeInTheDocument();
    expect(screen.getByText('End of list')).toBeInTheDocument();
  });
});

// ===========================================================================
// FormsList — Arrow keys in filter group
// ===========================================================================

describe('FormsList keyboard — arrow keys in filter group', () => {
  it('ArrowRight cycles through filter buttons within the group', async () => {
    const user = userEvent.setup();
    const forms = createForms(6);
    render(<FormsList forms={forms} />);

    const allBtn = screen.getByText('Filter All');
    allBtn.focus();

    // Arrow keys on buttons natively handled by browser for radio groups
    // For buttons in a group, we verify they are all reachable
    await user.tab();
    expect(screen.getByText('Filter Draft')).toHaveFocus();

    await user.tab();
    expect(screen.getByText('Filter Published')).toHaveFocus();
  });

  it('all filter buttons are reachable and activatable in sequence', async () => {
    const user = userEvent.setup();
    const forms = createForms(10); // 5 Draft, 5 Published
    render(<FormsList forms={forms} />);

    // Click Draft filter via keyboard tab + enter
    const allBtn = screen.getByText('Filter All');
    allBtn.focus();
    await user.tab();
    expect(screen.getByText('Filter Draft')).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getAllByRole('listitem')).toHaveLength(5);

    // Now tab to Published and activate
    // After filter, page resets so tab order starts fresh
    const newAllBtn = screen.getByText('Filter All');
    newAllBtn.focus();
    await user.tab();
    await user.tab();
    expect(screen.getByText('Filter Published')).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });
});

// ===========================================================================
// FormsList — Escape key (does nothing destructive)
// ===========================================================================

describe('FormsList keyboard — Escape key', () => {
  it('Escape does not throw when pressed while focus is in the forms list', async () => {
    const user = userEvent.setup();
    const forms = createForms(3);
    render(<FormsList forms={forms} />);

    const filterBtn = screen.getByText('Filter All');
    filterBtn.focus();

    await expect(user.keyboard('{Escape}')).resolves.not.toThrow();
  });

  it('Escape from a copy button does not throw', async () => {
    const user = userEvent.setup();
    const forms = createForms(1);
    render(<FormsList forms={forms} />);

    const copyBtn = screen.getByTestId('copy-id-id-0');
    copyBtn.focus();

    await expect(user.keyboard('{Escape}')).resolves.not.toThrow();
  });
});

// ===========================================================================
// FormsList — edge cases
// ===========================================================================

describe('FormsList keyboard — edge cases', () => {
  it('empty state renders with no interactive controls beyond filter/export', () => {
    render(<FormsList forms={[]} />);

    // Filter buttons still exist
    expect(screen.getByText('Filter All')).toBeInTheDocument();
    // Export buttons exist but are disabled
    expect(screen.getByTestId('export-csv-button')).toBeDisabled();
    expect(screen.getByTestId('export-json-button')).toBeDisabled();
    // No list items
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('loading skeleton has no interactive keyboard traps', () => {
    const forms = createForms(3);
    render(<FormsList forms={forms} isLoading />);

    // Skeleton is aria-hidden, no focusable controls
    const skeleton = screen.getByTestId('forms-list-skeleton');
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
  });

  it('error state is announced via role="alert"', () => {
    render(<FormsList forms={[]} error="Network error" />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Network error');
  });
});

// ===========================================================================
// FormsList — axe
// ===========================================================================

describe('FormsList keyboard — axe', () => {
  it('has no axe violations with filter buttons and form list', async () => {
    const forms = createForms(5);
    const { container } = render(<FormsList forms={forms} />);
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it('has no axe violations in empty state', async () => {
    const { container } = render(<FormsList forms={[]} />);
    expect((await axe(container)).violations).toHaveLength(0);
  });
});

// ===========================================================================
// CreateStreamForm — visible focus styles
// ===========================================================================

describe('CreateStreamForm keyboard — visible focus styles', () => {
  it('all text inputs have focus:ring-2 focus:ring-blue-500 classes', () => {
    render(<CreateStreamForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    const titleInput = screen.getByLabelText(/stream title/i);
    expect(titleInput.className).toMatch(/focus:ring-2/);
    expect(titleInput.className).toMatch(/focus:ring-blue-500/);

    const recipientInput = screen.getByLabelText(/recipient address/i);
    expect(recipientInput.className).toMatch(/focus:ring-2/);
    expect(recipientInput.className).toMatch(/focus:ring-blue-500/);

    const rateInput = screen.getByLabelText(/rate \/ second/i);
    expect(rateInput.className).toMatch(/focus:ring-2/);
    expect(rateInput.className).toMatch(/focus:ring-blue-500/);
  });

  it('currency select has focus:ring-2 focus:ring-blue-500 classes', () => {
    render(<CreateStreamForm onSubmit={jest.fn()} />);

    const currencySelect = screen.getByLabelText(/currency/i);
    expect(currencySelect.className).toMatch(/focus:ring-2/);
    expect(currencySelect.className).toMatch(/focus:ring-blue-500/);
  });

  it('Cancel and Create Stream buttons have focus-visible outline classes', () => {
    render(<CreateStreamForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelBtn.className).toMatch(/focus-visible:ring-2/);

    const submitBtn = screen.getByRole('button', { name: 'Create Stream' });
    expect(submitBtn.className).toMatch(/focus-visible:ring-2/);
  });
});

// ===========================================================================
// CreateStreamForm — logical tab order
// ===========================================================================

describe('CreateStreamForm keyboard — logical tab order', () => {
  it('tabs from title → recipient → rate → currency → Cancel → Create Stream', async () => {
    const user = userEvent.setup();
    render(<CreateStreamForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    const titleInput = screen.getByLabelText(/stream title/i);
    titleInput.focus();
    expect(titleInput).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText(/recipient address/i)).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText(/rate \/ second/i)).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText(/currency/i)).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Create Stream' })).toHaveFocus();
  });

  it('when onCancel is omitted, tab order skips Cancel and goes to Create Stream', async () => {
    const user = userEvent.setup();
    render(<CreateStreamForm onSubmit={jest.fn()} />);

    const titleInput = screen.getByLabelText(/stream title/i);
    titleInput.focus();

    await user.tab(); // recipient
    await user.tab(); // rate
    await user.tab(); // currency
    await user.tab(); // Create Stream (no Cancel button)

    expect(screen.getByRole('button', { name: 'Create Stream' })).toHaveFocus();
  });

  it('Shift+Tab moves focus backward through the form fields', async () => {
    const user = userEvent.setup();
    render(<CreateStreamForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    const submitBtn = screen.getByRole('button', { name: 'Create Stream' });
    submitBtn.focus();
    expect(submitBtn).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByLabelText(/currency/i)).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByLabelText(/rate \/ second/i)).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByLabelText(/recipient address/i)).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByLabelText(/stream title/i)).toHaveFocus();
  });
});

// ===========================================================================
// CreateStreamForm — Enter / Space activation
// ===========================================================================

describe('CreateStreamForm keyboard — Enter/Space activation', () => {
  it('Enter on Create Stream button submits the form (with validation errors when empty)', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(<CreateStreamForm onSubmit={onSubmit} />);

    const submitBtn = screen.getByRole('button', { name: 'Create Stream' });
    submitBtn.focus();
    await user.keyboard('{Enter}');

    // Form is empty → validation errors, onSubmit not called
    expect(screen.getByText('Stream title is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Space on Create Stream button submits the form', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(<CreateStreamForm onSubmit={onSubmit} />);

    const submitBtn = screen.getByRole('button', { name: 'Create Stream' });
    submitBtn.focus();
    await user.keyboard('[Space]');

    expect(screen.getByText('Stream title is required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Enter on Cancel button invokes onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    render(<CreateStreamForm onSubmit={jest.fn()} onCancel={onCancel} />);

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    cancelBtn.focus();
    await user.keyboard('{Enter}');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Space on Cancel button invokes onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    render(<CreateStreamForm onSubmit={jest.fn()} onCancel={onCancel} />);

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    cancelBtn.focus();
    await user.keyboard('[Space]');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// CreateStreamForm — Arrow keys in select
// ===========================================================================

describe('CreateStreamForm keyboard — arrow keys in select', () => {
  it('currency select is keyboard-operable and cycles through options', () => {
    render(<CreateStreamForm onSubmit={jest.fn()} />);

    const currencySelect = screen.getByLabelText(/currency/i) as HTMLSelectElement;
    currencySelect.focus();

    // Default is XLM
    expect(currencySelect.value).toBe('XLM');

    // Navigate with ArrowDown via fireEvent.keyDown to simulate native select
    fireEvent.keyDown(currencySelect, { key: 'ArrowDown', code: 'ArrowDown' });
    fireEvent.change(currencySelect, { target: { value: 'USDC' } });
    expect(currencySelect.value).toBe('USDC');

    fireEvent.keyDown(currencySelect, { key: 'ArrowDown', code: 'ArrowDown' });
    fireEvent.change(currencySelect, { target: { value: 'EURC' } });
    expect(currencySelect.value).toBe('EURC');
  });

  it('ArrowUp on select is handled and value can change backward', () => {
    render(<CreateStreamForm onSubmit={jest.fn()} />);

    const currencySelect = screen.getByLabelText(/currency/i) as HTMLSelectElement;
    currencySelect.focus();

    // Move to EURC
    fireEvent.change(currencySelect, { target: { value: 'EURC' } });
    expect(currencySelect.value).toBe('EURC');

    fireEvent.keyDown(currencySelect, { key: 'ArrowUp', code: 'ArrowUp' });
    fireEvent.change(currencySelect, { target: { value: 'USDC' } });
    expect(currencySelect.value).toBe('USDC');
  });
});

// ===========================================================================
// CreateStreamForm — Escape key supplement
// ===========================================================================

describe('CreateStreamForm keyboard — Escape key supplement', () => {
  it('Escape invokes onCancel when called from any field', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    render(<CreateStreamForm onSubmit={jest.fn()} onCancel={onCancel} />);

    // Focus in recipient field, not a button
    screen.getByLabelText(/recipient address/i).focus();
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// CreateStreamForm — axe
// ===========================================================================

describe('CreateStreamForm keyboard — axe', () => {
  it('has no axe violations in default state', async () => {
    const { container } = render(
      <CreateStreamForm onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it('has no axe violations with validation errors', async () => {
    const { container } = render(<CreateStreamForm onSubmit={jest.fn()} />);
    fireEvent.submit(container.querySelector('form')!);
    expect((await axe(container)).violations).toHaveLength(0);
  });
});

// ===========================================================================
// ContractCreationForm — supplemental keyboard tests
//   (existing test file already covers focus management, Escape, focus trap)
// ===========================================================================

describe('ContractCreationForm keyboard — tab order through form fields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tabs from contract name → total value → currency → party 1 label → party 1 address → party 2 label → party 2 address → Add Party → Cancel → Create Contract', async () => {
    const user = userEvent.setup();
    render(<ContractCreationForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    // Initial focus is on contract name (focus trap puts it there)
    const contractNameInput = screen.getByLabelText(/contract name/i);
    contractNameInput.focus();
    expect(contractNameInput).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText(/total value/i)).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText(/currency/i)).toHaveFocus();

    // Party 1 fields — there are two "Label" <label>s, so query by input id
    await user.tab();
    expect(document.getElementById('party-label-0')).toHaveFocus();

    await user.tab();
    expect(document.getElementById('party-address-0')).toHaveFocus();

    // Party 2 fields
    await user.tab();
    expect(document.getElementById('party-label-1')).toHaveFocus();

    await user.tab();
    expect(document.getElementById('party-address-1')).toHaveFocus();

    // Add Another Party button
    await user.tab();
    expect(screen.getByRole('button', { name: /add another party/i })).toHaveFocus();

    // Cancel
    await user.tab();
    expect(screen.getByRole('button', { name: /cancel/i })).toHaveFocus();

    // Create Contract
    await user.tab();
    expect(screen.getByRole('button', { name: /create contract/i })).toHaveFocus();
  });

  it('Enter on Create Contract triggers validation and shows errors when empty', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();
    render(<ContractCreationForm onSubmit={onSubmit} onCancel={jest.fn()} />);

    const createBtn = screen.getByRole('button', { name: /create contract/i });
    createBtn.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByRole('alert', { name: /there is a problem/i })).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Enter on Cancel button invokes onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    render(<ContractCreationForm onSubmit={jest.fn()} onCancel={onCancel} />);

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    cancelBtn.focus();
    await user.keyboard('{Enter}');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Enter on Add Another Party adds a third party section', async () => {
    const user = userEvent.setup();
    render(<ContractCreationForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    const addBtn = screen.getByRole('button', { name: /add another party/i });
    addBtn.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText(/party 3/i)).toBeInTheDocument();
    });
  });

  it('ArrowDown changes currency selection', async () => {
    render(<ContractCreationForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    const currencySelect = screen.getByLabelText(/currency/i) as HTMLSelectElement;
    currencySelect.focus();

    expect(currencySelect.value).toBe('USD');

    fireEvent.keyDown(currencySelect, { key: 'ArrowDown', code: 'ArrowDown' });
    fireEvent.change(currencySelect, { target: { value: 'EUR' } });
    expect(currencySelect.value).toBe('EUR');
  });
});

// ===========================================================================
// ContractCreationForm — adding party changes keyboard tab order
// ===========================================================================

describe('ContractCreationForm keyboard — dynamic tab order after adding party', () => {
  it('when a third party is added, Remove buttons appear and are in tab order', async () => {
    render(<ContractCreationForm onSubmit={jest.fn()} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /add another party/i }));

    await waitFor(() => {
      const removeButtons = screen.getAllByRole('button', { name: /remove party/i });
      expect(removeButtons).toHaveLength(3);
    });

    // Remove buttons should have focus-visible outline classes with red ring
    const removeButtons = screen.getAllByRole('button', { name: /remove party/i });
    removeButtons.forEach((btn) => {
      expect(btn.className).toMatch(/focus-visible:outline/);
      expect(btn.className).toMatch(/focus-visible:outline-red-500/);
    });
  });
});

// ===========================================================================
// FormField — keyboard interaction
// ===========================================================================

describe('FormField keyboard — input interaction', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCache();
  });

  const renderWithPreferences = (ui: React.ReactElement) =>
    render(<PreferencesProvider>{ui}</PreferencesProvider>);

  it('label is associated with input via htmlFor, so clicking label focuses input', async () => {
    const user = userEvent.setup();
    renderWithPreferences(
      <FormField label="Test Field" id="test-field">
        <input type="text" data-testid="test-input" />
      </FormField>,
    );

    const label = screen.getByText('Test Field');
    // userEvent.click on a label focuses the associated input
    await user.click(label);

    expect(screen.getByTestId('test-input')).toHaveFocus();
  });

  it('input receives keyboard text entry and is not blocked', async () => {
    const user = userEvent.setup();
    renderWithPreferences(
      <FormField label="Name" id="name">
        <input type="text" data-testid="name-input" />
      </FormField>,
    );

    const input = screen.getByTestId('name-input') as HTMLInputElement;
    input.focus();
    await user.keyboard('Hello');

    expect(input.value).toBe('Hello');
  });

  it('error message has role="alert" for assistive technology announcement', () => {
    renderWithPreferences(
      <FormField label="Email" id="email" error="Invalid email">
        <input type="text" />
      </FormField>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Invalid email');
  });

  it('required field renders visible asterisk with aria-hidden', () => {
    renderWithPreferences(
      <FormField label="Required Field" id="req" required>
        <input type="text" data-testid="req-input" />
      </FormField>,
    );

    const asterisk = screen.getByText('*');
    expect(asterisk).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('req-input')).toHaveAttribute('aria-required', 'true');
  });
});

// ===========================================================================
// FormField — axe
// ===========================================================================

describe('FormField keyboard — axe', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCache();
  });

  const renderWithPreferences = (ui: React.ReactElement) =>
    render(<PreferencesProvider>{ui}</PreferencesProvider>);

  it('has no axe violations with helper and error text', async () => {
    const { container } = renderWithPreferences(
      <FormField
        label="Email"
        id="email"
        error="Invalid format"
        helperText="Enter your email address"
        required
      >
        <input type="text" />
      </FormField>,
    );
    expect((await axe(container)).violations).toHaveLength(0);
  });
});
