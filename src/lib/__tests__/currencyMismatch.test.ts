import {
  findCurrencyMismatches,
  normalizeCurrencyCode,
} from '../currencyMismatch';
import type { Milestone } from '@/components/MilestonesList';

const milestones: Milestone[] = [
  { id: 'design', title: 'Design', status: 'Completed', payout: 500, currency: 'USD' },
  { id: 'build', title: 'Build', status: 'Pending', payout: 750, currency: 'EUR' },
  { id: 'launch', title: 'Launch', status: 'Pending', payout: 1250, currency: 'GBP' },
];

describe('currencyMismatch', () => {
  it('normalizes currency codes with trimming and uppercase conversion', () => {
    expect(normalizeCurrencyCode(' usd ')).toBe('USD');
  });

  it('returns no mismatches when every milestone matches the contract currency', () => {
    expect(
      findCurrencyMismatches('USD', [
        milestones[0],
        { ...milestones[1], currency: 'USD' },
      ]),
    ).toEqual([]);
  });

  it('returns the mismatched milestone id for a single mismatch', () => {
    expect(findCurrencyMismatches('USD', milestones.slice(0, 2))).toEqual(['build']);
  });

  it('returns every mismatched milestone id across multiple currencies', () => {
    expect(findCurrencyMismatches('USD', milestones)).toEqual(['build', 'launch']);
  });

  it('compares milestone and contract currencies case-insensitively', () => {
    expect(
      findCurrencyMismatches('usd', [
        { ...milestones[0], currency: 'USD' },
        { ...milestones[1], currency: 'uSd' },
      ]),
    ).toEqual([]);
  });
});
