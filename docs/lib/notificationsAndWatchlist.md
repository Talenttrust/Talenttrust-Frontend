# Watchlist, Notifications & Poller

Client-side storage and background polling modules that power `WatchToggle`, `NotificationsProvider`, and `NotificationBell`.

## File Locations

- Watchlist store & snapshot diffing: `src/lib/watchlist.ts` (`src/lib/watchlist.test.ts`)
- Notification store: `src/lib/notifications.ts` (`src/lib/notifications.test.ts`)
- Background poller: `src/lib/poller.ts` (`src/lib/poller.test.ts`)
- Tab-leader election: `src/lib/tabLeader.ts` (`src/lib/__tests__/tabLeader.test.ts`)

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
- `appendNotification(store, item)` — prepends a new `NotificationItem` (`read: false`). Idempotent for items carrying a `snapshot`: the same `escrowId`, `type`, `snapshot` and message within `NOTIFICATION_DEDUPE_WINDOW_MS` (5 minutes) returns the same store unchanged. This is the second line of defense against duplicates from several tabs.
- `snapshotKey(snapshot)` — stable key of an escrow snapshot, stored as the notification's `snapshot`.
- `unreadCount(store)` — counts unread items.
- `markAllRead(store)` — marks every item `read: true`.
- `clearNotifications()` — resets and saves an empty store.

---

## `poller` (`src/lib/poller.ts`)

Polls watched escrows in the background (`POLL_INTERVAL_MS = 60000`, `POLL_CONCURRENCY = 3`) while `document.visibilityState === 'visible'`.

- `pollOnce(deps)` — fetches each watched escrow concurrently via `runPool`, computes `diffSnapshots`, invokes `onEvents` when changes occur, and invokes `onRemoved` when the API returns HTTP `404`.
- `startPoller(options)` — schedules `pollOnce` on an interval and immediately triggers a check when the tab becomes visible. `initialDelayMs` sets the delay before the first tick (defaults to the interval).

---

## `tabLeader` (`src/lib/tabLeader.ts`)

`acquireLeadership(name, { onChange, ...seams })` elects one leader among the open tabs.

- Uses the Web Locks API (`navigator.locks.request`) when available: the browser hands the lock to the next waiting tab when the leader closes.
- Falls back to a heartbeat lease in `localStorage` under `tt.leader.<name>` (`LEADER_LEASE_MS = 15000`, renewed every `LEADER_HEARTBEAT_MS = 5000` with jitter). Followers take over when the lease expires, or right away when the leader removes it.
- Leadership is released on `pagehide` and by `release()`. With neither locks nor storage the tab leads alone.
- Every dependency (lock manager, storage, clock, timers, listeners) is injectable so tests can simulate several tabs.

`NotificationsProvider` runs `startPoller` only while its tab is the leader (`POLLER_LEADER_NAME = 'tt.poller'`). Tabs compete for leadership only while visible, because the poller skips hidden ticks; a tab that takes over polls immediately. Other tabs pick up new notifications through the `storage` listener. The `tabLeader` prop passes the seams through.
