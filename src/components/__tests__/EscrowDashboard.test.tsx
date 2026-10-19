import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EscrowDashboard } from '../EscrowDashboard';
import * as apiModule from '@/lib/api';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    api: vi.fn(),
  };
});

const mockContracts: apiModule.EscrowContract[] = [
  {
    id: 4,
    title: 'Website redesign',
    client: 'GCLIENT123456789012345678901234567890123456789012345678',
    freelancer: 'GFREELANCER123456789012345678901234567890123456789012',
    token: 'XLM',
    totalAmount: 1000,
    fundedAmount: 1000,
    releasedAmount: 300,
    status: 'Funded',
    reputationIssued: false,
    milestones: [
      { index: 0, title: 'Design', amount: 300, released: true },
      { index: 1, title: 'Build', amount: 700, released: false },
    ],
  },
];

describe('EscrowDashboard Heading Hierarchy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders strictly hierarchical h2 sections for Create escrow and Your escrows', async () => {
    vi.mocked(apiModule.api).mockResolvedValueOnce({ data: mockContracts });
    render(<EscrowDashboard />);

    expect(await screen.findByRole('heading', { level: 2, name: /create escrow/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /your escrows/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /new escrow/i })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 3, name: /#4 website redesign/i })).toBeInTheDocument();
  });
});

describe('EscrowDashboard Live Announcements & Actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('announces pending and completion states for milestone release', async () => {
    const user = userEvent.setup();
    vi.mocked(apiModule.api)
      .mockResolvedValueOnce({ data: mockContracts }) // initial load
      .mockResolvedValueOnce({}) // release POST
      .mockResolvedValueOnce({ data: mockContracts }); // reload

    render(<EscrowDashboard />);
    const releaseBtn = await screen.findByRole('button', { name: /release next milestone for escrow #4/i });
    const liveRegion = screen.getByTestId('escrow-live-announcer');

    await user.click(releaseBtn);

    await waitFor(() => {
      expect(liveRegion).toHaveTextContent(/milestone released/i);
    });
  });

  it('announces pending and completion states for creating escrow', async () => {
    const user = userEvent.setup();
    vi.mocked(apiModule.api)
      .mockResolvedValueOnce({ data: [] }) // initial load (empty)
      .mockResolvedValueOnce({ id: 5 }) // create POST
      .mockResolvedValueOnce({ data: mockContracts }); // reload

    render(<EscrowDashboard />);
    await screen.findByText(/no escrows yet/i);

    const submitBtn = screen.getByRole('button', { name: /create escrow/i });
    const liveRegion = screen.getByTestId('escrow-live-announcer');

    await user.click(submitBtn);

    await waitFor(() => {
      expect(liveRegion).toHaveTextContent(/escrow created/i);
    });
  });

  it('announces error in live region when action fails', async () => {
    const user = userEvent.setup();
    vi.mocked(apiModule.api)
      .mockResolvedValueOnce({ data: mockContracts }) // initial load
      .mockRejectedValueOnce(new Error('Network timeout during deposit')); // fund failure

    render(<EscrowDashboard />);
    const cancelBtn = await screen.findByRole('button', { name: /cancel escrow #4/i });
    const liveRegion = screen.getByTestId('escrow-live-announcer');

    await user.click(cancelBtn);

    await waitFor(() => {
      expect(liveRegion).toHaveTextContent(/error: network timeout during deposit/i);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/network timeout during deposit/i);
  });
});

describe('EscrowDashboard Empty and Error States', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders friendly empty state when contracts array is empty', async () => {
    vi.mocked(apiModule.api).mockResolvedValueOnce({ data: [] });
    render(<EscrowDashboard />);

    expect(await screen.findByText(/no escrows yet\. create the first one\./i)).toBeInTheDocument();
  });

  it('renders error alert when initial API call fails', async () => {
    vi.mocked(apiModule.api).mockRejectedValueOnce(new Error('Connection refused (503)'));
    render(<EscrowDashboard />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not reach the api: connection refused \(503\)/i);
  });
});
