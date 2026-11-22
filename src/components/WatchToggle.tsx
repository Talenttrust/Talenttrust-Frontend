'use client';

import type { EscrowContract } from '@/lib/api';
import { WATCH_CAPACITY_HINT_THRESHOLD, WATCH_MAX_ITEMS } from '@/lib/watchlist';
import { useNotifications, useOptionalNotifications } from '@/components/NotificationsProvider';

/** Renders nothing when there is no NotificationsProvider. */
export function WatchToggle({ contract }: { contract: EscrowContract }) {
  return useOptionalNotifications() ? <WatchToggleButton contract={contract} /> : null;
}

function WatchToggleButton({ contract }: { contract: EscrowContract }) {
  const { isWatched, toggleWatch, watchedIds } = useNotifications();
  const watched = isWatched(contract.id);
  const count = watchedIds.length;
  const nearCapacity = count >= WATCH_CAPACITY_HINT_THRESHOLD;
  const capacityHint = nearCapacity
    ? `Watchlist is near capacity (${count}/${WATCH_MAX_ITEMS}). Adding past ${WATCH_MAX_ITEMS} removes the oldest escrow.`
    : undefined;
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      aria-pressed={watched}
      aria-label={watched ? `Unwatch escrow ${contract.id}` : `Watch escrow ${contract.id}`}
      title={capacityHint}
      onClick={() => toggleWatch(contract)}
    >
      <span aria-hidden="true">{watched ? '\u2605' : '\u2606'}</span>
      {watched ? 'Watching' : 'Watch'}
    </button>
  );
}
