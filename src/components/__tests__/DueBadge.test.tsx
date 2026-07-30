import React from 'react';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import DueBadge, { getDueUrgency } from '../DueBadge';

describe('DueBadge', () => {
  const mockToday = new Date('2026-05-10T12:00:00');

  describe('getDueUrgency helper', () => {
    it('returns null for missing, empty, or invalid due dates', () => {
      expect(getDueUrgency(undefined, 'Pending', mockToday)).toBeNull();
      expect(getDueUrgency('', 'Pending', mockToday)).toBeNull();
      expect(getDueUrgency('not-a-date', 'Pending', mockToday)).toBeNull();
    });

    it('returns null for terminal statuses regardless of due date', () => {
      expect(getDueUrgency('2026-05-01', 'Completed', mockToday)).toBeNull();
      expect(getDueUrgency('2026-05-01', 'Paid', mockToday)).toBeNull();
      expect(getDueUrgency('2026-05-12', 'Completed', mockToday)).toBeNull();
      expect(getDueUrgency('2026-05-12', 'Paid', mockToday)).toBeNull();
    });

    it('identifies overdue milestones (due date prior to today)', () => {
      expect(getDueUrgency('2026-05-09', 'Pending', mockToday)).toBe('overdue');
      expect(getDueUrgency('2026-04-01', 'Active', mockToday)).toBe('overdue');
      expect(getDueUrgency('2026-05-09', 'Disputed', mockToday)).toBe('overdue');
    });

    it('identifies due-soon milestones (today or within windowDays)', () => {
      // Exact today
      expect(getDueUrgency('2026-05-10', 'Pending', mockToday)).toBe('due-soon');
      // Mid-window (3 days)
      expect(getDueUrgency('2026-05-13', 'Pending', mockToday)).toBe('due-soon');
      // Exact window boundary (7 days)
      expect(getDueUrgency('2026-05-17', 'Pending', mockToday)).toBe('due-soon');
    });

    it('returns null for normal / future milestones beyond windowDays', () => {
      // 8 days away
      expect(getDueUrgency('2026-05-18', 'Pending', mockToday)).toBeNull();
      // 30 days away
      expect(getDueUrgency('2026-06-10', 'Pending', mockToday)).toBeNull();
    });
  });

  describe('Component rendering', () => {
    it('renders Overdue badge with correct text, icon, and ARIA attributes', () => {
      render(
        <DueBadge
          dueDate="2026-05-05"
          status="Pending"
          today={mockToday}
        />
      );

      const badge = screen.getByRole('status', { name: 'Urgency: Overdue' });
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Overdue');
      expect(badge).toHaveTextContent('⚠️');
      expect(badge).toHaveAttribute('data-testid', 'due-badge-overdue');
      expect(badge).toHaveClass('bg-[var(--status-error-bg)]');
    });

    it('renders Due Soon badge with correct text, icon, and ARIA attributes', () => {
      render(
        <DueBadge
          dueDate="2026-05-12"
          status="Pending"
          today={mockToday}
        />
      );

      const badge = screen.getByRole('status', { name: 'Urgency: Due soon' });
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Due soon');
      expect(badge).toHaveTextContent('⏳');
      expect(badge).toHaveAttribute('data-testid', 'due-badge-due-soon');
      expect(badge).toHaveClass('bg-[var(--status-warning-bg)]');
    });

    it('renders nothing when milestone is not overdue and not due soon', () => {
      const { container } = render(
        <DueBadge
          dueDate="2026-06-01"
          status="Pending"
          today={mockToday}
        />
      );

      expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when milestone has no due date', () => {
      const { container } = render(
        <DueBadge
          dueDate={undefined}
          status="Pending"
          today={mockToday}
        />
      );

      expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when milestone is Completed or Paid', () => {
      const { container: c1 } = render(
        <DueBadge
          dueDate="2026-05-01"
          status="Completed"
          today={mockToday}
        />
      );
      expect(c1).toBeEmptyDOMElement();

      const { container: c2 } = render(
        <DueBadge
          dueDate="2026-05-01"
          status="Paid"
          today={mockToday}
        />
      );
      expect(c2).toBeEmptyDOMElement();
    });

    it('handles boundary case: due date is exact today', () => {
      render(
        <DueBadge
          dueDate="2026-05-10"
          status="Active"
          today={mockToday}
        />
      );

      expect(screen.getByText('Due soon')).toBeInTheDocument();
    });

    it('handles boundary case: due date is exact 7 days away', () => {
      render(
        <DueBadge
          dueDate="2026-05-17"
          status="Active"
          today={mockToday}
        />
      );

      expect(screen.getByText('Due soon')).toBeInTheDocument();
    });
  });

  describe('Accessibility (WCAG)', () => {
    it('passes axe checks for Overdue badge', async () => {
      const { container } = render(
        <DueBadge
          dueDate="2026-05-01"
          status="Pending"
          today={mockToday}
        />
      );

      expect(await axe(container)).toHaveNoViolations();
    });

    it('passes axe checks for Due Soon badge', async () => {
      const { container } = render(
        <DueBadge
          dueDate="2026-05-15"
          status="Pending"
          today={mockToday}
        />
      );

      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
