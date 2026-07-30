import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import MilestonesLoading from '../loading';
import MilestonesError from '../error';
import { setErrorReporter } from '@/lib/errorReporter';

describe('Milestones route states', () => {
  afterEach(() => {
    setErrorReporter(null);
    jest.restoreAllMocks();
  });

  it('announces the loading state while rendering milestone placeholders', () => {
    const { container } = render(<MilestonesLoading />);

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading milestones…');
    expect(screen.getByRole('region', { name: 'Loading milestones' })).toBeInTheDocument();
  });

  it('mirrors the full page layout: heading, filter bar, and list skeletons', () => {
    const { container } = render(<MilestonesLoading />);

    // Page heading skeleton — decorative, hidden from AT (the live-region
    // status text above already announces the loading state).
    const decorative = container.querySelectorAll('[aria-hidden="true"]');
    expect(decorative.length).toBeGreaterThan(0);
    decorative.forEach((el) => expect(el).toHaveAttribute('aria-hidden', 'true'));

    // Filter bar skeleton — 5 status pills + 1 result-count badge, all decorative.
    const filterBar = container.querySelectorAll(
      '.rounded-full.bg-slate-200',
    );
    expect(filterBar).toHaveLength(6);

    // List skeleton — the real MilestonesListSkeleton component.
    expect(screen.getByLabelText('Loading milestones')).toBeInTheDocument();
  });

  it('does not render a nested <main> landmark (layout already owns one)', () => {
    const { container } = render(<MilestonesLoading />);
    expect(container.querySelector('main')).not.toBeInTheDocument();
  });

  it('disables shimmer animation for prefers-reduced-motion', () => {
    const { container } = render(<MilestonesLoading />);
    const shimmering = container.querySelectorAll('.animate-shimmer');
    expect(shimmering.length).toBeGreaterThan(0);
    shimmering.forEach((el) =>
      expect(el).toHaveClass('motion-reduce:animate-none'),
    );
  });

  it('passes axe accessibility checks in the loading state', async () => {
    const { container } = render(<MilestonesLoading />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows a recoverable error state without exposing internal error details', async () => {
    const user = userEvent.setup();
    const reset = jest.fn();
    const error = new Error('Repository storage failed');
    const report = jest.fn();
    setErrorReporter(report);

    render(<MilestonesError error={error} reset={reset} />);

    expect(screen.getByRole('heading', { name: 'Unable to load milestones' })).toBeInTheDocument();
    expect(screen.queryByText('Repository storage failed')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(error, 'Milestones page', undefined, undefined);
  });
});
