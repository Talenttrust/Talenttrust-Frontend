import React from 'react';
import { render, screen } from '@testing-library/react';
import ContractsPage from '../page';

describe('ContractsPage', () => {
  it('renders EmptyState when contracts array is empty', () => {
    render(<ContractsPage />);

    expect(screen.getByText('No contracts found')).toBeInTheDocument();
    expect(screen.getByText('You haven\'t created any contracts yet. Start by creating your first contract to begin freelancing securely.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Contract' })).toBeInTheDocument();
  });
});