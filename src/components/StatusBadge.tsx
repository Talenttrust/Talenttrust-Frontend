/**
 * StatusBadge Component
 *
 * A reusable badge component that displays contract and milestone statuses
 * with consistent styling and color mapping.
 */

export type StatusType = 'Active' | 'Completed' | 'Disputed' | 'Pending' | 'Paid';

export interface StatusBadgeProps {
  /** The status value to display */
  status: StatusType;
  /** Additional CSS classes to apply to the badge */
  className?: string;
}

/**
 * Unified color and style map for all status types.
 * Ensures consistent visual representation across the application.
 *
 * a11y/theming-27: previously these were fixed Tailwind pastel pairs
 * (e.g. `bg-emerald-100 text-emerald-800`) which never changed with
 * `data-theme`. In dark mode the light pastel background sat directly on
 * the dark surface with no contrast issue for the text itself, but it
 * read as a jarring "light sticker" inconsistent with the themed UI, and
 * the equivalent pattern in toast-provider.tsx had outright AA failures.
 * Replaced with CSS variables defined in globals.css so both themes get
 * an audited, intentional pair. Light-mode variable values are identical
 * to the original Tailwind hex values, so the light theme is unchanged.
 * Ratios recorded in docs/components/Accessibility.md.
 */
const statusColorMap: Record<StatusType, string> = {
  Active: 'bg-[var(--status-success-bg)] text-[var(--status-success-foreground)]',
  Completed: 'bg-[var(--status-info-bg)] text-[var(--status-info-foreground)]',
  Disputed: 'bg-[var(--status-error-bg)] text-[var(--status-error-foreground)]',
  Pending: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-foreground)]',
  Paid: 'bg-[var(--status-success-bg)] text-[var(--status-success-foreground)]',
};

/**
 * StatusBadge component renders a styled badge pill for contract and milestone statuses.
 *
 * @param status - The status value to display (Active, Completed, Disputed, Pending, or Paid)
 * @param className - Optional additional CSS classes
 * @returns A styled badge element with appropriate color based on status
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
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${statusColorMap[status]} ${className}`}
      role="status"
      aria-label={`Status: ${status}`}
    >
      {status}
    </span>
  );
};

export default StatusBadge;