/**
 * Concurrency-hardening regression suite for the milestone state model.
 *
 * `constants.test.ts` specifies the *behaviour* of the state machine. This file
 * specifies the properties that only matter when the module is used from
 * concurrent or overlapping execution contexts:
 *
 *  - shared state is frozen, so no caller can mutate the contract for another;
 *  - every guard is pure and total, so interleaved calls cannot combine into a
 *    partial result (and never throw on hostile input);
 *  - the optimistic `expectedVersion` guard lets exactly one of two writers
 *    commit, and reports staleness ahead of transition validity;
 *  - batch reconciliation is deterministic, idempotent and isolated, so a
 *    retried or interleaved batch cannot double-apply or abort the rest.
 */
import {
  MILESTONE_STATUS_ORDER,
  MILESTONE_STATUS_TRANSITIONS,
  SAMPLE_MILESTONES,
  TERMINAL_STATUSES,
  VALID_STATUSES,
  MilestoneTransitionError,
  applyMilestoneTransition,
  assertSampleMilestones,
  getNextStatus,
  getStatusIndex,
  isAllowedTransition,
  isPayoutConsistentWithStatus,
  isTerminalStatus,
  isValidMilestone,
  isValidStatus,
  normalizeMilestones,
  reconcileMilestoneTransitions,
  validateMilestoneInvariants,
} from './constants';
import type { MilestoneTransitionRequest } from './constants';
import type { Milestone, MilestoneStatus } from '@/types/domain';

const milestone = (overrides: Partial<Milestone> = {}): Milestone => ({
  id: 'm-1',
  title: 'Test milestone',
  status: 'Pending',
  payout: 1000,
  currency: 'USD',
  dueDate: '2026-01-01',
  ...overrides,
});

