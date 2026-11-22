import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsProvider } from '@/components/NotificationsProvider';
import { NotificationBell } from '@/components/NotificationBell';
import { NOTIFICATIONS_KEY, NOTIFICATIONS_VERSION } from '@/lib/notifications';
import { loadDesktopSettings } from '@/lib/desktopNotifications';

vi.mock('next/navigation', () => ({ usePathname: () => '/contracts' }));

const originalNotification = globalThis.Notification;

function installMockNotification(
  permission: NotificationPermission = 'default',
  requestResult: NotificationPermission = 'granted',
) {
  const requestPermissionMock = vi.fn(async () => {
    MockNotification.permission = requestResult;
    return requestResult;
  });

  class MockNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = requestPermissionMock;
    onclick: ((this: Notification, ev: Event) => unknown) | null = null;
    close = vi.fn();
  }

  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    writable: true,
    value: MockNotification,
  });

  return { requestPermissionMock };
}

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
  installMockNotification('default', 'granted');
});

afterEach(() => {
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    writable: true,
    value: originalNotification,
  });
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

  it('does not request permission until the user enables the desktop toggle', async () => {
    const { requestPermissionMock } = installMockNotification('default', 'granted');
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    expect(requestPermissionMock).not.toHaveBeenCalled();

    const toggle = screen.getByRole('checkbox', { name: /desktop notifications/i });
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);
    await waitFor(() => expect(requestPermissionMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toggle).toBeChecked());
    expect(loadDesktopSettings().enabled).toBe(true);
  });

  it('persists per-event-type filter checkboxes', async () => {
    installMockNotification('granted', 'granted');
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));

    const fundedCheckbox = screen.getByRole('checkbox', { name: /escrow funded/i });
    expect(fundedCheckbox).toBeChecked();

    await userEvent.click(fundedCheckbox);
    expect(fundedCheckbox).not.toBeChecked();
    expect(loadDesktopSettings().types).not.toContain('funded');
  });

  it('explains denied permission with accessible status text', async () => {
    installMockNotification('denied', 'denied');
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));

    const toggle = screen.getByRole('checkbox', { name: /desktop notifications/i });
    expect(toggle).toBeDisabled();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/blocked/i);
  });

  it('explains unsupported browser state with accessible status text', async () => {
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));

    const toggle = screen.getByRole('checkbox', { name: /desktop notifications/i });
    expect(toggle).toBeDisabled();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(/not supported/i);
  });
});
