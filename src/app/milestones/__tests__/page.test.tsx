import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MilestonesPage from '../page';
import { listMilestones } from '@/lib/repository';
import type { Milestone } from '@/types/domain';

const mockSearchParams = {
  get: jest.fn(() => null),
  toString: jest.fn(() => ''),
};

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), prefetch: jest.fn() }),
}));

jest.mock('@/lib/repository', () => ({
  listMilestones: jest.fn(),
}));

const mockedListMilestones = jest.mocked(listMilestones);

const persistedMilestones: Milestone[] = [
  {
    id: 'repo-1',
    title: 'Repository Kickoff',
    status: 'Pending',
    payout: 1800,
    currency: 'USD',
    dueDate: '2026-07-01',
  },
  {
    id: 'repo-2',
    title: 'Repository Review',
    status: 'Completed',
    payout: 2200,
    currency: 'USD',
    dueDate: '2026-07-12',
  },
];

describe('MilestonesPage', () => {
  beforeEach(() => {
    mockedListMilestones.mockReturnValue([]);
    window.localStorage.clear();
    mockSearchParams.get.mockReturnValue(null);
  });

  afterEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('renders persisted milestones from the repository after client load', async () => {
    mockedListMilestones.mockReturnValue(persistedMilestones);

    render(<MilestonesPage />);

    expect((await screen.findAllByText('Repository Kickoff'))[0]).toBeInTheDocument();
    expect(screen.getByText('Repository Review')).toBeInTheDocument();
    expect(mockedListMilestones).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(screen.queryByText('Project Kickoff & Discovery')).not.toBeInTheDocument();
    });
  });

  it('falls back to the sample milestones when the repository is empty', async () => {
    render(<MilestonesPage />);

    expect(await screen.findByText('Project Kickoff & Discovery')).toBeInTheDocument();
    expect(screen.getByText('UI/UX Design Handoff')).toBeInTheDocument();
    expect(screen.getByText('Frontend Development – Sprint 1')).toBeInTheDocument();
    expect(screen.getByText('API Integration & Testing')).toBeInTheDocument();
    expect(screen.getByText('Payment Gateway Integration')).toBeInTheDocument();
  });

  it('filters persisted milestones and updates the live result count announcement', async () => {
    const user = userEvent.setup();
    mockedListMilestones.mockReturnValue(persistedMilestones);

    render(<MilestonesPage />);

    await waitFor(() => {
      expect(screen.getByText('Repository Review')).toBeInTheDocument();
    });

    const group = screen.getByRole('radiogroup', { name: /filter milestones by status/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();

    const allAnnouncement = await screen.findByText(/showing all 2 milestones/i);
    expect(allAnnouncement).toHaveAttribute('aria-live', 'polite');

    await user.click(screen.getByRole('radio', { name: 'Completed' }));

    await waitFor(() => {
      expect(screen.getByText('Repository Review')).toBeInTheDocument();
      expect(screen.queryByText('Repository Kickoff')).not.toBeInTheDocument();
      expect(screen.getByText(/showing 1 completed milestone/i)).toBeInTheDocument();
    });
  });

  it('shows the filter empty state when persisted milestones do not match the selected status', async () => {
    const user = userEvent.setup();
    mockedListMilestones.mockReturnValue(persistedMilestones);

    render(<MilestonesPage />);

    await waitFor(() => {
      expect(screen.getByText('Repository Review')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('radio', { name: 'Paid' }));

    await waitFor(() => {
      expect(screen.getByText('No milestones match this filter')).toBeInTheDocument();
      expect(
        screen.getByText(/there are no paid milestones at the moment/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/showing 0 paid milestones/i)).toBeInTheDocument();
    });
  });
});
