/**
 * StatusBadge Component
 *
 * A reusable badge component that displays contract and milestone statuses
 * with an icon + label token, ensuring meaning is never conveyed by color alone.
 * Meets WCAG 2.1 AA requirements.
 */

export type StatusType = 'Active' | 'Completed' | 'Disputed' | 'Pending' | 'Paid' | 'Archived';

/**
 * Canonical set of acceptable statuses. Hoisted as a constant so the
 * bundler can inline membership checks and DCE the dev-only warning path.
 */
const KNOWN_STATUSES: ReadonlySet<StatusType> = new Set<StatusType>([
  'Active',
  'Completed',
  'Disputed',
  'Pending',
  'Paid',
  // `Archived` is a canonical StatusType with dedicated colour/icon entries,
  // so it must resolve through the known-status path, not the fallback.
  'Archived',
]);

/**
 * Type guard for the canonical status union.
 *
 * The prop boundary is typed, but values can still arrive from unvalidated
 * runtime data (API payloads, persisted drafts). Callers use this guard to
 * branch safely instead of casting.
 *
 * @param value - Any runtime value.
 * @returns `true` only for canonical {@link StatusType} strings.
 */
export function isKnownStatus(value: unknown): value is StatusType {
  return typeof value === 'string' && KNOWN_STATUSES.has(value as StatusType);
}

export interface StatusBadgeProps {
  /**
   * The status value to display. Typed as {@link StatusType}, but the
   * component is defensive at runtime — see {@link isKnownStatus}.
   */
  status: StatusType;
  /** Additional CSS classes to apply to the badge */
  className?: string;
}

/** Base pill styles shared by every status (known and unknown). */
const BASE_CLASSES =
  'inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold';

/**
 * Neutral tokens used when a value falls outside the canonical union. Kept
 * separate from {@link statusColorMap} so unknown values can never pick up a
 * success/warning/error colour that would imply a status we do not support.
 */
const FALLBACK_COLOR_CLASSES =
  'bg-[var(--status-neutral-bg)] text-[var(--status-neutral-foreground)]';

/** Fallback icon token; `?` reads as "unknown" and is not colour-dependent. */
const FALLBACK_ICON = '?';

/**
 * Unified color and style map for all status types.
 *
 * a11y/theming-27: previously these were fixed Tailwind pastel pairs
 * (e.g. `bg-emerald-100 text-emerald-800`) which never changed with
 * `data-theme`. Replaced with CSS variables defined in globals.css so
 * both themes get an audited, intentional pair.
 * Ratios recorded in docs/components/Accessibility.md.
 */
export const statusColorMap: Record<StatusType, string> = {
  Active: 'bg-[var(--status-success-bg)] text-[var(--status-success-foreground)]',
  Completed: 'bg-[var(--status-info-bg)] text-[var(--status-info-foreground)]',
  Disputed: 'bg-[var(--status-error-bg)] text-[var(--status-error-foreground)]',
  Pending: 'bg-[var(--status-warning-bg)] text-[var(--status-warning-foreground)]',
  Paid: 'bg-[var(--status-success-bg)] text-[var(--status-success-foreground)]',
  // `Archived` is retired rather than failed, so it takes the neutral pair
  // instead of borrowing a success/warning/error token.
  Archived:
    'bg-[var(--status-neutral-bg)] text-[var(--status-neutral-foreground)]',
};

/** Non-color icon token paired with each status (aria-hidden; label provides text). */
export const statusIconMap: Record<StatusType, string> = {
  Active:    '▶',
  Completed: '✓',
  Disputed:  '⚠',
  Pending:   '⏳',
  Paid:      '✔',
  Archived:  '🗄',
};

/**
 * StatusBadge renders a pill with an icon + label for each status.
 * The icon is decorative (`aria-hidden`); meaning is also carried by the
 * visible label and `aria-label`, so it is never color-only.
 *
 * Values outside {@link StatusType} (e.g. unvalidated API data) degrade to a
 * neutral badge labelled `Unknown (<value>)`. The dev-only warning below is
 * guarded by `process.env.NODE_ENV` so production builds drop it entirely.
 *
 * @example
 * ```tsx
 * <StatusBadge status="Completed" />
 * <StatusBadge status="Pending" className="ml-2" />
 * ```
 */
const StatusBadge = ({ status, className = '' }: StatusBadgeProps) => {
  const known = isKnownStatus(status);

  if (process.env.NODE_ENV !== 'production' && !known) {
    // Single inline branch (no hooks/effects) so bundlers can DCE the whole
    // dev-only path out of production builds.
    console.warn(`[StatusBadge] Unknown status value: "${String(status)}".`);
  }

  return (
    <span
      className={`${BASE_CLASSES} ${
        known ? statusColorMap[status] : FALLBACK_COLOR_CLASSES
      } ${className}`}
      role="status"
      aria-label={
        known ? `Status: ${status}` : `Status: Unknown — value "${String(status)}"`
      }
    >
      <span aria-hidden="true">
        {known ? statusIconMap[status] : FALLBACK_ICON}
      </span>
      {known ? status : `Unknown (${String(status)})`}
    </span>
  );
};

export default StatusBadge;
export { StatusBadge };
