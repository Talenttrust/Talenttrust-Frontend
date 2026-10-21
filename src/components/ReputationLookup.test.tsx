import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReputationLookup } from './ReputationLookup';

const ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

const response = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ReputationLookup', () => {
  it('does not fetch when the address is invalid', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ReputationLookup />);

    await user.type(screen.getByLabelText('Freelancer address'), 'not-a-stellar-address');
    await user.click(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('56 characters');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('looks up a valid address and renders the reputation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({ address: ACCOUNT, averageRating: 4.5, completedContracts: 3, totalRating: 14 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ReputationLookup />);

    await user.type(screen.getByLabelText('Freelancer address'), ACCOUNT.toLowerCase());
    await user.click(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByText('4.5 / 5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toContain(encodeURIComponent(ACCOUNT));
  });

  it('shows the backend message for a non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ message: 'Reputation not found' }, false, 404));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ReputationLookup />);

    await user.type(screen.getByLabelText('Freelancer address'), ACCOUNT);
    await user.click(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Reputation not found');
  });

  it('shows a network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ReputationLookup />);

    await user.type(screen.getByLabelText('Freelancer address'), ACCOUNT);
    await user.click(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('fetch failed');
  });

  it('handles an empty response body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({}));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<ReputationLookup />);

    await user.type(screen.getByLabelText('Freelancer address'), ACCOUNT);
    await user.click(screen.getByRole('button', { name: 'Look up' }));

    expect(await screen.findByText('No ratings')).toBeInTheDocument();
  });
});
