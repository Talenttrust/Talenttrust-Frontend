import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import MilestonesPage from '../page';
import { listMilestones, saveMilestone } from '@/lib/repository';
import { downloadMilestonesICS } from '@/lib/icsExport';
import type { Milestone } from '@/types/domain';

const mockSearchParams = {
  get: jest.fn(() => null),
  toString: jest.fn(() => ''),
};
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), prefetch: jest.fn() }),
}));

jest.mock('@/lib/repository', () => ({
  listMilestones: jest.fn(),
  saveMilestone: jest.fn(),
}));

jest.mock('@/lib/icsExport', () => ({
  downloadMilestonesICS: jest.fn(),
}));

const mockedListMilestones = jest.mocked(listMilestones);
const mockedSaveMilestone = jest.mocked(saveMilestone);
const mockedDownloadMilestonesICS = jest.mocked(downloadMilestonesICS);

const persisted: Milestone[] = [
  {
    id: 'kb-1',
    title: 'Keyboard Kickoff',
    status: 'Pending',
    payout: 1000,
    currency: 'USD',
    dueDate: '2026-07-25',
  },
];

async function renderMilestonesPage() {
  const result = render(<MilestonesPage />);
  await act(async () => {});
  return result;
}

beforeEach(() => {
  mockedListMilestones.mockReturnValue(persisted);
  mockedSaveMilestone.mockImplementation(() => {});
  mockSearchParams.get.mockReturnValue(null);
  mockSearchParams.toString.mockReturnValue('');
  mockReplace.mockReset();
  mockedDownloadMilestonesICS.mockReset();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('milestones keyboard shortcuts', () => {
  it('renders discoverable hints for the shortcuts', async () => {
    await renderMilestonesPage();

    expect(screen.getByLabelText('Ctrl+Shift+N — add milestone')).toBeInTheDocument();
    expect(screen.getByLabelText('Ctrl+Shift+C — add to calendar')).toBeInTheDocument();
  });

  it('Ctrl+Shift+C downloads the calendar file', async () => {
    await renderMilestonesPage();

    fireEvent.keyDown(document, { key: 'c', ctrlKey: true, shiftKey: true });

    expect(mockedDownloadMilestonesICS).toHaveBeenCalledTimes(1);
    expect(mockedDownloadMilestonesICS).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'kb-1' })]),
    );
  });

  it('Meta+Shift+C (Mac) also downloads the calendar file', async () => {
    await renderMilestonesPage();

    fireEvent.keyDown(document, { key: 'c', metaKey: true, shiftKey: true });

    expect(mockedDownloadMilestonesICS).toHaveBeenCalledTimes(1);
  });

  it('plain Ctrl+C (no Shift) does not trigger the shortcut — avoids clashing with copy', async () => {
    await renderMilestonesPage();

    fireEvent.keyDown(document, { key: 'c', ctrlKey: true, shiftKey: false });

    expect(mockedDownloadMilestonesICS).not.toHaveBeenCalled();
  });

  it('is ignored while the sort control has focus', async () => {
    await renderMilestonesPage();

    const sortSelect = screen.getByLabelText(/sort milestones/i);
    sortSelect.focus();

    fireEvent.keyDown(sortSelect, { key: 'c', ctrlKey: true, shiftKey: true });

    expect(mockedDownloadMilestonesICS).not.toHaveBeenCalled();
  });
});
