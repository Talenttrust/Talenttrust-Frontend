import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReputationLookup } from '@/components/ReputationLookup';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('ReputationLookup', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a successful reputation result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ address: 'G', completedContracts: 2, totalRating: 9, averageRating: 4.5 })));
    render(<ReputationLookup />);
    await userEvent.click(screen.getByRole('button', { name: /look up/i }));
    expect(await screen.findByText('4.5 / 5')).toBeInTheDocument();
  });

  it('shows friendly copy for a 404 without raw fetch text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'contract_not_found', message: 'missing' }, 404)));
    render(<ReputationLookup />);
    await userEvent.click(screen.getByRole('button', { name: /look up/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be found/i);
    expect(alert.textContent ?? '').not.toMatch(/Failed to fetch/);
  });

  it('does not overwrite a newer result with a stale response', async () => {
    let resolveSlow: (r: Response) => void = () => {};
    const slow = new Promise<Response>((resolve) => {
      resolveSlow = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(slow)
      .mockResolvedValueOnce(json({ address: 'G', completedContracts: 1, totalRating: 5, averageRating: 5 }));
    vi.stubGlobal('fetch', fetchMock);

    render(<ReputationLookup />);
    const input = screen.getByLabelText('Freelancer address') as HTMLInputElement;
    const form = input.closest('form') as HTMLFormElement;

    // Request A (slow)
    fireEvent.change(input, { target: { value: 'GAAA' } });
    fireEvent.submit(form);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Request B (fast, newer) — aborts A
    fireEvent.change(input, { target: { value: 'GBBB' } });
    fireEvent.submit(form);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(await screen.findByText('5 / 5')).toBeInTheDocument();

    // Late stale response from A arrives — must not replace B's result.
    resolveSlow(json({ address: 'GAAA', completedContracts: 99, totalRating: 99, averageRating: 1 }));
    await waitFor(() => expect(screen.getByText('5 / 5')).toBeInTheDocument());
    expect(screen.queryByText('1 / 5')).not.toBeInTheDocument();
  });
});
