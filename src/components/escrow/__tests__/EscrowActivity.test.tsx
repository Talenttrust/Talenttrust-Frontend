import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { decodeEvent } from '@/lib/stellar/events';
import { rawEvent } from '@/test/eventFixtures';

const { fetchEscrowEvents } = vi.hoisted(() => ({ fetchEscrowEvents: vi.fn() }));

vi.mock('@/lib/stellar/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stellar/events')>()),
  fetchEscrowEvents,
}));

import { EscrowActivity } from '../EscrowActivity';

const created = decodeEvent(rawEvent('created', { ledger: 10, id: '10-1' }));
const deposit = decodeEvent(rawEvent('deposit', { ledger: 20, id: '20-1' }));

describe('EscrowActivity', () => {
  beforeEach(() => {
    fetchEscrowEvents.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows a loading state while events are fetched', async () => {
    fetchEscrowEvents.mockReturnValue(new Promise(() => {}));
    render(<EscrowActivity escrowId={4} />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading on-chain activity/i);
    await waitFor(() => expect(fetchEscrowEvents).toHaveBeenCalledWith(4));
  });

  it('renders the populated timeline oldest first with transaction links', async () => {
    fetchEscrowEvents.mockResolvedValue([created, deposit]);
    render(<EscrowActivity escrowId={4} />);

    const list = await screen.findByRole('list', { name: /on-chain activity for escrow #4/i });
    const items = screen.getAllByRole('listitem');
    expect(list.tagName).toBe('OL');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Escrow #4 created for 300 XLM');
    expect(items[1]).toHaveTextContent('Escrow #4 funded with 150 XLM');

    const links = screen.getAllByRole('link', { name: /view transaction/i });
    expect(links[0]).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/testnet/tx/${created.txHash}`,
    );
    expect(links[1]).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/testnet/tx/${deposit.txHash}`,
    );
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', 'noreferrer');
  });

  it('shows an empty state when the escrow has no events', async () => {
    fetchEscrowEvents.mockResolvedValue([]);
    render(<EscrowActivity escrowId={7} />);

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/no on-chain activity for this escrow/i),
    );
  });

  it('shows an error state and retries the failed request', async () => {
    fetchEscrowEvents.mockRejectedValueOnce(new Error('RPC down'));
    const user = userEvent.setup();
    render(<EscrowActivity escrowId={4} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn't load the activity/i);
    expect(alert).toHaveTextContent('RPC down');

    fetchEscrowEvents.mockResolvedValueOnce([deposit]);
    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(screen.getByText('Escrow #4 funded with 150 XLM')).toBeInTheDocument());
    expect(fetchEscrowEvents).toHaveBeenCalledTimes(2);
  });

  it('reports an HTTP status from the RPC in the error state', async () => {
    fetchEscrowEvents.mockRejectedValue(Object.assign(new Error('failed'), { response: { status: 503 } }));
    render(<EscrowActivity escrowId={4} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/HTTP 503/i);
  });

  it('rejects an invalid escrow id without calling the RPC', async () => {
    render(<EscrowActivity escrowId={0} />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid escrow id/i);
    expect(fetchEscrowEvents).not.toHaveBeenCalled();
  });
});
