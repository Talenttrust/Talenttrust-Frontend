# Milestone Status Model, Concurrency & Transition Invariants

This document describes the concurrency controls and state invariants implemented
for `src/app/milestones/constants.ts` (Issue #1197) — the single source of truth
for the milestone state machine.

---

## 1. Why this module needs hardening

`constants.ts` is evaluated **once per process** (and once per client bundle) and
then read by the milestones page, its seed data and its tests. Any mutable state
on that module is therefore shared, in-process, by every concurrent reader: one
caller mutating a status list or the sample data silently changes the contract
for everyone else. The module is also the boundary where untrusted data (storage,
network, URL state) is validated before it drives UI or writes.

The hardening below makes the module safe to use from overlapping and interleaved
execution contexts without introducing any new runtime dependency.

## 2. Core invariants

1. **Immutable shared state.**
   `MILESTONE_STATUS_ORDER`, `VALID_STATUSES`, `TERMINAL_STATUSES`,
   `MILESTONE_STATUS_TRANSITIONS`, each per-status transition list,
   `SAMPLE_MILESTONES` and every sample entry are frozen at module load.
   Attempting to mutate them throws a `TypeError` instead of corrupting the
   contract for another caller. The derived lookup tables (a `Set` and a `Map`)
   are intentionally **not exported**, so no caller can hold a reference to them.

2. **Pure, total helpers.**
   Every guard is deterministic and holds no module-level mutable state, so
   interleaved calls cannot combine into a partial result. Guards accept
   `unknown` and never throw — hostile input (`null`, `NaN`, `'Bogus'`, objects)
   resolves to `false` / `-1` / `null` rather than raising. Only
   `applyMilestoneTransition` throws, and only with typed errors.

3. **Optimistic concurrency (`expectedVersion`).**
   `applyMilestoneTransition(milestone, to, { expectedVersion })` rejects a write
   whose expectation no longer matches the record with code `STALE_VERSION`,
   instead of silently overwriting a newer version committed by another session.
   A successful transition returns a **new** object with `version` incremented
   (starting at `1`), so the persisted result can be handed back as the next
   writer's expectation. Order of checks is part of the contract: staleness is
   reported *before* transition validity, because the caller's view of the record
   is the more fundamental problem.

4. **Idempotent, order-independent batching.**
   `reconcileMilestoneTransitions(snapshot, requests)` applies a batch against a
   snapshot:
   - outcomes follow the snapshot order (deterministic for equal inputs);
   - duplicate requests for an id collapse to the last one (last-write-wins,
     matching the persistence layer) and each milestone is applied at most once;
   - a request whose target state is already in effect returns
     `{ ok: true, applied: false, reason: 'already_current' }`, so replaying a
     committed batch is a no-op rather than an error;
   - a failure is returned per request — one rejection never aborts the rest;
   - requests naming an id absent from the snapshot return `UNKNOWN_MILESTONE`;
   - neither the snapshot nor the requests are ever mutated.

5. **Fail-fast sample data.**
   `assertSampleMilestones()` runs at module load and throws a deterministic
   `Error` on the first violation (unknown status, empty id/title/currency,
   negative or non-finite payout, `Paid` with a zero payout, malformed `dueDate`,
   duplicate id), so drift is caught in CI rather than surfacing as a silently
   inconsistent UI.

## 3. State machine

| From | Allowed to | Notes |
| --- | --- | --- |
| `Pending` | `Completed`, `Disputed` | Only entry state for a new milestone. |
| `Completed` | `Paid`, `Disputed` | |
| `Paid` | — | Terminal; no outgoing transition. |
| `Disputed` | — | Branch; leaving it requires the resolution flow modelled elsewhere. |

Self-transitions (`X -> X`) are never allowed: `isAllowedTransition` returns
`false` and `applyMilestoneTransition` throws `INVALID_TRANSITION`, so a repeated
or retried write cannot silently succeed as a no-op. `getStatusIndex` /
`getNextStatus` operate on the linear pipeline only (`Pending → Completed → Paid`),
so `Disputed` reports `-1` / `null`.

Payout coherence is enforced by `isPayoutConsistentWithStatus`: `Paid` requires a
strictly positive amount, every other status accepts a non-negative finite amount,
and `NaN` / `Infinity` / negative / non-numeric values are always rejected.

## 4. Error contract

`MilestoneTransitionError` extends `Error`, survives transpilation
(`instanceof` works under `next/babel`), and exposes a stable `code`:
`UNKNOWN_MILESTONE`, `UNKNOWN_STATUS`, `INVALID_TRANSITION`, `STALE_VERSION`,
`INVARIANT_VIOLATION`. Messages contain only the milestone **id** and the status
values involved — never the full payload — so a diagnostic can be logged or shown
to a user without leaking milestone contents.

## 5. Tests

- `src/app/milestones/constants.test.ts` — behavioural specification of the state
  machine.
- `src/app/milestones/constants.concurrency.test.ts` — the properties above:
  frozen shared state and refused mutation, purity/totality under hostile input,
  optimistic-concurrency precedence, batch determinism/idempotence/isolation, and
  rejection messages free of payload fields.
