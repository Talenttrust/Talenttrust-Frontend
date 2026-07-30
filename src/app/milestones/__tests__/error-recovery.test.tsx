import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MilestonesPage from '../page';
import { ToastProvider } from '@/components/toast/toast-provider';
import * as repository from '@/lib/repository';

jest.mock('@/lib/repository', () => ({
  listMilestones: jest.fn(),
  upsertMilestone: jest.fn(),
  getMilestoneVersion: jest.fn(() => 0),
  deleteMilestones: jest.fn(() => 0),
}));

const mockedUpsertMilestone = jest.mocked(repository.upsertMilestone);
const mockedListMilestones = jest.mocked(repository.listMilestones);

// Required navigation mocks
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), prefetch: jest.fn() }),
}));

// We need to mock useCopyToClipboard because MilestoneRow uses it
jest.mock('@/hooks/useCopyToClipboard', () => ({
  useCopyToClipboard: () => ({
    copied: false,
    copy: jest.fn(),
  }),
}));

describe('Milestones error-recovery flows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    mockedListMilestones.mockReturnValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('drives milestone creation into an error state, dismiss clears the toast', async () => {
    const user = userEvent.setup();
    mockedUpsertMilestone.mockReturnValue({ success: false, stale: false });

    render(
      <ToastProvider>
        <MilestonesPage />
      </ToastProvider>
    );

    // Click add milestone
    const addBtn = screen.getAllByRole('button', { name: /add milestone/i })[0];
    await user.click(addBtn);

    // Fill form
    await user.type(screen.getByLabelText(/title/i), 'Dismiss Test');
    await user.type(screen.getByLabelText(/payout amount/i), '100');
    
    // Submit (fails)
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^add milestone$/i }));

    // Assert error toast appears
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to create milestone');

    // Dismiss the toast
    const dismissBtn = screen.getByRole('button', { name: /dismiss error notification/i });
    await user.click(dismissBtn);

    // Assert the toast is cleared
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    
    // Original form input should be lost since the form closed
    expect(screen.queryByText('Dismiss Test')).not.toBeInTheDocument();
  });

  it('drives milestone creation into an error state, retry recovers and saves it', async () => {
    const user = userEvent.setup();
    // First save fails
    mockedUpsertMilestone.mockReturnValueOnce({ success: false, stale: false });

    render(
      <ToastProvider>
        <MilestonesPage />
      </ToastProvider>
    );

    // Click add milestone
    const addBtn = screen.getAllByRole('button', { name: /add milestone/i })[0];
    await user.click(addBtn);

    // Fill form
    await user.type(screen.getByLabelText(/title/i), 'Retry Milestone');
    await user.type(screen.getByLabelText(/payout amount/i), '250');
    
    // Submit (fails first time)
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^add milestone$/i }));

    // Assert error toast appears and has a retry button
    const retryBtn = await screen.findByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();

    // Setup success for retry
    mockedUpsertMilestone.mockReturnValueOnce({ success: true, stale: false });

    // Click retry directly from the toast
    await user.click(retryBtn);

    // Assert milestone is added successfully and toast is cleared
    await waitFor(() => {
      expect(screen.getByText('Retry Milestone')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('drives inline milestone update into an error state, retry recovers it', async () => {
    const user = userEvent.setup();
    const existingMilestone = {
      id: 'update-1',
      title: 'Initial Update Test',
      status: 'Pending' as const,
      payout: 500,
      currency: 'USD',
    };
    mockedListMilestones.mockReturnValue([existingMilestone]);
    // First update fails
    mockedUpsertMilestone.mockReturnValueOnce({ success: false, stale: false });

    render(
      <ToastProvider>
        <MilestonesPage />
      </ToastProvider>
    );

    // Enter edit mode
    const editBtn = await screen.findByRole('button', { name: /edit milestone/i });
    await user.click(editBtn);

    // Change title
    const titleInput = screen.getByRole('textbox', { name: /^title/i });
    await user.clear(titleInput);
    await user.type(titleInput, 'Recovered Title');

    // Save (fails)
    const saveBtn = screen.getByRole('button', { name: /save/i });
    await user.click(saveBtn);

    // Wait for error toast
    const retryBtn = await screen.findByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();

    // Mock success on retry
    mockedUpsertMilestone.mockReturnValueOnce({ success: true, stale: false });

    // Click retry on the toast
    await user.click(retryBtn);

    // Assert update succeeds
    await waitFor(() => {
      expect(screen.getByText('Recovered Title')).toBeInTheDocument();
    });
  });
});
