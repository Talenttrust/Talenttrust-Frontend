/**
 * Seeded property-based invariants for the money math.
 *
 * Each property runs against at least 2,000 generated escrows. A failure prints
 * the seed and a shrunk minimal contract; replay it with:
 *   INVARIANT_SEED=<seed> npx vitest run src/lib/__tests__/invariants.test.ts
 */
import { describe, expect, it } from 'vitest';
import type { EscrowContract } from '@/lib/api';
import { buildStatement, ledgerSum } from '@/lib/statement';
import { applyDeposit, applyRelease } from '@/lib/optimistic';
import { applyQuery, filterContracts, PAGE_SIZE, SORTS, type ContractQuery, type Sort } from '@/lib/contractQuery';
import {
  ALL_STATUSES,
  createRng,
  forAll,
  genContract,
  genContractList,
  isConsistent,
  mulberry32,
  shrinkContract,
  type Rng,
} from '@/test/generators';

const RUNS = 2000;
const contractOptions = { runs: RUNS, shrink: shrinkContract };
const releasable = (c: EscrowContract) => c.status === 'Created' || c.status === 'Funded';

describe('generators', () => {
  it('are deterministic for a given seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(genContractList(a)).toEqual(genContractList(b));
    expect(genContract(createRng(7))).not.toEqual(genContract(createRng(8)));
  });

  it('mulberry32 yields floats in [0, 1)', () => {
    const next = mulberry32(1);
    for (let i = 0; i < 1000; i += 1) {
      const v = next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('cover all six statuses, partial funding, released subsets and bps edges', () => {
    const seen = new Set<string>();
    let partial = 0;
    let someReleased = 0;
    const bps = new Set<number | null | undefined>();
    let shuffled = 0;
    forAll(genContract, (c) => {
      expect(isConsistent(c)).toBe(true);
      seen.add(c.status);
      if (c.fundedAmount < c.totalAmount) partial += 1;
      if (c.milestones.some((m) => m.released) && c.milestones.some((m) => !m.released)) someReleased += 1;
      if (c.status === 'Resolved') bps.add(c.dispute?.freelancerBps);
      if (c.milestones.some((m, i) => m.index !== i)) shuffled += 1;
    }, { runs: RUNS });
    expect([...seen].sort()).toEqual([...ALL_STATUSES].sort());
    expect(partial).toBeGreaterThan(100);
    expect(someReleased).toBeGreaterThan(100);
    expect(shuffled).toBeGreaterThan(100);
    expect(bps.has(0) && bps.has(10000) && bps.has(null)).toBe(true);
  });

  it('report the seed and a shrunk contract when a property fails', () => {
    const errors: string[] = [];
    const original = console.error;
    console.error = (msg: string) => errors.push(msg);
    try {
      expect(() =>
        forAll(genContract, (c) => expect(c.milestones.length).toBeLessThan(3), { ...contractOptions, seed: 99 }),
      ).toThrow(/base seed 99.*\n.*INVARIANT_SEED=99[\s\S]*Shrunk input/);
    } finally {
      console.error = original;
    }
    const shrunk = JSON.parse(errors[0].split('Shrunk input:\n')[1].split('\nFailure:')[0]) as EscrowContract;
    // Minimal counterexample: exactly three milestones of amount 1.
    expect(shrunk.milestones).toHaveLength(3);
    expect(shrunk.milestones.every((m) => m.amount === 1)).toBe(true);
    expect(isConsistent(shrunk)).toBe(true);
  });
});

describe('statement invariants', () => {
  it('ledger lines sum to totalAmount and totals reconcile', () => {
    forAll(genContract, (c) => {
      const s = buildStatement(c);
      expect(ledgerSum(s)).toBe(c.totalAmount);
      expect(s.totals.total).toBe(c.totalAmount);
      expect(s.totals.toFreelancer + s.totals.toClient + s.totals.held).toBe(s.totals.total);
      for (const line of s.lines) {
        expect(Number.isInteger(line.amount)).toBe(true);
        expect(line.amount).toBeGreaterThanOrEqual(0);
      }
    }, contractOptions);
  });

  it('pays released milestones to the freelancer and never moves money out of a live escrow', () => {
    forAll(genContract, (c) => {
      const s = buildStatement(c);
      const released = s.lines.filter((l) => l.note === 'Milestone released');
      expect(released.reduce((n, l) => n + l.amount, 0)).toBe(c.releasedAmount);
      if (s.inProgress) {
        expect(s.totals.toClient).toBe(0);
        expect(s.totals.toFreelancer).toBe(c.releasedAmount);
      }
    }, contractOptions);
  });
});

describe('optimistic invariants', () => {
  const withIndex = (rng: Rng) => {
    const contract = genContract(rng, { minMilestones: 1 });
    return { contract, index: rng.pick(contract.milestones).index };
  };
  type WithIndex = ReturnType<typeof withIndex>;
  const indexOptions = {
    runs: RUNS,
    shrink: ({ contract, index }: WithIndex, fails: (v: WithIndex) => boolean): WithIndex => ({
      contract: shrinkContract(
        contract,
        (c) => c.milestones.some((m) => m.index === index) && fails({ contract: c, index }),
      ),
      index,
    }),
  };

  it('applyRelease twice equals once', () => {
    forAll(withIndex, ({ contract, index }) => {
      const once = applyRelease(contract, index);
      expect(applyRelease(once, index)).toEqual(once);
    }, indexOptions);
  });

  it('applyRelease releases the milestone with that index, whatever its array position', () => {
    forAll(withIndex, ({ contract, index }) => {
      const before = contract.milestones.find((m) => m.index === index)!;
      const after = applyRelease(contract, index);
      expect(after.milestones.find((m) => m.index === index)!.released).toBe(true);
      expect(after.releasedAmount).toBe(contract.releasedAmount + (before.released ? 0 : before.amount));
      for (const m of contract.milestones) {
        if (m.index !== index) expect(after.milestones.find((x) => x.index === m.index)!.released).toBe(m.released);
      }
    }, indexOptions);
  });

  it('applying every release yields Completed with releasedAmount equal to the milestone sum', () => {
    forAll((rng) => genContract(rng, { minMilestones: 1 }), (c) => {
      let next = c;
      for (const m of [...c.milestones].reverse()) next = applyRelease(next, m.index);
      const sum = c.milestones.reduce((n, m) => n + m.amount, 0);
      expect(next.releasedAmount).toBe(sum);
      expect(next.milestones.every((m) => m.released)).toBe(true);
      // Only a live escrow completes; terminal and disputed statuses are kept.
      expect(next.status).toBe(releasable(c) || c.status === 'Completed' ? 'Completed' : c.status);
    }, contractOptions);
  });

  it('applyDeposit never decreases the funded amount and only promotes Created to Funded', () => {
    forAll((rng) => ({ contract: genContract(rng), amount: rng.int(1, 2_000_000) }), ({ contract, amount }) => {
      const next = applyDeposit(contract, amount);
      expect(next.fundedAmount).toBe(contract.fundedAmount + amount);
      expect(next.fundedAmount).toBeGreaterThanOrEqual(contract.fundedAmount);
      if (contract.status === 'Created') {
        expect(next.status).toBe(next.fundedAmount >= contract.totalAmount ? 'Funded' : 'Created');
      } else {
        expect(next.status).toBe(contract.status);
      }
    }, { runs: RUNS });
  });
});

describe('paging invariants', () => {
  const sorts = Object.keys(SORTS) as Sort[];
  const QUERY_WORDS = ['', '', 'design', 'API', '1', 'gclient1', 'usdc', 'zzz', 'e'];

  const genCase = (rng: Rng) => ({
    list: genContractList(rng),
    query: { status: '', q: rng.pick(QUERY_WORDS), sort: rng.pick(sorts), page: 1 } as ContractQuery,
  });

  it('paging every page of a filtered list reproduces it exactly once', () => {
    forAll(genCase, ({ list, query }) => {
      const expected = filterContracts(list, query);
      const first = applyQuery(list, query);
      expect(first.total).toBe(expected.length);
      expect(first.pageCount).toBe(Math.max(1, Math.ceil(expected.length / PAGE_SIZE)));

      const seen: EscrowContract[] = [];
      for (let page = 1; page <= first.pageCount; page += 1) {
        const r = applyQuery(list, { ...query, page });
        expect(r.page).toBe(page);
        if (page < r.pageCount) expect(r.items).toHaveLength(PAGE_SIZE);
        expect(r.from).toBe(r.items.length ? seen.length + 1 : 0);
        expect(r.to).toBe(seen.length + r.items.length);
        seen.push(...r.items);
      }
      expect(seen.map((c) => c.id)).toEqual(expected.map((c) => c.id));
      expect(new Set(seen.map((c) => c.id)).size).toBe(seen.length);

      // Independent oracle for which contracts match the search.
      const q = query.q.toLowerCase();
      const matches = list.filter((c) =>
        [c.title, String(c.id), c.client, c.freelancer, c.token, ...c.milestones.map((m) => m.title)].some((v) =>
          v.toLowerCase().includes(q),
        ),
      );
      expect(seen.map((c) => c.id).sort((a, b) => a - b)).toEqual(matches.map((c) => c.id).sort((a, b) => a - b));

      // A page past the end clamps to the last page.
      expect(applyQuery(list, { ...query, page: first.pageCount + 3 }).page).toBe(first.pageCount);
    }, { runs: RUNS, show: ({ list, query }) => JSON.stringify({ query, ids: list.map((c) => c.id) }) });
  });
});

describe('regressions found by the invariants', () => {
  const base: EscrowContract = {
    id: 1,
    title: 'T',
    client: 'GC',
    freelancer: 'GF',
    token: 'XLM',
    milestones: [
      { index: 1, title: 'B', amount: 5, released: false },
      { index: 0, title: 'A', amount: 3, released: false },
    ],
    totalAmount: 8,
    fundedAmount: 8,
    releasedAmount: 0,
    status: 'Funded',
    reputationIssued: false,
  };

  it('applyRelease targets the milestone by its index when milestones arrive out of order', () => {
    const next = applyRelease(base, 0);
    expect(next.milestones.find((m) => m.index === 0)!.released).toBe(true);
    expect(next.milestones.find((m) => m.index === 1)!.released).toBe(false);
    expect(next.releasedAmount).toBe(3);
  });

  it('applyDeposit does not turn a Completed, Disputed or Cancelled escrow back into Funded', () => {
    expect(applyDeposit({ ...base, status: 'Disputed' }, 1).status).toBe('Disputed');
    expect(applyDeposit({ ...base, status: 'Cancelled', fundedAmount: 0 }, 8).status).toBe('Cancelled');
    const completed = { ...base, status: 'Completed' as const, releasedAmount: 8, milestones: base.milestones.map((m) => ({ ...m, released: true })) };
    expect(applyDeposit(completed, 1).status).toBe('Completed');
  });

  it('applyRelease does not mark a Cancelled or Resolved escrow Completed', () => {
    for (const status of ['Cancelled', 'Resolved', 'Disputed'] as const) {
      const next = applyRelease(applyRelease({ ...base, status }, 0), 1);
      expect(next.status).toBe(status);
    }
  });
});
