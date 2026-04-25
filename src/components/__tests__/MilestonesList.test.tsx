import React from 'react';
import { render, screen } from '@testing-library/react';
import MilestonesList from '../MilestonesList';

describe('MilestonesList', () => {
  it('renders each milestone item with status and payout', () => {
    render(
      <MilestonesList
        milestones={[
          { id: '1', title: 'Milestone 1', status: 'Pending', payout: 500, currency: 'USD', dueDate: 'May 10, 2026' },
          { id: '2', title: 'Milestone 2', status: 'Completed', payout: 1000, currency: 'USD', dueDate: 'Jun 1, 2026' },
        ]}
      />
    );

    expect(screen.getByText('Milestone 1')).toBeInTheDocument();
    expect(screen.getByText('Milestone 2')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
    expect(screen.getByText('$1,000.00')).toBeInTheDocument();
  });
});
