export type Milestone = {
  id?: string | number;
  amount: number;
  released?: boolean;
};

export type Contract = {
  totalAmount: number;
  fundedAmount: number;
  releasedAmount?: number;
  milestones?: Milestone[];
};

export type ValidateResult = { ok: true; amount: number } | { ok: false; error: string };

const MAX_DECIMALS = 7;

function decimalPlaces(value: string): number {
  const dot = value.indexOf('.');
  if (dot === -1) return 0;
  return value.length - dot - 1;
}

export function formatIssueMax(max: number): string {
  return `max ${max.toFixed(MAX_DECIMALS).replace(/\.?0+$/, '')}`;
}

export function validateDeposit(input: string, contract: Contract): ValidateResult {
  const trimmed = (input ?? '').trim();
  if (trimmed === '') {
    return { ok: false, error: 'Enter an amount to deposit.' };
  }

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { ok: false, error: 'Amount must be a valid number.' };
  }

  if (decimalPlaces(trimmed) > MAX_DECIMALS) {
    return { ok: false, error: `Amount can have at most ${MAX_DECIMALS} decimal places.` };
  }

  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) {
    return { ok: false, error: 'Amount must be a valid number.' };
  }

  if (amount <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' };
  }

  const remaining = Math.max(0, contract.totalAmount - contract.fundedAmount);
  if (amount > remaining + 1e-7) {
    return {
      ok: false,
      error: `Amount exceeds remaining balance (${formatIssueMax(remaining)}).`,
    };
  }

  return { ok: true, amount };
}

export function remainingBalance(contract: Contract): number {
  return Math.max(0, contract.totalAmount - contract.fundedAmount);
}

/**
 * Smallest additional deposit that makes the next unreleased milestone releasable.
 * Returns 0 when the next milestone is already covered (or no milestones remain).
 */
export function nextMilestoneDeposit(contract: Contract): number {
  const milestones = contract.milestones ?? [];
  const released = contract.releasedAmount ?? 0;
  const funded = contract.fundedAmount;
  const next = milestones.find((m) => !m.released);
  if (!next) return 0;
  const gap = next.amount - (funded - released);
  return Math.max(0, gap);
}
