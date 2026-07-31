/**
 * FormsListSkeleton.test.tsx
 *
 * Tests for the FormsListSkeleton component and its integration with
 * FormsList loading state. Covers:
 *   - Skeleton rendering and structure (filter buttons, export buttons, form rows)
 *   - Accessibility (role, aria attributes, screen-reader announcement)
 *   - Decorative nature (aria-hidden blocks, no interactive controls)
 *   - axe compliance
 *   - Loading → loaded transitions via FormsList
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { FormsListSkeleton, FormsList, Form } from '../FormsList';

// ---------------------------------------------------------------------------
// Toast mock (FormsList uses useToast via CopyIdButton)
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

const sampleForms: Form[] = [
  { id: 'frm-001', title: 'Alpha Form', status: 'Published' },
  { id: 'frm-002', title: 'Beta Form', status: 'Draft' },
  { id: 'frm-003', title: 'Gamma Form', status: 'Published' },
];

// ---------------------------------------------------------------------------
// FormsListSkeleton — standalone rendering
// ---------------------------------------------------------------------------

describe('FormsListSkeleton — rendering', () => {
  it('renders a role="status" container', () => {
    render(<FormsListSkeleton />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has aria-busy="true" to announce loading to AT', () => {
    render(<FormsListSkeleton />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  });

  it('has aria-live="polite" so AT announces the region', () => {
    render(<FormsListSkeleton />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('has aria-label with the loading message', () => {
    render(<FormsListSkeleton />);
    expect(screen.getByRole('status')).toHaveAttribute(
      'aria-label',
      'Loading forms',
    );
  });

  it('has data-testid="forms-loading" for querying in tests', () => {
    render(<FormsListSkeleton />);
    expect(screen.getByTestId('forms-loading')).toBeInTheDocument();
  });

  it('renders a visually-hidden sr-only label', () => {
    render(<FormsListSkeleton />);
    const srSpan = screen
      .getByRole('status')
      .querySelector('.sr-only') as HTMLElement;
    expect(srSpan).toBeInTheDocument();
    expect(srSpan.textContent).toBe('Loading forms');
  });
});

// ---------------------------------------------------------------------------
// FormsListSkeleton — structure matching FormsList layout
// ---------------------------------------------------------------------------

describe('FormsListSkeleton — structure matches FormsList layout', () => {
  it('renders the skeleton list with data-testid="forms-list-skeleton"', () => {
    render(<FormsListSkeleton />);
    expect(screen.getByTestId('forms-list-skeleton')).toBeInTheDocument();
  });

  it('renders exactly 10 skeleton form rows', () => {
    render(<FormsListSkeleton />);
    expect(screen.getAllByTestId('forms-skeleton-row')).toHaveLength(10);
  });

  it('each skeleton row is a <li> element', () => {
    render(<FormsListSkeleton />);
    const rows = screen.getAllByTestId('forms-skeleton-row');
    rows.forEach((row) => {
      expect(row.tagName).toBe('LI');
    });
  });

  it('skeleton list has aria-hidden="true" (decorative)', () => {
    render(<FormsListSkeleton />);
    expect(screen.getByTestId('forms-list-skeleton')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('renders skeleton blocks for filter buttons, export buttons, and form rows', () => {
    const { container } = render(<FormsListSkeleton />);
    const blocks = container.querySelectorAll('[aria-hidden="true"]');

    // We expect: 3 filter pill skeletons + 2 export button skeletons +
    // 10 rows × 3 skeletons each (title, id, copy button) +
    // a handful of wrapper divs with aria-hidden. So >= 35 total blocks.
    expect(blocks.length).toBeGreaterThanOrEqual(35);

    // Confirm the list skeleton rows are present
    expect(screen.getAllByTestId('forms-skeleton-row')).toHaveLength(10);
  });

  it('renders no interactive controls (buttons, inputs, etc.)', () => {
    render(<FormsListSkeleton />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// FormsListSkeleton — axe accessibility
// ---------------------------------------------------------------------------

describe('FormsListSkeleton — axe accessibility', () => {
  it('passes axe with no violations', async () => {
    const { container } = render(<FormsListSkeleton />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

// ---------------------------------------------------------------------------
// FormsList — loading → loaded transition
// ---------------------------------------------------------------------------

describe('FormsList — loading → loaded transition', () => {
  it('shows FormsListSkeleton when isLoading=true', () => {
    render(<FormsList forms={[]} isLoading />);
    expect(screen.getByTestId('forms-loading')).toBeInTheDocument();
    expect(screen.getByTestId('forms-list-skeleton')).toBeInTheDocument();
  });

  it('switches from skeleton to content when loading completes', () => {
    const { rerender } = render(<FormsList forms={sampleForms} isLoading />);
    expect(screen.getByTestId('forms-loading')).toBeInTheDocument();

    rerender(<FormsList forms={sampleForms} isLoading={false} />);
    expect(screen.queryByTestId('forms-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('forms-list')).toBeInTheDocument();
    expect(screen.getByText('Alpha Form')).toBeInTheDocument();
  });

  it('switches from skeleton to empty when loading completes with no forms', () => {
    const { rerender } = render(<FormsList forms={[]} isLoading />);
    expect(screen.getByTestId('forms-loading')).toBeInTheDocument();

    rerender(<FormsList forms={[]} isLoading={false} />);
    expect(screen.queryByTestId('forms-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('forms-empty')).toBeInTheDocument();
  });

  it('switches from skeleton to error when loading completes with error', () => {
    const { rerender } = render(<FormsList forms={[]} isLoading />);
    expect(screen.getByTestId('forms-loading')).toBeInTheDocument();

    rerender(
      <FormsList forms={[]} isLoading={false} error="Failed to load forms." />,
    );
    expect(screen.queryByTestId('forms-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('forms-error')).toBeInTheDocument();
    expect(screen.getByText('Failed to load forms.')).toBeInTheDocument();
  });

  it('shows loading skeleton when both isLoading and error are set (loading preempts error)', () => {
    render(
      <FormsList forms={[]} isLoading error="Something went wrong." />,
    );
    expect(screen.getByTestId('forms-loading')).toBeInTheDocument();
    expect(screen.getByTestId('forms-list-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('forms-error')).not.toBeInTheDocument();
  });

  it('does not show the forms list content while loading', () => {
    render(<FormsList forms={sampleForms} isLoading />);
    expect(screen.queryByTestId('forms-list')).not.toBeInTheDocument();
  });

  it('does not show the empty state while loading', () => {
    render(<FormsList forms={[]} isLoading />);
    expect(screen.queryByTestId('forms-empty')).not.toBeInTheDocument();
  });

  it('states are mutually exclusive during loading', () => {
    render(<FormsList forms={sampleForms} isLoading />);
    expect(screen.getByTestId('forms-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('forms-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('forms-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('forms-error')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// FormsListSkeleton — no layout shift guarantee
// ---------------------------------------------------------------------------

describe('FormsListSkeleton — no layout shift', () => {
  it('maintains the same top-level container structure as loaded FormsList', () => {
    const { container: skeletonContainer } = render(<FormsListSkeleton />);
    // The skeleton wraps content in a div with role="status", matching the
    // same overall structure as FormsList's returned <div>
    expect(skeletonContainer.querySelector('[role="status"]')).toBeInTheDocument();
  });

  it('has filter area matching the same flex layout as loaded state', () => {
    const { container } = render(<FormsListSkeleton />);
    // The filter + export bar uses the same `flex flex-wrap items-center justify-between gap-2 mb-4`
    const actionBar = container.querySelector('.flex.flex-wrap.items-center.justify-between');
    expect(actionBar).toBeInTheDocument();
  });

  it('form rows use the same flex justify-between layout as loaded rows', () => {
    render(<FormsListSkeleton />);
    const rows = screen.getAllByTestId('forms-skeleton-row');
    rows.forEach((row) => {
      expect(row.className).toContain('flex');
      expect(row.className).toContain('items-center');
      expect(row.className).toContain('justify-between');
    });
  });
});
