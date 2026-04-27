import React from 'react';
import { render, screen } from '@testing-library/react';
import MilestonesPage from '../page';

describe('MilestonesPage', () => {
  it('renders EmptyState when milestones array is empty', () => {
    render(<MilestonesPage />);

    expect(screen.getByText('No milestones tracked')).toBeInTheDocument();
    expect(screen.getByText('Track your progress by adding milestones to your contracts. Milestones help you stay organized and ensure timely delivery.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Milestone' })).toBeInTheDocument();
  });
});