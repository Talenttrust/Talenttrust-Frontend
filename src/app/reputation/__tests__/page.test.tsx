import React from 'react';
import { render, screen } from '@testing-library/react';
import ReputationPage from '../page';

describe('ReputationPage', () => {
  it('renders EmptyState when reputation array is empty', () => {
    render(<ReputationPage />);

    expect(screen.getByText('No reputation yet')).toBeInTheDocument();
    expect(screen.getByText('Your reputation will be built as you complete contracts and receive feedback from clients. Start by creating and fulfilling your first contract.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});