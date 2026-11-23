import type { EscrowContract } from './api';

/** Statuses in which releasing the last milestone completes the escrow. */
const LIVE: EscrowContract['status'][] = ['Created', 'Funded'];

/**
 * Discriminated union of all optimistic actions that can be dispatched
 * against the contracts list.  Only Release and Fund are optimistic;
 * Cancel / Dispute / Resolve are kept as blocking actions.
 */
export type OptimisticAction =
  | { type: 'release'; contractId: number; milestoneIndex: number }
  | { type: 'deposit'; contractId: number; amount: number };

// ──────────────────────────────────────────────────────────────────────────────
// applyRelease
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns a new contract that mirrors the server's outcome when milestone
 * at `index` is successfully released.
 *
 * `index` is the milestone's own `index` field (what the release endpoint and
 * `EscrowCard` use), not its position in the array: the API does not promise
 * milestones in index order.
 *
 * Rules (mirrors backend `store.release`):
 * - Mark the target milestone as released.
 * - Increment releasedAmount by the milestone amount.
 * - If every milestone is now released and the escrow is still live
 *   (Created or Funded) → status becomes "Completed". Disputed and terminal
 *   statuses are never overwritten.
 *
 * Throws RangeError for an unknown index so callers can gate the dispatch.
 */
export function applyRelease(contract: EscrowContract, index: number): EscrowContract {
  const milestone = contract.milestones.find((m) => m.index === index);
  if (!milestone) {
    throw new RangeError(
      `applyRelease: no milestone with index ${index} (0–${contract.milestones.length - 1})`,
    );
  }

  // Idempotent: if already released, return as-is.
  if (milestone.released) return contract;

  const updatedMilestones = contract.milestones.map((m) =>
    m.index === milestone.index ? { ...m, released: true } : m,
  );

  const newReleasedAmount = contract.releasedAmount + milestone.amount;
  const allReleased = updatedMilestones.every((m) => m.released);

  return {
    ...contract,
    milestones: updatedMilestones,
    releasedAmount: newReleasedAmount,
    status: allReleased && LIVE.includes(contract.status) ? 'Completed' : contract.status,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// applyDeposit
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns a new contract that mirrors the server's outcome when `amount`
 * is deposited into escrow.
 *
 * Rules (mirrors backend `store.deposit`):
 * - Increment fundedAmount by amount.
 * - If a "Created" escrow's fundedAmount reaches totalAmount → status becomes
 *   "Funded". (Status stays "Created" if still underfunded.) Any other status is
 *   kept: a deposit must never turn a Completed, Disputed or terminal escrow
 *   back into "Funded".
 *
 * Throws RangeError for a non-positive amount.
 */
export function applyDeposit(contract: EscrowContract, amount: number): EscrowContract {
  if (amount <= 0) {
    throw new RangeError(`applyDeposit: amount must be positive, got ${amount}`);
  }

  const newFundedAmount = contract.fundedAmount + amount;
  const fullyFunded = newFundedAmount >= contract.totalAmount;

  return {
    ...contract,
    fundedAmount: newFundedAmount,
    status: fullyFunded && contract.status === 'Created' ? 'Funded' : contract.status,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// contractsReducer — feeds directly into useOptimistic
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Reducer that applies an optimistic action to the full contracts list.
 * Passed as the second argument to `useOptimistic(contracts, contractsReducer)`.
 *
 * Unknown contract IDs are a no-op (guard against stale dispatches).
 */
export function contractsReducer(
  state: EscrowContract[],
  action: OptimisticAction,
): EscrowContract[] {
  return state.map((c) => {
    if (c.id !== action.contractId) return c;
    try {
      if (action.type === 'release') return applyRelease(c, action.milestoneIndex);
      if (action.type === 'deposit') return applyDeposit(c, action.amount);
    } catch {
      // If the reducer throws (invalid index/amount) return unchanged.
      return c;
    }
    return c;
  });
}
