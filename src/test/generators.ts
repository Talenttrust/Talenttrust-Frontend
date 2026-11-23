/**
 * Seeded generators and a tiny property runner for invariant tests.
 *
 * Everything here is deterministic for a given seed and uses no dependencies:
 * a failing case prints its seed and a shrunk contract so it can be replayed
 * with `INVARIANT_SEED=<seed> npx vitest run src/lib/__tests__/invariants.test.ts`.
 */
import type { EscrowContract, Milestone } from '@/lib/api';

export type Status = EscrowContract['status'];

export const ALL_STATUSES: Status[] = ['Created', 'Funded', 'Completed', 'Disputed', 'Resolved', 'Cancelled'];

/** mulberry32: a 32-bit PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  next: () => number;
  /** Integer in [min, max], inclusive. */
  int: (min: number, max: number) => number;
  bool: (p?: number) => boolean;
  pick: <T>(items: readonly T[]) => T;
  shuffle: <T>(items: readonly T[]) => T[];
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    bool: (p = 0.5) => next() < p,
    pick: (items) => items[int(0, items.length - 1)],
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

/** Derives the seed for case `i` of a run so every case is independently replayable. */
export function caseSeed(baseSeed: number, i: number): number {
  return mulberry32((baseSeed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0)() * 4294967296 >>> 0;
}

const WORDS = ['Design', 'Build', 'Deploy', 'Audit', 'Logo', 'API', 'Docs', 'QA', 'Launch', 'Refactor'];

const sumAmounts = (ms: Milestone[], onlyReleased = false) =>
  ms.reduce((n, m) => n + (!onlyReleased || m.released ? m.amount : 0), 0);

function genAmount(rng: Rng): number {
  // Mostly small, sometimes large, so bps rounding and big sums are exercised.
  const r = rng.next();
  if (r < 0.1) return 1;
  if (r < 0.7) return rng.int(1, 1_000);
  if (r < 0.95) return rng.int(1, 1_000_000);
  return rng.int(1, 1_000_000_000_000);
}

function genBps(rng: Rng): number | null {
  const r = rng.next();
  if (r < 0.1) return 0;
  if (r < 0.2) return 10000;
  if (r < 0.25) return null;
  return rng.int(0, 10000);
}

export interface ContractGenOptions {
  id?: number;
  status?: Status;
  minMilestones?: number;
  maxMilestones?: number;
}

/**
 * Generates an internally consistent escrow, mirroring what the backend can
 * produce for each status:
 *  - `releasedAmount` is the sum of released milestones, `totalAmount` the sum of all
 *  - `releasedAmount <= fundedAmount <= totalAmount`
 *  - Created (and some Cancelled) escrows may be partially funded with nothing released
 *  - Completed has every milestone released; Funded/Disputed never do
 *  - Resolved escrows carry a dispute with `freelancerBps` in 0..10000 (or null)
 * Milestones are sometimes returned out of index order, as the API may do.
 */
export function genContract(rng: Rng, opts: ContractGenOptions = {}): EscrowContract {
  const status = opts.status ?? rng.pick(ALL_STATUSES);
  const min = Math.max(opts.minMilestones ?? 1, status === 'Completed' ? 1 : 0);
  const n = rng.int(min, Math.max(min, opts.maxMilestones ?? 8));

  const milestones: Milestone[] = Array.from({ length: n }, (_, index) => ({
    index,
    title: `${rng.pick(WORDS)} ${index + 1}`,
    amount: genAmount(rng),
    released: false,
  }));
  const totalAmount = sumAmounts(milestones);

  let fundedAmount = totalAmount;
  const partiallyFunded = status === 'Created' || (status === 'Cancelled' && rng.bool(0.5));

  if (partiallyFunded) {
    fundedAmount = totalAmount === 0 ? 0 : rng.int(0, Math.max(0, totalAmount - 1));
  } else if (status === 'Completed') {
    milestones.forEach((m) => (m.released = true));
  } else if (n > 0) {
    // Released subset; Funded/Disputed must leave at least one milestone open.
    const mustLeaveOpen = status === 'Funded' || status === 'Disputed';
    for (const m of milestones) m.released = rng.bool(0.4);
    if (mustLeaveOpen && milestones.every((m) => m.released)) milestones[rng.int(0, n - 1)].released = false;
  }

  const releasedAmount = sumAmounts(milestones, true);
  const hasDispute = status === 'Resolved' || status === 'Disputed' || (status === 'Cancelled' && rng.bool(0.2));

  return {
    id: opts.id ?? rng.int(1, 100_000),
    title: `${rng.pick(WORDS)} ${rng.pick(WORDS)}`,
    client: `GCLIENT${rng.int(0, 99)}`,
    freelancer: `GFREE${rng.int(0, 99)}`,
    token: rng.pick(['XLM', 'USDC']),
    milestones: rng.bool(0.3) ? rng.shuffle(milestones) : milestones,
    totalAmount,
    fundedAmount,
    releasedAmount,
    status,
    reputationIssued: false,
    dispute: hasDispute
      ? {
          raisedBy: 'client',
          reason: 'Late delivery',
          freelancerBps: status === 'Resolved' ? genBps(rng) : null,
        }
      : null,
  };
}

/** Generates a list of contracts with unique ids. */
export function genContractList(rng: Rng, maxLength = 60): EscrowContract[] {
  const length = rng.int(0, maxLength);
  const ids = rng.shuffle(Array.from({ length: length * 3 + 1 }, (_, i) => i + 1)).slice(0, length);
  return ids.map((id) => genContract(rng, { id }));
}

/** True when a contract satisfies the same consistency rules the generator guarantees. */
export function isConsistent(c: EscrowContract): boolean {
  const ms = c.milestones;
  const indices = ms.map((m) => m.index).sort((a, b) => a - b);
  if (indices.some((v, i) => v !== i)) return false;
  if (ms.some((m) => !Number.isInteger(m.amount) || m.amount < 1)) return false;
  if (c.totalAmount !== sumAmounts(ms) || c.releasedAmount !== sumAmounts(ms, true)) return false;
  if (!(c.releasedAmount <= c.fundedAmount && c.fundedAmount <= c.totalAmount && c.fundedAmount >= 0)) return false;
  const allReleased = ms.length > 0 && ms.every((m) => m.released);
  switch (c.status) {
    case 'Created':
      return c.releasedAmount === 0 && (c.fundedAmount < c.totalAmount || c.totalAmount === 0);
    case 'Funded':
    case 'Disputed':
      return c.fundedAmount === c.totalAmount && !allReleased;
    case 'Completed':
      return c.fundedAmount === c.totalAmount && allReleased;
    case 'Resolved': {
      const bps = c.dispute?.freelancerBps;
      return c.fundedAmount === c.totalAmount && (bps == null || (Number.isInteger(bps) && bps >= 0 && bps <= 10000));
    }
    case 'Cancelled':
      return c.fundedAmount === c.totalAmount || c.releasedAmount === 0;
    default:
      return false;
  }
}

/** Recomputes the derived totals after a shrink step changed milestones. */
function repair(c: EscrowContract): EscrowContract {
  // Re-number indices 0..n-1 by their current order, keeping array positions
  // (the array may be shuffled on purpose).
  const ms = c.milestones;
  const rank = new Array<number>(ms.length);
  ms.map((_, i) => i)
    .sort((a, b) => ms[a].index - ms[b].index)
    .forEach((pos, r) => (rank[pos] = r));
  const milestones = ms.map((m, i) => ({ ...m, index: rank[i] }));
  const totalAmount = sumAmounts(milestones);
  const releasedAmount = sumAmounts(milestones, true);
  const wasFull = c.fundedAmount >= c.totalAmount;
  const fundedAmount = wasFull ? totalAmount : Math.max(releasedAmount, Math.min(c.fundedAmount, totalAmount));
  return { ...c, milestones, totalAmount, releasedAmount, fundedAmount };
}

function* shrinkCandidates(c: EscrowContract): Generator<EscrowContract> {
  const ms = c.milestones;
  for (let i = 0; i < ms.length; i += 1) {
    yield repair({ ...c, milestones: ms.filter((_, j) => j !== i) });
  }
  const sorted = [...ms].sort((a, b) => a.index - b.index);
  if (sorted.some((m, i) => m !== ms[i])) yield { ...c, milestones: sorted };
  for (let i = 0; i < ms.length; i += 1) {
    const m = ms[i];
    for (const amount of [1, Math.floor(m.amount / 2)]) {
      if (amount >= 1 && amount < m.amount) {
        yield repair({ ...c, milestones: ms.map((x, j) => (j === i ? { ...x, amount } : x)) });
      }
    }
  }
  if (c.fundedAmount > c.releasedAmount && c.fundedAmount < c.totalAmount) {
    yield { ...c, fundedAmount: c.releasedAmount };
    yield { ...c, fundedAmount: Math.max(c.releasedAmount, Math.floor(c.fundedAmount / 2)) };
  }
  const bps = c.dispute?.freelancerBps;
  if (c.dispute && typeof bps === 'number' && bps > 0) {
    for (const next of [0, Math.floor(bps / 2)]) yield { ...c, dispute: { ...c.dispute, freelancerBps: next } };
  }
  if (c.title.length > 1) yield { ...c, title: 'T' };
  if (c.id !== 1) yield { ...c, id: 1 };
}

/**
 * Greedily shrinks a failing contract: repeatedly takes the first simpler,
 * still-consistent candidate that still fails, until none does.
 */
export function shrinkContract(c: EscrowContract, fails: (c: EscrowContract) => boolean, maxSteps = 500): EscrowContract {
  let current = c;
  for (let step = 0; step < maxSteps; step += 1) {
    let improved = false;
    for (const candidate of shrinkCandidates(current)) {
      if (isConsistent(candidate) && fails(candidate)) {
        current = candidate;
        improved = true;
        break;
      }
    }
    if (!improved) break;
  }
  return current;
}

export interface ForAllOptions<T> {
  runs?: number;
  seed?: number;
  /** Shrinks a failing input; defaults to no shrinking. */
  shrink?: (value: T, fails: (value: T) => boolean) => T;
  /** Formats a value for the failure message. */
  show?: (value: T) => string;
}

/** Base seed: `INVARIANT_SEED` when set (to replay a failure), otherwise fixed. */
export function baseSeed(): number {
  const raw = typeof process !== 'undefined' ? process.env.INVARIANT_SEED : undefined;
  const parsed = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed >>> 0 : 0x7a1e7;
}

/**
 * Runs `property` against `runs` generated values. The property throws (e.g. via
 * `expect`) to signal a failure. On failure the error names the case seed and
 * includes the shrunk input so the case can be replayed and debugged.
 */
export function forAll<T>(
  generate: (rng: Rng) => T,
  property: (value: T) => void,
  options: ForAllOptions<T> = {},
): void {
  const runs = options.runs ?? 2000;
  const seed = options.seed ?? baseSeed();
  const show = options.show ?? ((v: T) => JSON.stringify(v, null, 2));
  const fails = (value: T) => {
    try {
      property(value);
      return false;
    } catch {
      return true;
    }
  };

  for (let i = 0; i < runs; i += 1) {
    const s = caseSeed(seed, i);
    const value = generate(createRng(s));
    try {
      property(value);
    } catch (error) {
      const shrunk = options.shrink ? options.shrink(value, fails) : value;
      let reason = error instanceof Error ? error.message : String(error);
      try {
        property(shrunk);
      } catch (shrunkError) {
        reason = shrunkError instanceof Error ? shrunkError.message : String(shrunkError);
      }
      const message =
        `Property failed on case ${i} (base seed ${seed}, case seed ${s}).\n` +
        `Replay with INVARIANT_SEED=${seed}.\n` +
        `Shrunk input:\n${show(shrunk)}\n` +
        `Failure: ${reason}`;
      // Printed as well as thrown so it survives reporters that truncate messages.
      console.error(message);
      throw new Error(message);
    }
  }
}
