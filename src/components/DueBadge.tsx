import React from 'react';
import { parseLocalDate, isDueSoon } from '@/lib/dueSoon';
import type { StatusType } from './StatusBadge';

export type UrgencyType = 'overdue' | 'due-soon';

export interface DueBadgeProps {
  /** The due date string of the milestone */
  dueDate?: string;
  /** The current status of the milestone */
  status?: StatusType;
  /** Optional custom reference date for today (useful for testing) */
  today?: Date;
  /** Number of window days for due soon check (defaults to 7) */
  windowDays?: number;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Calculates the urgency status ('overdue', 'due-soon', or null) for a milestone.
 *
 * Terminal statuses ('Paid', 'Completed') and missing/invalid dates return null.
 */
export function getDueUrgency(
  dueDate?: string,
  status?: StatusType,
  today: Date = new Date(),
  windowDays: number = 7
): UrgencyType | null {
  if (!dueDate || status === 'Completed' || status === 'Paid') {
    return null;
  }

  const due = parseLocalDate(dueDate);
  if (!due) {
    return null;
  }

  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffTime = due.getTime() - current.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return 'overdue';
  }

  if (isDueSoon(dueDate, today, windowDays)) {
    return 'due-soon';
  }

  return null;
}

/**
 * DueBadge Component
 *
 * Renders an urgency badge ("Overdue" or "Due soon") for non-terminal milestones
 * based on due date proximity. Includes text label, icon, and ARIA attributes
 * to ensure accessibility (WCAG 2.1 AA) without relying on color alone.
 */
const DueBadge: React.FC<DueBadgeProps> = ({
  dueDate,
  status,
  today,
  windowDays = 7,
  className = '',
}) => {
  const urgency = getDueUrgency(dueDate, status, today, windowDays);

  if (!urgency) {
    return null;
  }

  const isOverdue = urgency === 'overdue';
  const label = isOverdue ? 'Overdue' : 'Due soon';
  const icon = isOverdue ? '⚠️' : '⏳';
  const badgeClasses = isOverdue
    ? 'bg-[var(--status-error-bg)] text-[var(--status-error-foreground)]'
    : 'bg-[var(--status-warning-bg)] text-[var(--status-warning-foreground)]';

  return (
    <span
      data-testid={`due-badge-${urgency}`}
      role="status"
      aria-label={`Urgency: ${label}`}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClasses} ${className}`}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
};

export default DueBadge;
