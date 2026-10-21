import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EscrowDashboard } from './EscrowDashboard';

const ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const SECOND_ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV';

const response = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('EscrowDashboard', () => {
  it('blocks creation when client and freelancer are the same address', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<EscrowDashboard />);

    await screen.findByText('No escrows yet. Create the first one.');
    await user.type(screen.getByLabelText('Client address'), ACCOUNT);
    await user.type(screen.getByLabelText('Freelancer address'), ACCOUNT);
    await user.click(screen.getByRole('button', { name: 'Create escrow' }));

    expect(await screen.findByText('Client and freelancer must be different addresses.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });

  it('does not call the API when the freelancer address is invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<EscrowDashboard />);

    await screen.findByText('No escrows yet. Create the first one.');
    await user.type(screen.getByLabelText('Client address'), ACCOUNT);
    await user.type(screen.getByLabelText('Freelancer address'), ACCOUNT.slice(0, -1));
    await user.click(screen.getByRole('button', { name: 'Create escrow' }));

    expect(await screen.findByText('Stellar addresses must be 56 characters long.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });

  it('submits normalised addresses for valid input', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<EscrowDashboard />);

    await screen.findByText('No escrows yet. Create the first one.');
    await user.type(screen.getByLabelText('Client address'), ACCOUNT.toLowerCase());
    await user.type(screen.getByLabelText('Freelancer address'), SECOND_ACCOUNT);
    await user.click(screen.getByRole('button', { name: 'Create escrow' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
      expect(post).toBeDefined();
      const body = JSON.parse((post?.[1] as RequestInit).body as string);
      expect(body.client).toBe(ACCOUNT);
      expect(body.freelancer).toBe(SECOND_ACCOUNT);
    });
  });
});
