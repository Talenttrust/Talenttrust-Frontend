import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { EscrowDashboard } from '@/components/EscrowDashboard';
import type { EscrowContract } from '@/lib/api';

const contract: EscrowContract = {
  id: 7,
  title: 'Website redesign',
  client: 'GCLIENT' + 'X'.repeat(49),
  freelancer: 'GFREELANCER' + 'Y'.repeat(45),
  token: 'XLM',
  milestones: [{ index: 0, title: 'Design', amount: 300, released: false }],
  totalAmount: 1000,
  fundedAmount: 600,
  releasedAmount: 300,
  status: 'Funded',
  reputationIssued: false,
};

const json = (data: unknown, ok = true, status = 200) => ({ ok, status, json: async () => data });

let fetchMock: ReturnType<typeof vi.fn>;

const renderDashboard = () =>
  render(
    <ConfirmProvider>
      <EscrowDashboard />
    </ConfirmProvider>,
  );

const isContractsList = (input: unknown, init?: RequestInit) =>
  String(input).includes('/api/v1/contracts') && (init?.method ?? 'GET') === 'GET';

const isCancel = (input: unknown, init?: RequestInit) =>
  String(input).includes('/cancel') && init?.method === 'POST';

const cancelCalls = () =>
  fetchMock.mock.calls.filter(([input, init]) => isCancel(input, init as RequestInit | undefined));

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EscrowDashboard cancel confirmation', () => {
  it('makes no API call when the dialog is dismissed without confirming', async () => {
    fetchMock.mockImplementation((input, init) =>
      isContractsList(input, init) ? Promise.resolve(json({ data: [contract] })) : Promise.resolve(json({}, false, 404)),
    );
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Keep escrow' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(cancelCalls()).toHaveLength(0);
  });

  it('makes no API call when the dialog is closed with Escape', async () => {
    fetchMock.mockImplementation((input, init) =>
      isContractsList(input, init) ? Promise.resolve(json({ data: [contract] })) : Promise.resolve(json({}, false, 404)),
    );
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    expect(cancelCalls()).toHaveLength(0);
  });

  it('requires exact text and makes exactly one API call once confirmed', async () => {
    fetchMock.mockImplementation((input, init) => {
      if (isCancel(input, init)) return Promise.resolve(json({ data: {} }));
      if (isContractsList(input, init)) return Promise.resolve(json({ data: [contract] }));
      return Promise.resolve(json({}, false, 404));
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await screen.findByRole('dialog');

    const confirmButton = screen.getByRole('button', { name: 'Cancel escrow' });
    const input = screen.getByLabelText(/type 7 to confirm/i);
    await user.type(input, '8');
    expect(confirmButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, '7');
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);

    await waitFor(() => expect(cancelCalls()).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(cancelCalls()).toHaveLength(1);
  });

  it('shows an error when the cancel request fails on the network', async () => {
    fetchMock.mockImplementation((input, init) => {
      if (isCancel(input, init)) return Promise.reject(new TypeError('Failed to fetch'));
      if (isContractsList(input, init)) return Promise.resolve(json({ data: [contract] }));
      return Promise.resolve(json({}, false, 404));
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await screen.findByRole('dialog');
    await user.type(screen.getByLabelText(/type 7 to confirm/i), '7');
    await user.click(screen.getByRole('button', { name: 'Cancel escrow' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch');
  });

  it('shows the API message on a non-2xx cancel response', async () => {
    fetchMock.mockImplementation((input, init) => {
      if (isCancel(input, init)) return Promise.resolve(json({ message: 'Escrow already cancelled' }, false, 400));
      if (isContractsList(input, init)) return Promise.resolve(json({ data: [contract] }));
      return Promise.resolve(json({}, false, 404));
    });
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await screen.findByRole('dialog');
    await user.type(screen.getByLabelText(/type 7 to confirm/i), '7');
    await user.click(screen.getByRole('button', { name: 'Cancel escrow' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Escrow already cancelled');
  });

  it('renders the empty state when there are no escrows', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ data: [] })));
    renderDashboard();

    expect(await screen.findByText('No escrows yet. Create the first one.')).toBeInTheDocument();
  });

  it('reports a network error while loading escrows', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the API: Failed to fetch');
  });
});
