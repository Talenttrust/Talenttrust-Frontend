# NotificationBell & NotificationsProvider

Header notification popover and background watchlist polling context that alerts users when watched escrows are funded, have milestones released, enter disputes, or reach a terminal status.

## File Locations

- Bell UI component: `src/components/NotificationBell.tsx`
- Context provider & hooks: `src/components/NotificationsProvider.tsx`
- Watch toggle button: `src/components/WatchToggle.tsx`
- Storage & poller modules: `src/lib/notifications.ts`, `src/lib/watchlist.ts`, `src/lib/poller.ts`
- Tests: `src/components/NotificationBell.test.tsx`, `src/components/WatchToggle.test.tsx`

## `NotificationBell`

`NotificationBell` (`src/components/NotificationBell.tsx`) accepts no props. It reads notification state via `useOptionalNotifications()` (rendering `null` when mounted outside `<NotificationsProvider>`) and renders:

- A trigger button (`aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`) with an unread badge (`unread > 99 ? '99+' : unread`).
- A polite screen-reader live region announcing new notifications or actions (`markAllRead`, `clear`).
- A dialog popover (`role="dialog" aria-label="Notifications"`) listing notifications with relative timestamps, plus **Mark all read** and **Clear** controls.
- Dismissal on `Escape` (restoring focus to the bell button) or outside `mousedown`.

## `NotificationsProvider` & Hooks

`NotificationsProvider` (`src/components/NotificationsProvider.tsx`) wraps the application in `src/app/layout.tsx`.

### Props (`NotificationsProviderProps`)

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `children` | `React.ReactNode` | Yes | Application subtree |
| `poller` | `Partial<Omit<PollerOptions, 'onEvents' \| 'onRemoved'>>` | No | Optional poller overrides for testing |

### Hooks

- `useNotifications()` — Returns `NotificationsContextValue`; throws outside `<NotificationsProvider>`.
- `useOptionalNotifications()` — Returns `NotificationsContextValue | null`.

```ts
interface NotificationsContextValue {
  items: NotificationItem[];
  unread: number;
  watchedIds: number[];
  isWatched: (id: number) => boolean;
  toggleWatch: (contract: EscrowContract) => void;
  markAllRead: () => void;
  clear: () => void;
  announcement: string;
}
```
