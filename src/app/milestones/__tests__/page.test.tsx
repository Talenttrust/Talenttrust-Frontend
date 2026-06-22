import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MilestonesPageContent } from '../MilestonesPageContent';
import MilestonesPage from '../page';

describe('MilestonesPage', () => {
  it('renders the real milestones list by default', () => {
    render(<MilestonesPage />);

    expect(screen.getByRole('heading', { name: 'Milestones', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Scope sign-off')).toBeInTheDocument();
    expect(screen.getByText('Wallet integration')).toBeInTheDocument();
    expect(screen.getByText('Escrow release review')).toBeInTheDocument();
    expect(screen.getByText('Identity dispute follow-up')).toBeInTheDocument();
    expect(screen.queryByText('No milestones tracked')).not.toBeInTheDocument();
  });

  it('announces the default all-status result count', () => {
    render(<MilestonesPage />);

    const status = screen.getByText('Showing 4 milestones.');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('filters milestones by status', () => {
    render(<MilestonesPage />);

    fireEvent.click(screen.getByRole('radio', { name: 'Paid' }));

    expect(screen.getByText('Showing 1 paid milestone.')).toBeInTheDocument();
    expect(screen.getByText('Escrow release review')).toBeInTheDocument();
    expect(screen.queryByText('Scope sign-off')).not.toBeInTheDocument();
    expect(screen.queryByText('Wallet integration')).not.toBeInTheDocument();
    expect(screen.queryByText('Identity dispute follow-up')).not.toBeInTheDocument();
  });

  it('renders EmptyState when no milestones exist', () => {
    render(<MilestonesPageContent milestones={[]} />);

    expect(screen.getByText('No milestones tracked')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Track your progress by adding milestones to your contracts. Milestones help you stay organized and ensure timely delivery.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Milestone' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'All' })).not.toBeInTheDocument();
  });

  it('renders a no-results EmptyState and can reset to all milestones', () => {
    render(
      <MilestonesPageContent
        milestones={[
          {
            id: 'pending-review',
            title: 'Pending review',
            status: 'Pending',
            payout: 250,
            currency: 'USD',
          },
        ]}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Paid' }));

    expect(screen.getByText('Showing 0 paid milestones.')).toBeInTheDocument();
    expect(screen.getByText('No paid milestones')).toBeInTheDocument();
    expect(screen.queryByText('Pending review')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show all milestones' }));

    expect(screen.getByText('Showing 1 milestone.')).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });
});
