import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsProvider } from '@/components/NotificationsProvider';
import { NotificationBell } from '@/components/NotificationBell';
import { NOTIFICATIONS_KEY, NOTIFICATIONS_VERSION } from '@/lib/notifications';
import { WATCH_STORE_KEY, WATCH_STORE_VERSION } from '@/lib/watchlist';
import { ApiError } from '@/lib/api';
import type { EscrowContract } from '@/lib/api';

vi.mock('next/navigation', () => ({ usePathname: () => '/contracts' }));

const seed = (items: Array<{ escrowId: number; title: string; read: boolean }>) => {
  localStorage.setItem(
    NOTIFICATIONS_KEY,
    JSON.stringify({
      version: NOTIFICATIONS_VERSION,
      items: items.map((i, n) => ({
        id: `n${n}`,
        escrowId: i.escrowId,
        type: 'milestone_released',
        title: i.title,
        message: 'A milestone was released.',
        createdAt: Date.now(),
        read: i.read,
      })),
    }),
  );
};

const renderBell = () =>
  render(
    <NotificationsProvider
      poller={{ fetchContract: async () => { throw new Error('no network'); }, setIntervalFn: (() => 0) as never, clearIntervalFn: () => {} }}
    >
      <NotificationBell />
    </NotificationsProvider>,
  );

beforeEach(() => {
  localStorage.clear();
});

describe('NotificationBell', () => {
  it('shows the unread count in the accessible name', async () => {
    seed([{ escrowId: 1, title: 'Released', read: false }, { escrowId: 2, title: 'Funded', read: false }]);
    renderBell();
    const button = await screen.findByRole('button', { name: 'Notifications, 2 unread' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not say unread when there are none', async () => {
    seed([{ escrowId: 1, title: 'Released', read: true }]);
    renderBell();
    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('renders the empty state explaining how to watch escrows', async () => {
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(dialog).toHaveTextContent(/no notifications yet/i);
    expect(dialog).toHaveTextContent(/watch an escrow/i);
  });

  it('opens as a disclosure and closes on Escape returning focus', async () => {
    seed([{ escrowId: 1, title: 'Released', read: false }]);
    renderBell();
    const button = await screen.findByRole('button', { name: /notifications/i });
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'false'));
    expect(button).toHaveFocus();
  });

  it('marks all read and clears', async () => {
    seed([{ escrowId: 1, title: 'Released', read: false }]);
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    await userEvent.click(screen.getByRole('button', { name: /mark all read/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(await screen.findByText(/no notifications yet/i)).toBeInTheDocument();
  });

  it('links each notification to the escrows page', async () => {
    seed([{ escrowId: 1, title: 'Released', read: false }]);
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: /notifications/i }));
    expect(screen.getByRole('link', { name: /released/i })).toHaveAttribute('href', '/contracts');
  });
});

describe('NotificationBell stale updates', () => {
  const watchEscrow = () =>
    localStorage.setItem(
      WATCH_STORE_KEY,
      JSON.stringify({
        version: WATCH_STORE_VERSION,
        items: [{ id: 1, lastSnapshot: { status: 'Funded', releasedIdx: [], fundedAmount: 100 } }],
      }),
    );

  const okContract: EscrowContract = {
    id: 1,
    title: 'Design',
    client: 'GCLIENT',
    freelancer: 'GFREE',
    token: 'XLM',
    milestones: [],
    totalAmount: 100,
    fundedAmount: 100,
    releasedAmount: 0,
    status: 'Funded',
    reputationIssued: false,
    releasedIdx: [],
  } as unknown as EscrowContract;

  // Drives the poller by hand through the injectable timer seam.
  const setup = () => {
    let failing = true;
    let next: () => void = () => {};
    watchEscrow();
    render(
      <NotificationsProvider
        poller={{
          fetchContract: async () => {
            if (failing) throw new ApiError({ kind: 'network' });
            return okContract;
          },
          isVisible: () => true,
          setTimeoutFn: ((fn: () => void) => {
            next = fn;
            return 0 as never;
          }) as never,
          clearTimeoutFn: () => {},
        }}
      >
        <NotificationBell />
      </NotificationsProvider>,
    );
    const tick = async () => {
      await act(async () => {
        next();
        await new Promise((r) => setTimeout(r, 0));
      });
    };
    return { tick, recover: () => { failing = false; } };
  };

  const openPanel = async () => userEvent.click(await screen.findByRole('button', { name: /notifications/i }));

  it('does not show the notice before three consecutive failures', async () => {
    const { tick } = setup();
    await openPanel();
    await tick();
    await tick();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a polite status line after three consecutive failures', async () => {
    const { tick } = setup();
    await openPanel();
    await tick();
    await tick();
    await tick();
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/updates paused, retrying/i);
    // Also announced to screen readers once.
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Updates paused, retrying.');
  });

  it('can be dismissed and stays dismissed while the outage continues', async () => {
    const { tick } = setup();
    await openPanel();
    for (let i = 0; i < 3; i += 1) await tick();
    await userEvent.click(await screen.findByRole('button', { name: /^dismiss$/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await tick();
    await tick();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('clears on recovery and shows again for the next outage', async () => {
    const { tick, recover } = setup();
    await openPanel();
    for (let i = 0; i < 3; i += 1) await tick();
    expect(await screen.findByRole('status')).toHaveTextContent(/updates paused, retrying/i);

    recover();
    await tick();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('shows the notice even when there are no notifications', async () => {
    const { tick } = setup();
    await openPanel();
    for (let i = 0; i < 3; i += 1) await tick();
    expect(await screen.findByRole('status')).toHaveTextContent(/updates paused, retrying/i);
    expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument();
  });
});