/** Runs `run` and returns the rejection, asserting it is a typed domain error. */
const capture = (run: () => unknown): MilestoneTransitionError => {
  try {
    run();
  } catch (error) {
    if (error instanceof MilestoneTransitionError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected the transition to be rejected.');
};

/** Values a caller could hand us from an untrusted boundary. */
const hostileValues: unknown[] = [
  'Bogus',
  'pending',
  '',
  ' ',
  null,
  undefined,
  0,
  1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  {},
  [],
  () => undefined,
];

const asStatus = (value: unknown): MilestoneStatus => value as MilestoneStatus;

describe('immutable shared state', () => {
  it('freezes every shared status collection', () => {
    expect(Object.isFrozen(MILESTONE_STATUS_ORDER)).toBe(true);
    expect(Object.isFrozen(VALID_STATUSES)).toBe(true);
    expect(Object.isFrozen(TERMINAL_STATUSES)).toBe(true);
    expect(Object.isFrozen(MILESTONE_STATUS_TRANSITIONS)).toBe(true);
    expect(Object.isFrozen(SAMPLE_MILESTONES)).toBe(true);
  });

  it('freezes the per-status transition lists and the sample entries', () => {
    for (const status of VALID_STATUSES) {
      expect(Object.isFrozen(MILESTONE_STATUS_TRANSITIONS[status])).toBe(true);
    }
    for (const sample of SAMPLE_MILESTONES) {
      expect(Object.isFrozen(sample)).toBe(true);
    }
  });

  it('rejects mutation of shared state instead of letting it leak between callers', () => {
    expect(() => (VALID_STATUSES as MilestoneStatus[]).push('Bogus')).toThrow();
    expect(() =>
      (MILESTONE_STATUS_TRANSITIONS as Record<MilestoneStatus, MilestoneStatus[]>)['Paid'].push(
        'Pending',
      ),
    ).toThrow();
    expect(() => (MILESTONE_STATUS_ORDER as MilestoneStatus[]).splice(0, 1)).toThrow();
    expect(() => {
      (SAMPLE_MILESTONES[0] as Milestone).status = 'Paid';
    }).toThrow();
    expect(() => (SAMPLE_MILESTONES as Milestone[]).push(milestone())).toThrow();
  });

  it('leaves shared state unchanged after hostile readers run', () => {
    const snapshot = () =>
      JSON.stringify({
        order: MILESTONE_STATUS_ORDER,
        valid: VALID_STATUSES,
        transitions: MILESTONE_STATUS_TRANSITIONS,
        samples: SAMPLE_MILESTONES,
      });

    const before = snapshot();
    for (const value of hostileValues) {
      isValidStatus(value);
      getStatusIndex(asStatus(value));
      getNextStatus(asStatus(value));
      isTerminalStatus(asStatus(value));
      isAllowedTransition(asStatus(value), 'Paid');
      validateMilestoneInvariants(value);
    }
    expect(snapshot()).toBe(before);
  });
});

describe('pure, total guards', () => {
  it('returns identical answers for repeated and interleaved calls', async () => {
    const answers = await Promise.all(
      Array.from({ length: 32 }, () =>
        Promise.resolve().then(() => ({
          order: [...MILESTONE_STATUS_ORDER],
          next: VALID_STATUSES.map((status) => [status, getNextStatus(status)]),
          allowed: VALID_STATUSES.map((from) =>
            VALID_STATUSES.map((to) => isAllowedTransition(from, to)),
          ),
        })),
      ),
    );

    for (const answer of answers) {
      expect(answer).toEqual(answers[0]);
    }
  });

  it('never throws while answering a question about hostile input', () => {
    for (const value of hostileValues) {
      expect(() => isValidStatus(value)).not.toThrow();
      expect(() => getStatusIndex(asStatus(value))).not.toThrow();
      expect(() => getNextStatus(asStatus(value))).not.toThrow();
      expect(() => isTerminalStatus(asStatus(value))).not.toThrow();
      expect(() => isAllowedTransition(asStatus(value), asStatus(value))).not.toThrow();
      expect(() => isPayoutConsistentWithStatus(asStatus(value), value)).not.toThrow();
      expect(() => validateMilestoneInvariants(value)).not.toThrow();
    }
  });

  it('rejects hostile values without trusting them as statuses or payouts', () => {
    for (const value of hostileValues) {
      expect(isValidStatus(value)).toBe(false);
      expect(getStatusIndex(asStatus(value))).toBe(-1);
      expect(getNextStatus(asStatus(value))).toBeNull();
      expect(isTerminalStatus(asStatus(value))).toBe(false);
      expect(isAllowedTransition(asStatus(value), 'Paid')).toBe(false);
      expect(isAllowedTransition('Pending', asStatus(value))).toBe(false);
    }
    expect(isPayoutConsistentWithStatus('Paid', '100')).toBe(false);
    expect(isPayoutConsistentWithStatus('Paid', 0)).toBe(false);
  });

  it('returns no forward step for terminal, branch and unknown statuses', () => {
    expect(getNextStatus('Paid')).toBeNull();
    expect(getNextStatus('Disputed')).toBeNull();
    expect(getNextStatus('Bogus' as MilestoneStatus)).toBeNull();
  });
});

describe('optimistic concurrency', () => {
  it('applies the transition without mutating the input and bumps the version', () => {
    const stored = milestone({ version: 3 });
    const next = applyMilestoneTransition(stored, 'Completed', { expectedVersion: 3 });

    expect(next).not.toBe(stored);
    expect(next.status).toBe('Completed');
    expect(next.version).toBe(4);
    expect(stored.status).toBe('Pending');
    expect(stored.version).toBe(3);
  });

  it('rejects a write whose expectation no longer matches the stored record', () => {
    // The record has advanced to version 8 (another session committed), but
    // this write was queued while the caller still held version 7.
    const stored = milestone({ status: 'Completed', version: 8 });

    const error = capture(() =>
      applyMilestoneTransition(stored, 'Paid', { expectedVersion: 7 }),
    );

    expect(error.code).toBe('STALE_VERSION');
    expect(error.milestoneId).toBe('m-1');
    expect(error.message).toMatch(/Stale milestone transition/);
    // The writer holding the current version still lands.
    expect(applyMilestoneTransition(stored, 'Paid', { expectedVersion: 8 }).status).toBe('Paid');
  });

  it('lets exactly one writer commit against a given record version', () => {
    const stored = milestone({ version: 1 });
    const committed = applyMilestoneTransition(stored, 'Completed', { expectedVersion: 1 });
    expect(committed.version).toBe(2);

    const loser = capture(() =>
      applyMilestoneTransition(committed, 'Completed', { expectedVersion: 1 }),
    );
    expect(loser.code).toBe('STALE_VERSION');
  });

  it('reports staleness ahead of transition validity', () => {
    const stored = milestone({ status: 'Paid', version: 5 });
    // `Paid -> Completed` is invalid *and* the version is stale; the caller's
    // view of the record is the more fundamental problem, so it wins.
    const error = capture(() =>
      applyMilestoneTransition(stored, 'Completed', { expectedVersion: 4 }),
    );
    expect(error.code).toBe('STALE_VERSION');
  });

  it('skips the guard entirely when no expected version is supplied', () => {
    const stored = milestone({ status: 'Completed', version: 9 });
    expect(applyMilestoneTransition(stored, 'Paid').status).toBe('Paid');
  });

  it('rejects an unrecognized current status instead of guessing', () => {
    const corrupted = { ...milestone(), status: 'Bogus' as MilestoneStatus };
    const error = capture(() => applyMilestoneTransition(corrupted, 'Completed'));
    expect(error.code).toBe('UNKNOWN_STATUS');
  });
});

describe('batch reconciliation', () => {
  it('applies independent requests against a snapshot without mutating it', () => {
    const a = milestone({ id: 'a', status: 'Pending' });
    const b = milestone({ id: 'b', status: 'Completed' });
    const untouched = milestone({ id: 'untouched', status: 'Pending' });
    const snapshot = [a, b, untouched];

    const outcomes = reconcileMilestoneTransitions(snapshot, [
      { id: 'a', to: 'Completed' },
      { id: 'b', to: 'Paid' },
    ]);

    expect(outcomes.map((outcome) => outcome.id)).toEqual(['a', 'b']);
    expect(outcomes[0]).toMatchObject({ id: 'a', ok: true, applied: true });
    expect(outcomes[1]).toMatchObject({ id: 'b', ok: true, applied: true });
    // Milestones with no matching request are left alone entirely.
    expect(a.status).toBe('Pending');
    expect(untouched.status).toBe('Pending');
    expect(snapshot).toHaveLength(3);
  });

  it('is idempotent: replaying a committed batch reports already_current', () => {
    const committed = milestone({ status: 'Completed', version: 2 });

    const first = reconcileMilestoneTransitions([committed], [{ id: 'm-1', to: 'Completed' }]);
    const second = reconcileMilestoneTransitions([committed], [{ id: 'm-1', to: 'Completed' }]);

    expect(first[0]).toMatchObject({ ok: true, applied: false, reason: 'already_current' });
    expect(second).toEqual(first);
  });

  it('collapses duplicate requests to the last write and applies each milestone once', () => {
    const target = milestone({ id: 'm-1', status: 'Pending' });

    const outcomes = reconcileMilestoneTransitions([target], [
      // Invalid from Pending, but superseded by the request below.
      { id: 'm-1', to: 'Paid' },
      { id: 'm-1', to: 'Completed' },
    ]);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ ok: true, applied: true });
    if (outcomes[0].ok) {
      expect(outcomes[0].milestone.status).toBe('Completed');
    }
  });

  it('is order independent with respect to the snapshot', () => {
    const a = milestone({ id: 'a', status: 'Pending' });
    const b = milestone({ id: 'b', status: 'Pending' });

    const forward = reconcileMilestoneTransitions([a, b], [
      { id: 'a', to: 'Completed' },
      { id: 'b', to: 'Disputed' },
    ]);
    const reversed = reconcileMilestoneTransitions([b, a], [
      { id: 'a', to: 'Completed' },
      { id: 'b', to: 'Disputed' },
    ]);

    expect(forward.map((outcome) => outcome.id)).toEqual(['a', 'b']);
    expect(reversed.map((outcome) => outcome.id)).toEqual(['b', 'a']);

    const mapById = (outcomes: ReturnType<typeof reconcileMilestoneTransitions>) =>
      new Map(outcomes.map((outcome) => [outcome.id, outcome] as const));
    expect(mapById(reversed)).toEqual(mapById(forward));
  });

  it('reports each failure without aborting the rest of the batch', () => {
    const healthy = milestone({ id: 'a', status: 'Pending' });
    const incoherent = milestone({ id: 'b', status: 'Completed', payout: 0 });
    const alsoHealthy = milestone({ id: 'c', status: 'Pending' });

    const outcomes = reconcileMilestoneTransitions([healthy, incoherent, alsoHealthy], [
      { id: 'a', to: 'Completed' },
      { id: 'b', to: 'Paid' },
      { id: 'c', to: 'Disputed' },
      { id: 'ghost', to: 'Paid' },
    ]);

    expect(outcomes.map((outcome) => outcome.id)).toEqual(['a', 'b', 'c', 'ghost']);
    expect(outcomes[0]).toMatchObject({ ok: true, applied: true });
    expect(outcomes[1]).toMatchObject({ ok: false, code: 'INVARIANT_VIOLATION' });
    expect(outcomes[2]).toMatchObject({ ok: true, applied: true });
    expect(outcomes[3]).toMatchObject({ ok: false, code: 'UNKNOWN_MILESTONE' });
  });

  it('never throws, whatever the request batch contains', () => {
    const target = milestone({ status: 'Paid', version: 4 });

    expect(() =>
      reconcileMilestoneTransitions([target], [
        { id: 'm-1', to: 'Completed', expectedVersion: 1 },
        { id: 'm-1', to: 'Bogus' as MilestoneStatus },
        { id: 'm-1', to: 'Paid' },
        { id: '', to: 'Paid' },
        null as unknown as { id: string; to: MilestoneStatus },
      ]),
    ).not.toThrow();
  });

  it('produces identical, side-effect-free outcomes for concurrent invocations', async () => {
    const snapshot = [
      milestone({ id: 'a', status: 'Pending' }),
      milestone({ id: 'b', status: 'Completed', payout: 0 }),
    ];
    const summarize = (outcomes: ReturnType<typeof reconcileMilestoneTransitions>) =>
      outcomes.map((outcome) => [
        outcome.id,
        outcome.ok,
        'applied' in outcome ? outcome.applied : null,
        outcome.ok ? null : outcome.code,
      ]);

    const runs = await Promise.all(
      Array.from({ length: 16 }, () =>
        Promise.resolve().then(() =>
          reconcileMilestoneTransitions(snapshot, [
            { id: 'a', to: 'Completed' },
            { id: 'b', to: 'Paid' },
            { id: 'ghost', to: 'Paid' },
          ]),
        ),
      ),
    );

    for (const run of runs) {
      expect(summarize(run)).toEqual(summarize(runs[0]));
    }
    expect(snapshot.map((entry) => entry.status)).toEqual(['Pending', 'Completed']);
  });
});

