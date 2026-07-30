import React, { useState } from 'react';
import { exportReputationHistory } from '@/lib/reputationExport';
import type { ReputationEvent } from '@/components/ReputationProfile';

interface ReputationExportButtonProps {
  events: ReputationEvent[];
  filename?: string;
}

export default function ReputationExportButton({
  events,
  filename = 'reputation-history',
}: ReputationExportButtonProps) {
  const [open, setOpen] = useState(false);
  const disabled = events.length === 0;

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Export reputation history"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
        className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--muted-foreground)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Export all
      </button>
      {open && !disabled && (
        <ul
          role="menu"
          aria-label="Export format"
          className="absolute left-0 z-10 mt-1 min-w-[8rem] rounded-xl border border-[var(--border)] bg-[var(--card)] py-1 shadow-md"
        >
          <li role="none">
            <button
              role="menuitem"
              type="button"
              className="w-full px-4 py-2 text-left text-sm hover:bg-[var(--muted)]"
              onMouseDown={() => {
                exportReputationHistory(events, 'csv', filename);
                setOpen(false);
              }}
            >
              Export as CSV
            </button>
          </li>
          <li role="none">
            <button
              role="menuitem"
              type="button"
              className="w-full px-4 py-2 text-left text-sm hover:bg-[var(--muted)]"
              onMouseDown={() => {
                exportReputationHistory(events, 'json', filename);
                setOpen(false);
              }}
            >
              Export as JSON
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
