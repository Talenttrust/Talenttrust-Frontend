/**
 * StatusBadge Component
 *
 * A reusable badge component that displays contract and milestone statuses
 * with an icon + label token, ensuring meaning is never conveyed by color alone.
 * Meets WCAG 2.1 AA requirements.
 */

export type StatusType = 'Active' | 'Completed' | 'Disputed' | 'Pending' | 'Paid' | 'Archived';

export interface StatusBadgeProps {
  /** The status value to display */
  status: StatusType;
  /** Additional CSS classes to apply to the badge */
  className?: string;
}

/**
 * Unified color and style map for all status types.
 *
 * a11y/theming-27: previously these were fixed Tailwind pastel pairs
 * (e.g. `bg-emerald-100 text-emerald-800`) which never changed with
 * `data-theme`. Replaced with CSS variables defined in globals.css so
 * both themes get an audited, intentional pair.
 * Ratios recorded in docs/components/Accessibility.md.
 *
 * a11y/wallet-71-contrast: added `Archived` (neutral slate token pair) so
 * the wallet items list can reuse this shared, already-audited badge
 * instead of its own color-only inline pill. Ratios: 9.45:1 (light),
 * 9.85:1 (dark) — both well above WCAG AA's 4.5:1. See
 * docs/components/Accessibility.md.
 */
export const statusColorMap: Record<StatusType, string> = {
  Active: 'bg-[var(--status-success-bg)] text-[var(--status-success-foreground)]',
  Completed: 'bg-[var(--status-info-bg)] text-[var(--status-info-foreground)]',
  Disputed: 'bg-[var(--status-error-bg)] text-[var(--status-error-foreground)]',
  Pending: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-foreground)]',
  Paid: 'bg-[var(--status-success-bg)] text-[var(--status-success-foreground)]',
  Archived: 'bg-[var(--status-neutral-bg)] text-[var(--status-neutral-foreground)]',
};

/** Non-color icon token paired with each status (aria-hidden; label provides text). */
export const statusIconMap: Record<StatusType, string> = {
  Active:    '▶',
  Completed: '✓',
  Disputed:  '⚠',
  Pending:   '⏳',
  Paid:      '✔',
  Archived:  '⊘',
};

/**
 * StatusBadge renders a pill with an icon + label for each status.
 * The icon is decorative (`aria-hidden`); meaning is also carried by the
 * visible label and `aria-label`, so it is never color-only.
 *
 * @example
 * ```tsx
 * <StatusBadge status="Completed" />
 * <StatusBadge status="Pending" className="ml-2" />
 * ```
 */
const StatusBadge = ({ status, className = '' }: StatusBadgeProps) => {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${statusColorMap[status]} ${className}`}
      role="status"
      aria-label={`Status: ${status}`}
    >
      <span aria-hidden="true">{statusIconMap[status]}</span>
      {status}
    </span>
  );
};

export default StatusBadge;