describe('milestone transition error contract', () => {
  it('throws a typed, code-bearing error that survives transpilation', () => {
    const error = capture(() => applyMilestoneTransition(milestone(), 'Paid'));

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(MilestoneTransitionError);
    expect(error.name).toBe('MilestoneTransitionError');
    expect(error.code).toBe('INVALID_TRANSITION');
    expect(error.milestoneId).toBe('m-1');
  });

  it('keeps rejection messages free of milestone payload fields', () => {
    const confidential = milestone({
      title: 'Confidential merger payout',
      currency: 'ZZZ',
      payout: 987654,
    });

    const error = capture(() => applyMilestoneTransition(confidential, 'Paid'));

    expect(error.message).not.toContain('Confidential merger payout');
    expect(error.message).not.toContain('ZZZ');
    expect(error.message).not.toContain('987654');
    // The diagnostic still names the record and the move, which is what a
    // caller needs to act on it.
    expect(error.message).toContain('m-1');
    expect(error.message).toContain('Pending');
  });

  it('reports the expected and observed versions on a stale write', () => {
    const error = capture(() =>
      applyMilestoneTransition(milestone({ version: 12 }), 'Completed', { expectedVersion: 11 }),
    );

    expect(error.code).toBe('STALE_VERSION');
    expect(error.message).toContain('11');
    expect(error.message).toContain('12');
  });
});

