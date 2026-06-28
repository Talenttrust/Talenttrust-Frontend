import { milestoneStatusTally, STATUS_ORDER } from '../milestoneStatusTally';
import type { StatusType } from '@/components/StatusBadge';

describe('milestoneStatusTally', () => {
  it('returns counts for each status present in canonical order', () => {
    const milestones = [
      { status: 'Pending' as StatusType },
      { status: 'Active' as StatusType },
      { status: 'Pending' as StatusType },
      { status: 'Completed' as StatusType },
    ];

    const result = milestoneStatusTally(milestones);

    expect(result).toEqual([
      { status: 'Active', count: 1 },
      { status: 'Completed', count: 1 },
      { status: 'Pending', count: 2 },
    ]);
  });

  it('omits statuses with zero count', () => {
    const milestones = [
      { status: 'Paid' as StatusType },
      { status: 'Paid' as StatusType },
      { status: 'Active' as StatusType },
    ];

    const result = milestoneStatusTally(milestones);

    expect(result).toEqual([
      { status: 'Active', count: 1 },
      { status: 'Paid', count: 2 },
    ]);
  });

  it('returns all five statuses when each appears at least once', () => {
    const milestones = [
      { status: 'Active' as StatusType },
      { status: 'Completed' as StatusType },
      { status: 'Disputed' as StatusType },
      { status: 'Pending' as StatusType },
      { status: 'Paid' as StatusType },
    ];

    const result = milestoneStatusTally(milestones);

    expect(result).toHaveLength(5);
    expect(result.map((t) => t.status)).toEqual(STATUS_ORDER);
    result.forEach((t) => expect(t.count).toBe(1));
  });

  it('returns empty array for empty input', () => {
    expect(milestoneStatusTally([])).toEqual([]);
  });

  it('handles all milestones with the same status', () => {
    const milestones = Array.from(
      { length: 10 },
      () => ({ status: 'Completed' as StatusType }),
    );

    const result = milestoneStatusTally(milestones);

    expect(result).toEqual([{ status: 'Completed', count: 10 }]);
  });

  it('returns statuses in the canonical STATUS_ORDER', () => {
    const milestones = [
      { status: 'Paid' as StatusType },
      { status: 'Pending' as StatusType },
      { status: 'Active' as StatusType },
      { status: 'Completed' as StatusType },
      { status: 'Disputed' as StatusType },
    ];

    const result = milestoneStatusTally(milestones);

    const statuses = result.map((t) => t.status);
    expect(statuses).toEqual(STATUS_ORDER);
  });

  it('preserves order for partial set', () => {
    const milestones = [
      { status: 'Paid' as StatusType },
      { status: 'Active' as StatusType },
    ];

    const result = milestoneStatusTally(milestones);

    expect(result.map((t) => t.status)).toEqual(['Active', 'Paid']);
  });
});
