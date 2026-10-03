/**
 * Contract domain helpers and invariant guards.
 *
 * This module owns the pure, deterministic logic that guarantees the contract
 * detail route's state invariants. It is side-effect free so it can be used from
 * server and client components alike, and from tests without mocking the DOM.
 *
 * Invariants enforced here:
 *   1. Contract ids are non-empty, bounded in length, and match a conservative
 *      allowed character set. This prevents uncontrolled input from reaching
 *      the resolver or persistence layer.
 *   2. Contract status transitions are explicitly allowed or rejected; no
 *      silent mutation is possible.
 *   3. Milestone merges are deterministic and de-duplicated by milestone
  *      identifier, with persisted records taking precedence over resolved
 *      records.
 */

import type { Contract, ContractStatus, Milestone } from '@/types/domain';

/** Maximum length of a contract identifier accepted by the route. */
export const MAX_CONTRACT_ID_LENGTH = 64;

/** Allowed characters for a contract identifier. */
const CONTRACT_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Returns true when `id` is a structurally valid contract identifier.
 *
 * This is the single source of truth for route validation. It is pure and
 * total: every input returns either true or false with no thrown errors.
 */
export function isValidContractId(id: unknown): boolean {
  if (typeof id !== 'string') {
    return false;
  }
  if (id.length === 0 || id.length > MAX_CONTRACT_ID_LENGTH) {
    return false;
  }
  return CONTRACT_ID_PATTERN.test(id);
}

/**
 * Normalizes a contract id for comparison and lookup. Returns null when the
 * id is invalid, so callers must handle the failure explicitly.
 */
export function normalizeContractId(id: unknown): string | null {
  if (!isValidContractId(id)) {
    return null;
  }
  return (id as string).trim();
}

/**
 * Status transition table for contracts. Each key lists the statuses that
 * may be reached from it. Terminal statuses have empty transition lists.
 */
export const CONTRACT_STATUS_TRANSITIONS: Readonly<Record<ContractStatus, readonly ContractStatus[]>> =
  Object.freeze({
    Active: ['Complete', 'Dispute'],
    Complete: [],
    Dispute: [],
  });

/**
 * Returns true when the transition from `from` to `to` is allowed.
 * Identity transitions are rejected so that repeated operations do not silently
 * succeed and are instead reported as no-ops by the caller.
 */
export function canNTransitionContractStatus(
  from: ContractStatus,
  to: ContractStatus,
): boolean {
  if (from === to) {
    return false;
  }
  const allowed = CONTRACT_STATUS_TRANSITIONS[from];
  return Boolean(allowed && allowed.includes(to));
}

/**
 * Error thrown when an illegal status transition is attempted. The message
 * is safe to log and surface to users (contains no PII or secrets).
 */
export class InvalidContractTransitionError extends Error {
  readonly code = 'INVALID_CONTRACT_TRANSITION' as const;
  constructor(
    readonly from: ContractStatus,
    readonly to: ContractStatus,
  ) {
    super(`Illegal contract status transition from "${from}" to "${to}".`);
    this.name = 'InvalidContractTransitionError';
  }
}

/**
 * Applies a status transition to a contract, returning a new object and
 * leaving the input untouched. Throws `InvalidContractTransitionError` when
 * the transition is not allowed.
 */
/**
 * A contract after {@link applyContractStatusTransition} has moved it, with the
 * status narrowed to the status machine's own vocabulary.
 *
 * `Contract['status']` is the wider {@link StatusType}, which also carries
 * milestone-facing states such as `Paid`, so the transitioned shape is expressed
 * as an override of the `status` field rather than a plain `Contract`.
 */
export type TransitionedContract = Omit<Contract, 'status'> & { status: ContractStatus };

/**
 * Applies a status transition to a contract, returning a new object and
 * leaving the input untouched. Throws `InvalidContractTransitionError` when
 * the transition is not allowed.
 *
 * `status` is read through {@link ContractStatus}: a contract whose status is
 * outside the machine's vocabulary has no entry in
 * `CONTRACT_STATUS_TRANSITIONS`, so it is reported as an illegal transition
 * instead of being silently mutated.
 */
export function applyContractStatusTransition(
  contract: Contract,
  to: ContractStatus,
): TransitionedContract {
  const from = contract.status as ContractStatus;
  if (!canNTransitionContractStatus(from, to)) {
    throw new InvalidContractTransitionError(from, to);
  }
  return { ...contract, status: to };
}

/**
 * Deterministic merge of resolved and persisted milestones.
 *
 * Persisted records take precedence over resolver records with the same id * so that local mutations are never overwritten by stale resolver data. The
 * order of the output is stable: resolver order first, followed by
 * persisted-only milestones in their original order.
 */
export function mergeContractMilestones(
  resolved: readonly Milestone[],
  persisted: readonly Milestone[],
): Milestone[] {
  const byId = new Map<string, Milestone>();
  const order: string[] = [];

  for (const milestone of resolved) {
    if (!byId.has(milestone.id)) {
      order.push(milestone.id);
    }
    byId.set(milestone.id, milestone);
  }

  for (const milestone of persisted) {
    if (!byId.has(milestone.id)) {
      order.push(milestone.id);
    }
    // Persisted records always win.
    byId.set(milestone.id, milestone);
  }

  return order.map((id) => byId.get(id)!);
}