describe('sample data invariants', () => {
  it('accepts the shipped sample milestones', () => {
    expect(() => assertSampleMilestones()).not.toThrow();
    expect(() => assertSampleMilestones(SAMPLE_MILESTONES)).not.toThrow();
    for (const sample of SAMPLE_MILESTONES) {
      expect(validateMilestoneInvariants(sample)).toEqual([]);
    }
  });

  it('throws, read-only, when an invariant is violated', () => {
    const broken = milestone({ id: 'broken', payout: -1 });
    expect(() => assertSampleMilestones([broken])).toThrow(/violates milestone invariants/);
    expect(broken.payout).toBe(-1);
  });

  it('throws on duplicate ids', () => {
    const duplicated = milestone({ id: 'same' });
    expect(() => assertSampleMilestones([duplicated, { ...duplicated }])).toThrow(
      /duplicates id "same"/,
    );
  });

  it('accepts a frozen collection', () => {
    const frozen = Object.freeze([milestone({ id: 'frozen' })]);
    expect(() => assertSampleMilestones(frozen)).not.toThrow();
  });
});

describe('normalizeMilestones (overlapping loads)', () => {
  it('drops invalid entries and collapses duplicate ids with last-write-wins', () => {
    const values: unknown[] = [
      milestone({ id: 'a', status: 'Pending' }),
      { id: 'b', title: '', status: 'Pending', payout: 1, currency: 'USD', dueDate: '2026-01-01' },
      milestone({ id: 'a', status: 'Completed' }),
      'not a milestone',
      null,
    ];

    const normalized = normalizeMilestones(values);

    expect(normalized.map((entry) => entry.id)).toEqual(['a']);
    expect(normalized[0].status).toBe('Completed');
    // The input is left exactly as it was.
    expect(values).toHaveLength(5);
    // Deterministic across repeated/overlapping loads.
    expect(normalizeMilestones(values)).toEqual(normalized);
  });

  it('returns an empty list for an empty or entirely invalid input', () => {
    expect(normalizeMilestones([])).toEqual([]);
    expect(normalizeMilestones([null, 1, {}, 'x'])).toEqual([]);
  });
});

