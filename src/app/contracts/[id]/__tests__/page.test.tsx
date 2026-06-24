import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import ContractDetailPage from '../page';

// Mock next/navigation so notFound() throws a known sentinel.
jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
}));

describe('ContractDetailPage', () => {
  it('renders the contract overview and action panel for a valid id', async () => {
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

  it('keeps the "Back to contracts" link for a valid id', async () => {
    const params = Promise.resolve({ id: 'contract-42' });
    const Component = await ContractDetailPage({ params });
    render(Component);

    expect(screen.getByRole('link', { name: /back to contracts/i })).toHaveAttribute('href', '/contracts');
  });

  it.each([
    ['empty string', ''],
    ['path traversal', '../admin'],
    ['script tag', '<script>alert(1)</script>'],
    ['oversized', 'a'.repeat(65)],
    ['special chars', 'id#1!'],
  ])('calls notFound() for invalid id: %s', async (_label, id) => {
    const params = Promise.resolve({ id });
    await expect(ContractDetailPage({ params })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
