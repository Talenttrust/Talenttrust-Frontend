import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { FormsList, Form } from '../FormsList';

const createForms = (count: number): Form[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${i}`,
    title: `Form ${i}`,
    status: i % 2 === 0 ? 'Draft' : 'Published',
  }));
};

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton / layout shift
// ─────────────────────────────────────────────────────────────────────────────

describe('FormsList — skeleton / layout shift', () => {
  it('renders a form-shaped loading skeleton with a busy state while loading', () => {
    const forms = createForms(3);
    render(<FormsList forms={forms} isLoading />);

    const statusRegion = screen.getByRole('status', { name: /loading forms/i });
    expect(statusRegion).toHaveAttribute('aria-busy', 'true');

    const skeleton = screen.getByTestId('forms-list-skeleton');
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByTestId('forms-skeleton-row')).toHaveLength(10);
  });

  it('skeleton toolbar mirrors the loaded toolbar to prevent layout shift', () => {
    const forms = createForms(3);

    // Render skeleton and loaded side-by-side for comparison
    const ui = (
      <>
        <div data-testid="skeleton-area">
          <FormsList forms={forms} isLoading />
        </div>
        <div data-testid="loaded-area">
          <FormsList forms={forms} />
        </div>
      </>
    );
    render(ui);

    const skeletonArea = within(screen.getByTestId('skeleton-area'));
    const loadedArea = within(screen.getByTestId('loaded-area'));

    // Skeleton has filter group with 3 placeholder buttons
    expect(skeletonArea.getByTestId('forms-skeleton-filters')).toBeInTheDocument();
    // Skeleton has export group with 2 placeholder buttons
    expect(skeletonArea.getByTestId('forms-skeleton-export')).toBeInTheDocument();

    // Both skeleton and loaded toolbar use the same flex layout with mb-4
    const skeletonToolbar = skeletonArea.getByTestId('forms-skeleton-filters').parentElement!;
    const loadedToolbar = loadedArea.getByRole('group', { name: /filter forms/i }).parentElement!;
    expect(skeletonToolbar.className).toContain('mb-4');
    expect(loadedToolbar.className).toContain('mb-4');
  });

  it('skeleton rows mirror loaded row structure to prevent layout shift', () => {
    const forms = createForms(3);

    const ui = (
      <>
        <div data-testid="skeleton-area">
          <FormsList forms={forms} isLoading />
        </div>
        <div data-testid="loaded-area">
          <FormsList forms={forms} />
        </div>
      </>
    );
    render(ui);

    const skeletonArea = within(screen.getByTestId('skeleton-area'));
    const loadedArea = within(screen.getByTestId('loaded-area'));

    // Skeleton rows use the same flex-between layout as loaded rows
    const skeletonRow = skeletonArea.getAllByTestId('forms-skeleton-row')[0];
    const loadedRow = loadedArea.getAllByRole('listitem')[0];

    for (const cls of ['flex', 'items-center', 'justify-between', 'gap-3', 'py-2']) {
      expect(skeletonRow.className).toContain(cls);
      expect(loadedRow.className).toContain(cls);
    }
  });

  it('skeleton rows contain title, id, and copy button placeholders', () => {
    const forms = createForms(3);
    render(<FormsList forms={forms} isLoading />);

    const firstRow = screen.getAllByTestId('forms-skeleton-row')[0];
    // Row should have a title skeleton (left side)
    const titleSkeleton = firstRow.querySelector(':scope > div[aria-hidden="true"]');
    expect(titleSkeleton).toBeInTheDocument();
    // Row should have a span with id + copy button skeletons (right side)
    const rightGroup = firstRow.querySelector(':scope > span');
    expect(rightGroup).toBeInTheDocument();
    expect(rightGroup!.className).toContain('flex');
    expect(rightGroup!.className).toContain('items-center');
    expect(rightGroup!.className).toContain('gap-2');
    // Right group should contain two skeleton blocks
    const rightSkeletons = rightGroup!.querySelectorAll('[aria-hidden="true"]');
    expect(rightSkeletons.length).toBe(2);
  });

  it('transitions from skeleton wrapper to content wrapper cleanly', () => {
    const forms = createForms(3);
    const { rerender } = render(<FormsList forms={forms} isLoading />);

    // Skeleton is showing
    expect(screen.getByTestId('forms-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('forms-list')).not.toBeInTheDocument();

    // Transition to loaded
    rerender(<FormsList forms={forms} isLoading={false} />);

    // Skeleton gone, content visible — same container element structure
    expect(screen.queryByTestId('forms-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('forms-list')).toBeInTheDocument();
  });

  it('switches from skeleton to content when loading completes', () => {
    const forms = createForms(3);
    const { rerender } = render(<FormsList forms={forms} isLoading />);

    expect(screen.getByRole('status', { name: /loading forms/i })).toBeInTheDocument();

    rerender(<FormsList forms={forms} isLoading={false} />);

    expect(screen.queryByTestId('forms-list-skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('Form 0')).toBeInTheDocument();
  });

  it('renders an error state in place of the skeleton when provided', () => {
    const forms = createForms(3);
    render(<FormsList forms={forms} isLoading error="Unable to load forms" />);

    expect(screen.queryByTestId('forms-list-skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('Unable to load forms')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pagination Boundaries
// ─────────────────────────────────────────────────────────────────────────────

describe('FormsList Pagination Boundaries', () => {
  it('renders the first page of forms', () => {
    const forms = createForms(15);
    render(<FormsList forms={forms} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(10);
  });

  it('handles load-more append behavior', () => {
    const forms = createForms(15);
    render(<FormsList forms={forms} />);
    const button = screen.getByText('Load More');
    fireEvent.click(button);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(15);
  });

  it('handles end-of-list behavior', () => {
    const forms = createForms(15);
    render(<FormsList forms={forms} />);
    const button = screen.getByText('Load More');
    fireEvent.click(button);
    expect(screen.queryByText('Load More')).not.toBeInTheDocument();
    expect(screen.getByText('End of list')).toBeInTheDocument();
  });

  it('handles reset-on-filter behavior', () => {
    const forms = createForms(25); // 13 Draft, 12 Published
    render(<FormsList forms={forms} />);
    const loadMoreButton = screen.getByText('Load More');
    fireEvent.click(loadMoreButton); // Load 20
    
    // Now switch filter
    const draftFilter = screen.getByText('Filter Draft');
    fireEvent.click(draftFilter);

    // Should reset page to 1, showing max 10 draft forms
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(10);
    expect(screen.getByText('Load More')).toBeInTheDocument(); // Because there are 13 draft forms in total
  });
});
