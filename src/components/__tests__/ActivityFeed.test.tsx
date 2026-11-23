import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import 'vitest-axe/extend-expect';
import { decodeEvent, type ActivityEvent, type FetchEventsSinceResult } from '@/lib/stellar/events';
import { rawEvent } from '@/test/eventFixtures';

const { fetchEventsSince } = vi.hoisted(() => ({ fetchEventsSince: vi.fn() }));

vi.mock('@/lib/stellar/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stellar/events')>()),
  fetchEventsSince,
}));

import { ActivityFeed, ACTIVITY_POLL_MS, formatRelativeTime } from '@/components/ActivityFeed';

const NOW = Date.parse('2026-10-24T23:10:00Z');

const deposit = decodeEvent(
  rawEvent('deposit', { id: '0000000000000000020-0000000001', ledger: 20, ledgerClosedAt: '2026-10-24T23:05:00Z' }),
);
const created = decodeEvent(
  rawEvent('created', { id: '0000000000000000010-0000000001', ledger: 10, ledgerClosedAt: '2026-10-24T21:10:00Z' }),
);
const release = decodeEvent(
  rawEvent('release', { id: '0000000000000000030-0000000001', ledger: 30, ledgerClosedAt: '2026-10-24T23:09:30Z' }),
);

const items = () => within(screen.getByRole('list', { name: /recent on-chain activity/i })).getAllByRole('listitem');

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function flush() {
  for (let i = 0; i < 10; i++) await advance(0);
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('ActivityFeed', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, shouldAdvanceTime: false });
    fetchEventsSince.mockReset();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a skeleton until events load', async () => {
    let resolve: (result: FetchEventsSinceResult) => void = () => {};
    fetchEventsSince.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ActivityFeed />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading recent activity/i);

    await act(async () => resolve({ events: [deposit], cursor: 'c1' }));
    await vi.waitFor(() => expect(screen.queryByText(/loading recent activity/i)).not.toBeInTheDocument());
  });

  it('renders decoded events as a semantic ordered list with time and tx links', async () => {
    fetchEventsSince.mockResolvedValue({ events: [deposit, created], cursor: 'c1' });
    render(<ActivityFeed />);

    await vi.waitFor(() => expect(items()).toHaveLength(2));
    expect(fetchEventsSince).toHaveBeenCalledWith({ cursor: undefined, limit: 10 });
    expect(screen.getByRole('heading', { name: /recent on-chain activity/i })).toBeInTheDocument();
    expect(screen.getByRole('list').tagName).toBe('OL');

    const [first, second] = items();
    expect(first).toHaveTextContent('Escrow #4 funded with 150 XLM');
    expect(first).toHaveTextContent('5 minutes ago');
    expect(second).toHaveTextContent('2 hours ago');

    const time = first.querySelector('time');
    expect(time).toHaveAttribute('dateTime', '2026-10-24T23:05:00Z');

    const link = within(first).getByRole('link', { name: /view tx: escrow #4 funded with 150 xlm/i });
    expect(link).toHaveAttribute('href', `https://stellar.expert/explorer/testnet/tx/${deposit.txHash}`);
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows the empty state when there is no recent activity', async () => {
    fetchEventsSince.mockResolvedValue({ events: [] });
    render(<ActivityFeed />);

    await vi.waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No activity in the last 24h'));
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows a network error with a keyboard-operable retry', async () => {
    fetchEventsSince.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ events: [deposit], cursor: 'c1' });
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<ActivityFeed />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be reached/i);

    await user.tab();
    const retry = screen.getByRole('button', { name: 'Retry' });
    expect(retry).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(items()).toHaveLength(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports non-2xx RPC responses and retries with Space', async () => {
    fetchEventsSince
      .mockRejectedValueOnce(Object.assign(new Error('Request failed'), { response: { status: 503 } }))
      .mockResolvedValueOnce({ events: [] });
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<ActivityFeed />);

    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 503');
    act(() => screen.getByRole('button', { name: 'Retry' }).focus());
    await user.keyboard(' ');

    expect(await screen.findByText('No activity in the last 24h')).toBeInTheDocument();
  });

  it('shows an error for invalid input rejected by the decoder layer', async () => {
    fetchEventsSince.mockRejectedValueOnce(new RangeError('limit must be an integer between 1 and 100'));
    render(<ActivityFeed />);

    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('polls every 30s with the stored cursor, merges without duplicates, and highlights new events', async () => {
    fetchEventsSince
      .mockResolvedValueOnce({ events: [deposit, created], cursor: 'c1' })
      .mockResolvedValueOnce({ events: [release], cursor: 'c2' });
    render(<ActivityFeed />);
    await flush();
    expect(items()).toHaveLength(2);
    items().forEach((li) => expect(li).not.toHaveClass('activity-new'));
    expect(fetchEventsSince).toHaveBeenNthCalledWith(1, { cursor: undefined, limit: 10 });

    await advance(ACTIVITY_POLL_MS - 1);
    expect(fetchEventsSince).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fetchEventsSince).toHaveBeenCalledTimes(2);
    expect(fetchEventsSince).toHaveBeenNthCalledWith(2, { cursor: 'c1', limit: 10 });

    await flush();
    expect(items()).toHaveLength(3);
    const [first, second, third] = items();
    expect(first).toHaveTextContent('released milestone 1');
    expect(first).toHaveClass('activity-new');
    expect(second).not.toHaveClass('activity-new');
    expect(third).not.toHaveClass('activity-new');
    expect(screen.getAllByText('Escrow #4 funded with 150 XLM')).toHaveLength(1);
  });

  it('falls back to a full backfill when the RPC rejects an expired or invalid cursor', async () => {
    fetchEventsSince
      .mockResolvedValueOnce({ events: [deposit, created], cursor: 'expired-cursor' })
      .mockRejectedValueOnce(Object.assign(new Error('invalid cursor'), { code: -32602 }))
      .mockResolvedValueOnce({ events: [release, deposit, created], cursor: 'fresh-cursor' })
      .mockResolvedValueOnce({ events: [], cursor: 'fresh-cursor' });

    render(<ActivityFeed />);
    await flush();
    expect(items()).toHaveLength(2);

    await advance(ACTIVITY_POLL_MS);
    await flush();

    expect(fetchEventsSince).toHaveBeenCalledTimes(3);
    expect(fetchEventsSince).toHaveBeenNthCalledWith(2, { cursor: 'expired-cursor', limit: 10 });
    expect(fetchEventsSince).toHaveBeenNthCalledWith(3, { limit: 10 });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(items()).toHaveLength(3);
    expect(items()[0]).toHaveClass('activity-new');

    await advance(ACTIVITY_POLL_MS);
    await flush();
    expect(fetchEventsSince).toHaveBeenNthCalledWith(4, { cursor: 'fresh-cursor', limit: 10 });
  });

  it('keeps showing the last good data when a poll fails', async () => {
    fetchEventsSince
      .mockResolvedValueOnce({ events: [deposit], cursor: 'c1' })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<ActivityFeed />);
    await vi.waitFor(() => expect(items()).toHaveLength(1));

    await advance(ACTIVITY_POLL_MS);

    await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/last known activity/i));
    expect(items()).toHaveLength(1);
  });

  it('pauses polling while the page is hidden and refreshes when visible again', async () => {
    fetchEventsSince.mockResolvedValue({ events: [deposit], cursor: 'c1' });
    render(<ActivityFeed />);
    await vi.waitFor(() => expect(items()).toHaveLength(1));

    act(() => setVisibility('hidden'));
    await advance(ACTIVITY_POLL_MS * 3);
    expect(fetchEventsSince).toHaveBeenCalledTimes(1);

    act(() => setVisibility('visible'));
    await vi.waitFor(() => expect(fetchEventsSince).toHaveBeenCalledTimes(2));
  });

  it('waits until the feed scrolls into view before fetching, and pauses polling off screen', async () => {
    let notify: (isIntersecting: boolean) => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          notify = (isIntersecting) =>
            callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    fetchEventsSince.mockResolvedValue({ events: [deposit], cursor: 'c1' });
    try {
      const { unmount } = render(<ActivityFeed />);
      await advance(ACTIVITY_POLL_MS);
      expect(fetchEventsSince).not.toHaveBeenCalled();

      act(() => notify(true));
      await flush();
      expect(fetchEventsSince).toHaveBeenCalledTimes(1);
      expect(items()).toHaveLength(1);

      act(() => notify(false));
      await advance(ACTIVITY_POLL_MS * 3);
      expect(fetchEventsSince).toHaveBeenCalledTimes(1);

      act(() => notify(true));
      await flush();
      expect(fetchEventsSince).toHaveBeenCalledTimes(2);

      unmount();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('stops polling on unmount', async () => {
    fetchEventsSince.mockResolvedValue({ events: [] });
    const { unmount } = render(<ActivityFeed />);
    await vi.waitFor(() => expect(fetchEventsSince).toHaveBeenCalledTimes(1));
    unmount();
    await advance(ACTIVITY_POLL_MS * 2);
    expect(fetchEventsSince).toHaveBeenCalledTimes(1);
  });

  it('filters the feed by event type with aria-pressed toggles, without refetching', async () => {
    fetchEventsSince.mockResolvedValue({ events: [release, deposit, created], cursor: 'c1' });
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<ActivityFeed />);
    await screen.findByRole('group', { name: /filter activity by type/i });
    expect(items()).toHaveLength(3);

    const all = screen.getByRole('button', { name: 'All' });
    const deposits = screen.getByRole('button', { name: 'Deposits' });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(deposits).toHaveAttribute('aria-pressed', 'false');

    await user.click(deposits);
    expect(deposits).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveAttribute('aria-pressed', 'false');
    expect(items()).toHaveLength(1);
    expect(items()[0]).toHaveTextContent('funded with 150 XLM');
    expect(fetchEventsSince).toHaveBeenCalledTimes(1);
  });

  it('shows a specific message when a filter matches nothing', async () => {
    fetchEventsSince.mockResolvedValue({ events: [deposit], cursor: 'c1' });
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<ActivityFeed />);
    await screen.findByRole('group', { name: /filter activity by type/i });

    await user.click(screen.getByRole('button', { name: 'Disputes' }));
    expect(screen.getByRole('status')).toHaveTextContent('No disputes activity in the last 24h');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('applies the active filter to items arriving from a poll', async () => {
    fetchEventsSince
      .mockResolvedValueOnce({ events: [deposit], cursor: 'c1' })
      .mockResolvedValueOnce({ events: [release], cursor: 'c2' });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ActivityFeed />);
    await flush();

    await user.click(screen.getByRole('button', { name: 'Deposits' }));
    expect(items()).toHaveLength(1);

    await advance(ACTIVITY_POLL_MS);
    await flush();
    expect(fetchEventsSince).toHaveBeenCalledTimes(2);
    expect(items()).toHaveLength(1);
    expect(items()[0]).toHaveTextContent('funded with 150 XLM');
    expect(screen.queryByText(/released milestone 1/)).not.toBeInTheDocument();
  });

  it('has no axe violations with events or in the error state', async () => {
    fetchEventsSince.mockResolvedValueOnce({ events: [deposit, created], cursor: 'c1' });
    const { container, unmount } = render(<ActivityFeed />);
    await vi.waitFor(() => expect(items()).toHaveLength(2));
    vi.useRealTimers();
    expect(await axe(container)).toHaveNoViolations();
    unmount();

    fetchEventsSince.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const errorView = render(<ActivityFeed />);
    await vi.waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(await axe(errorView.container)).toHaveNoViolations();
  });
});

describe('formatRelativeTime', () => {
  it.each([
    ['2026-10-24T23:09:58Z', 'now'],
    ['2026-10-24T23:09:30Z', '30 seconds ago'],
    ['2026-10-24T22:10:00Z', '1 hour ago'],
    ['2026-10-23T23:10:00Z', 'yesterday'],
    ['not-a-date', ''],
  ])('formats %s', (iso, expected) => {
    expect(formatRelativeTime(iso, NOW, 'en')).toBe(expected);
  });
});
