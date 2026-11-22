# Watchlist, Notifications & Poller

Client-side storage and background polling modules that power `WatchToggle`, `NotificationsProvider`, and `NotificationBell`.

## File Locations

- Watchlist store & snapshot diffing: `src/lib/watchlist.ts` (`src/lib/watchlist.test.ts`)
- Notification store: `src/lib/notifications.ts` (`src/lib/notifications.test.ts`)
- Background poller: `src/lib/poller.ts` (`src/lib/poller.test.ts`)

---

## `watchlist` (`src/lib/watchlist.ts`)

Persists watched escrows and their last known snapshots in `localStorage` under `WATCH_STORE_KEY = 'tt.watch.v1'` (capped at `WATCH_MAX_ITEMS = 200`).

- `snapshotOf(contract)` — extracts `{ status, releasedIdx, fundedAmount }`.
- `diffSnapshots(prev, next)` — compares two snapshots and emits `WatchEvent[]` for `'funded'`, `'milestone_released'`, `'disputed'`, `'resolved'`, `'cancelled'`, and `'completed'`.
- `loadStore()`, `saveStore(store)`, `isWatched(id)`, `watch(id, snapshot)`, `unwatch(id)`.

---

## `notifications` (`src/lib/notifications.ts`)

Persists user notifications in `localStorage` under `NOTIFICATIONS_KEY = 'tt.notifications.v1'` (capped at `NOTIFICATIONS_MAX = 100`).

- `loadNotifications()`, `saveNotifications(store)`
- `appendNotification(store, item)` — prepends a new `NotificationItem` (`read: false`).
- `unreadCount(store)` — counts unread items.
- `markAllRead(store)` — marks every item `read: true`.
- `clearNotifications()` — resets and saves an empty store.

---

## `poller` (`src/lib/poller.ts`)

Polls watched escrows in the background (`POLL_INTERVAL_MS = 60000`, `POLL_CONCURRENCY = 3`) while `document.visibilityState === 'visible'`.

- `pollOnce(deps)` — fetches each watched escrow concurrently via `runPool`, computes `diffSnapshots`, invokes `onEvents` when changes occur, and invokes `onRemoved` when the API returns HTTP `404`.
- `startPoller(options)` — schedules `pollOnce` on an interval and immediately triggers a check when the tab becomes visible.
