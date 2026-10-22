'use client';

import type { EscrowContract } from '@/lib/api';
import { useNotifications } from '@/components/NotificationsProvider';

export function WatchToggle({ contract }: { contract: EscrowContract }) {
  const { isWatched, toggleWatch } = useNotifications();
  const watched = isWatched(contract.id);
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      aria-pressed={watched}
      aria-label={watched ? `Unwatch escrow ${contract.id}` : `Watch escrow ${contract.id}`}
      onClick={() => toggleWatch(contract)}
    >
      <span aria-hidden="true">{watched ? '\u2605' : '\u2606'}</span>
      {watched ? 'Watching' : 'Watch'}
    </button>
  );
}