describe('boundary hardening', () => {
  it('rejects payloads that are not milestone objects at the transition entry point', () => {
    for (const value of [null, undefined, 'Pending', 0] as unknown[]) {
      const error = capture(() => applyMilestoneTransition(value as Milestone, 'Paid'));
      expect(error.code).toBe('UNKNOWN_STATUS');
      expect(error.message).toMatch(/not a milestone object/);
    }
  });

  it('rejects calendar dates that only look like ISO dates', () => {
    // The shape passes the pattern, so the date itself must be validated.
    expect(validateMilestoneInvariants(milestone({ dueDate: '2026-13-45' }))).toContain(
      'Milestone dueDate must be an ISO date string (YYYY-MM-DD)',
    );
    // A real-looking but non-existent day must not survive date normalisation.
    expect(validateMilestoneInvariants(milestone({ dueDate: '2026-02-30' }))).toContain(
      'Milestone dueDate must be an ISO date string (YYYY-MM-DD)',
    );
    expect(isValidMilestone(milestone({ dueDate: '2028-02-29' }))).toBe(true);
  });

  it('ignores malformed snapshot entries and requests instead of throwing', () => {
    const snapshot = [
      null,
      'not a milestone',
      { id: 42 },
      milestone({ id: 'a', status: 'Pending' }),
    ] as unknown as Milestone[];
    const requests = [
      null,
      { to: 'Completed' },
      { id: 7, to: 'Paid' },
      { id: 'a', to: 'Completed' },
    ] as unknown as MilestoneTransitionRequest[];

    const outcomes = reconcileMilestoneTransitions(snapshot, requests);

    expect(outcomes.map((outcome) => outcome.id)).toEqual(['a']);
    expect(outcomes[0]).toMatchObject({ ok: true, applied: true });
  });
});
