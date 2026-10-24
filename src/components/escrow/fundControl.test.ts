import { describe, it, expect } from 'vitest';
import {
  Contract,
  nextMilestoneDeposit,
  remainingBalance,
  validateDeposit,
} from './fundControl';

const base: Contract = {
  totalAmount: 1000,
  fundedAmount: 300,
  releasedAmount: 0,
  milestones: [
    { id: 1, amount: 300, released: false },
    { id: 2, amount: 400, released: false },
    { id: 3, amount: 300, released: false },
  ],
};

describe('validateDeposit', () => {
  const cases: Array<{ name: string; input: string; contract?: Contract; ok: boolean; amount?: number; errorMatch?: RegExp }> = [
    { name: 'empty', input: '', ok: false, errorMatch: /Enter an amount/ },
    { name: 'whitespace only', input: '   ', ok: false, errorMatch: /Enter an amount/ },
    { name: 'non-numeric', input: 'abc', ok: false, errorMatch: /valid number/ },
    { name: 'negative', input: '-1', ok: false, errorMatch: /valid number/ },
    { name: 'zero', input: '0', ok: false, errorMatch: /greater than zero/ },
    { name: 'too many decimals', input: '1.00000001', ok: false, errorMatch: /decimal places/ },
    { name: 'exactly 7 decimals is ok', input: '1.000000', ok: true, amount: 1.0 },
    { name: 'boundary amount == remaining', input: '700', ok: true, amount: 700 },
    { name: 'remaining + 0.0000001 is error', input: '700.0000001', ok: false, errorMatch: /max 700/ },
    { name: 'way over remaining', input: '701', ok: false, errorMatch: /max 700/ },
    { name: 'valid partial', input: '150', ok: true, amount: 150 },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const result = validateDeposit(c.input, c.contract ?? base);
      if (c.ok) {
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.amount).toBeCloseTo(c.amount!, 9);
      } else {
        expect(result.ok).toBe(false);
        if (!result.ok && c.errorMatch) {
          expect(result.error).toMatch(c.errorMatch);
        }
      }
    });
  }

  it('rejects when already fully funded', () => {
    const result = validateDeposit('1', { totalAmount: 100, fundedAmount: 100 });
    expect(result.ok).toBe(false);
  });

  it('rejects zero-remaining by reporting an error', () => {
    const result = validateDeposit('1', { totalAmount: 100, fundedAmount: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeTruthy();
  });
});

describe('remainingBalance', () => {
  it('returns total minus funded', () => {
    expect(remainingBalance(base)).toBe(700);
  });
  it('never goes negative', () => {
    expect(remainingBalance({ totalAmount: 100, fundedAmount: 150 })).toBe(0);
  });
});

describe('nextMilestoneDeposit', () => {
  it('returns full amount of first milestone when nothing funded', () => {
    const c = { ...base, fundedAmount: 0 };
    expect(nextMilestoneDeposit(c)).toBe(300);
  });

  it('returns gap when partially funded', () => {
    expect(nextMilestoneDeposit(base)).toBe(100);
  });

  it('returns 0 when next milestone already covered', () => {
    const c = { ...base, fundedAmount: 700 };
    expect(nextMilestoneDeposit(c)).toBe(0);
  });

  it('accounts for released amount', () => {
    const c = {
      totalAmount: 1000,
      fundedAmount: 300,
      releasedAmount: 300,
      milestones: [
        { id: 1, amount: 300, released: true },
        { id: 2, amount: 400, released: false },
      ],
    };
    expect(nextMilestoneDeposit(c)).toBe(400);
  });

  it('returns 0 when no milestones', () => {
    expect(nextMilestoneDeposit({ totalAmount: 100, fundedAmount: 0 })).toBe(0);
  });
});
