import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsProvider } from '@/components/NotificationsProvider';
import { ApiError, type EscrowContract } from '@/lib/api';

const hook = vi.hoisted(() => ({ useContract: vi.fn() }));

vi.mock('@/hooks/useContracts', () => ({ useContract: hook.useContract }));
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { EscrowOverview } from '../EscrowOverview';

const contract: EscrowContract = {
  id: 42,
  title: 'Website redesign',
  client: 'GCLIENT',
  freelancer: 'GFREELANCER',
  token: 'XLM',
  milestones: [{ index: 0, title: 'Design', amount: 100, released: false }],
  totalAmount: 100,
  fundedAmount: 100,
  releasedAmount: 25,
  status: 'Disputed',
  reputationIssued: false,
  dispute: {
    raisedBy: 'GCLIENT',
    reason: 'The delivered design did not match the agreed scope.',
    openedAt: '2026-01-02T10:00:00.000Z',
    freelancerBps: 5000,
  },
};

const renderOverview = () =>
  render(
    <NotificationsProvider
      poller={{
        intervalMs: 60_000,
        fetchContract: async () => contract,
        setIntervalFn: (() => 0) as never,
        clearIntervalFn: () => {},
      }}
    >
      <EscrowOverview id={contract.id} />
    </NotificationsProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  hook.useContract.mockReset();
});

describe('EscrowOverview', () => {
  it('shows contract details, payment progress, milestones, watch control, and related links', () => {
    hook.useContract.mockReturnValue({
      contract,
      error: null,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    renderOverview();

    expect(screen.getByRole('heading', { name: 'Website redesign' })).toBeInTheDocument();
    expect(screen.getByText('Disputed')).toBeInTheDocument();
    expect(screen.getByText(/100 \/ 100 XLM \(100%\)/)).toBeInTheDocument();
    expect(screen.getByText(/25 \/ 100 XLM \(25%\)/)).toBeInTheDocument();
    expect(screen.getByText(/the delivered design did not match the agreed scope/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy client address' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Watch escrow 42' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View statement' })).toHaveAttribute(
      'href',
      '/contracts/42/statement',
    );
    expect(screen.getByRole('link', { name: 'On-chain actions' })).toHaveAttribute(
      'href',
      '/contracts/onchain/42',
    );
  });

  it('shows a friendly not-found state for API 404 errors', () => {
    hook.useContract.mockReturnValue({
      contract: null,
      error: new ApiError({ kind: 'http', status: 404, message: 'Not found' }),
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });

    renderOverview();

    expect(screen.getByRole('heading', { name: 'Escrow not found' })).toBeInTheDocument();
    expect(screen.getByText(/may have been removed/i)).toBeInTheDocument();
  });

  it('shows other errors and retries the failed request', async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);
    hook.useContract.mockReturnValue({
      contract: null,
      error: new ApiError({ kind: 'network', message: 'Network unavailable' }),
      isLoading: false,
      isValidating: false,
      mutate,
    });

    renderOverview();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(screen.getByRole('heading', { name: 'Could not load escrow' })).toBeInTheDocument();
    expect(mutate).toHaveBeenCalledOnce();
  });
});
