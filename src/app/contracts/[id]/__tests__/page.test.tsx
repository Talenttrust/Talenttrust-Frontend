import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ContractDetailPage from '../page';

describe('ContractDetailPage', () => {
  it('renders the contract overview and action panel', async () => {
    // For async server components, we need to await the component render
    const params = Promise.resolve({ id: '123' });
    const Component = await ContractDetailPage({ params });
    render(Component);

    await waitFor(() => {
      expect(screen.getByText('Contract #123')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Contract Summary')).toBeInTheDocument();
    expect(screen.getByText('Milestones')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit milestone/i })).toBeInTheDocument();
  });
});
