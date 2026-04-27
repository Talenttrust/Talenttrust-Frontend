import React from 'react';
import { render, screen } from '@testing-library/react';
import ContractDetailPage from '../page';

describe('ContractDetailPage', () => {
  it('renders the contract overview and action panel', () => {
    const params = { id: '123' };
    render(<ContractDetailPage params={params} />);

    expect(screen.getByText('Contract #123')).toBeInTheDocument();
    expect(screen.getByText('Contract Summary')).toBeInTheDocument();
    expect(screen.getByText('Milestones')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit milestone/i })).toBeInTheDocument();
  });
});
