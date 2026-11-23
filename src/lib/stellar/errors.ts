/**
 * Source of truth: Talenttrust/Talenttrust-Contracts, EscrowError in
 * contracts/escrow/src/lib.rs at 2c4400bb7f696ec55994f5bfda35673db861128c.
 * https://github.com/Talenttrust/Talenttrust-Contracts/blob/2c4400bb7f696ec55994f5bfda35673db861128c/contracts/escrow/src/lib.rs
 * Preserve the contract's explicit discriminants; see docs/contract-errors.md.
 */

export interface TalentTrustError {
  code: number | string;
  message: string;
}

export interface ContractErrorDefinition {
  readonly name: string;
  readonly message: string;
}

/** The only maintained code-to-error table; compatibility exports derive below. */
export const CONTRACT_ERROR_TABLE: Readonly<Record<number, ContractErrorDefinition>> = {
  1: {
    name: 'AlreadyInitialized',
    message: 'The escrow contract has already been initialized.',
  },
  2: {
    name: 'NotInitialized',
    message: 'The escrow contract has not been initialized yet.',
  },
  3: {
    name: 'Unauthorized',
    message: 'Unauthorized: you are not allowed to perform this action.',
  },
  4: {
    name: 'Paused',
    message: 'This operation is paused by the contract administrator.',
  },
  5: {
    name: 'ContractNotFound',
    message: 'Contract not found.',
  },
  6: {
    name: 'InvalidParties',
    message: 'Invalid parties: the client and freelancer must be different addresses.',
  },
  7: {
    name: 'InvalidMilestones',
    message: 'Invalid milestones: provide a non-empty list within the contract limit.',
  },
  8: {
    name: 'InvalidAmount',
    message: 'Invalid amount or batch size: use a positive value within the allowed limits.',
  },
  9: {
    name: 'OverFunded',
    message: 'This deposit would exceed the escrow total.',
  },
  10: {
    name: 'InvalidStatus',
    message: 'Invalid status: this action is not allowed in the current contract state.',
  },
  11: {
    name: 'MilestoneNotFound',
    message: 'Milestone not found.',
  },
  12: {
    name: 'MilestoneAlreadyReleased',
    message: 'This milestone has already been released.',
  },
  13: {
    name: 'InsufficientFunds',
    message: 'Insufficient escrow funds to cover this payout.',
  },
  14: {
    name: 'InvalidSplit',
    message: 'Invalid dispute split: basis points must be between 0 and 10,000.',
  },
  15: {
    name: 'InvalidRating',
    message: 'Invalid rating: choose a value between 1 and 5.',
  },
  16: {
    name: 'ReputationAlreadyIssued',
    message: 'Reputation has already been issued for this escrow.',
  },
  17: {
    name: 'ArithmeticOverflow',
    message: 'The amount calculation exceeded the supported numeric range.',
  },
  18: {
    name: 'RatingNotFound',
    message: 'No rating exists for this escrow.',
  },
  19: {
    name: 'RatingAlreadyVoided',
    message: 'This rating has already been voided.',
  },
  20: {
    name: 'InvalidTransition',
    message: 'The requested contract state transition is not permitted.',
  },
  21: {
    name: 'NoSurplus',
    message: 'There is no surplus token balance available to withdraw.',
  },
  22: {
    name: 'EscrowFrozen',
    message: 'This escrow is frozen by the administrator.',
  },
  23: {
    name: 'AdminCannotBeParty',
    message: 'The contract administrator cannot be the client or freelancer.',
  },
  24: {
    name: 'MilestoneTooSmall',
    message: 'The milestone amount is below the contract minimum.',
  },
  25: {
    name: 'NotCompactable',
    message: 'This escrow is not yet eligible to be compacted into a receipt.',
  },
  26: {
    name: 'EscrowCompacted',
    message: 'This escrow has been compacted; read its receipt instead.',
  },
  27: {
    name: 'InvalidSplitConfig',
    message: 'Invalid team payout shares: they must total 10,000 basis points.',
  },
  28: {
    name: 'OutOfOrder',
    message: 'Release the preceding milestones before this one.',
  },
  29: {
    name: 'DuplicateIndex',
    message: 'A milestone index or team member address was supplied more than once.',
  },
  30: {
    name: 'BelowReputationThreshold',
    message: 'The released value is below the minimum required to issue reputation.',
  },
  31: {
    name: 'InvalidPanel',
    message: 'The arbiter panel members or voting threshold are invalid.',
  },
  32: {
    name: 'PanelRequired',
    message: 'This escrow requires an arbiter panel vote.',
  },
  33: {
    name: 'RoleUnchanged',
    message: 'The account already has the requested role setting.',
  },
  34: {
    name: 'TooManyFunders',
    message: 'The escrow has reached its maximum number of funders.',
  },
  35: {
    name: 'FundingExpired',
    message: 'The escrow funding window has expired.',
  },
  36: {
    name: 'NotExpired',
    message: 'The escrow funding window has not expired yet.',
  },
  37: {
    name: 'ChangeOrderNotFound',
    message: 'There is no pending change order or proposal for this escrow.',
  },
  38: {
    name: 'InvalidMetadata',
    message: 'The metadata hash or payload is invalid.',
  },
  39: {
    name: 'NoPendingUpgrade',
    message: 'There is no scheduled contract upgrade.',
  },
  40: {
    name: 'UpgradeNotReady',
    message: 'The scheduled contract upgrade is still time-locked.',
  },
  41: {
    name: 'InvalidReviewWindow',
    message: 'The milestone review window is outside the allowed duration.',
  },
  42: {
    name: 'MilestoneNotSubmitted',
    message: 'The freelancer has not submitted this milestone yet.',
  },
  43: {
    name: 'ReviewWindowActive',
    message: 'The milestone review window is still active.',
  },
  44: {
    name: 'TransferAmountMismatch',
    message: 'The token transferred a different amount than requested.',
  },
  45: {
    name: 'InvalidAdmin',
    message: 'The proposed administrator address is invalid.',
  },
  46: {
    name: 'NoPendingAdmin',
    message: 'There is no pending administrator nomination to accept.',
  },
  47: {
    name: 'EmergencyExitNotAvailable',
    message: 'Emergency exit is not available in the current state or pause duration.',
  },
  48: {
    name: 'SettlementMismatch',
    message: 'The settlement parameters do not match the pending proposal.',
  },
  49: {
    name: 'FeeTooHigh',
    message: 'The protocol fee exceeds the allowed maximum.',
  },
  50: {
    name: 'InvalidSchedule',
    message: 'The stream vesting schedule is invalid.',
  },
};

/** Legacy name lookup, re-exported by escrow.ts for existing consumers. */
export const CONTRACT_ERRORS: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(CONTRACT_ERROR_TABLE).map(([code, error]) => [code, error.name]),
);

export const ESCROW_ERROR_CODES = Object.keys(CONTRACT_ERROR_TABLE).map(Number);

export function escrowErrorMessage(code: number): string | undefined {
  return CONTRACT_ERROR_TABLE[code]?.message;
}

export function extractContractErrorCode(message: string): number | null {
  const match = message.match(/Error\(Contract,\s*#(\d+)\)/i);
  return match ? Number(match[1]) : null;
}

/** Parse simulation, wallet and RPC errors into a stable, human-readable message. */
export function parseContractError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  // Contract diagnostics take precedence over generic words such as "fee" or
  // "balance" elsewhere in the RPC message.
  const code = extractContractErrorCode(message);
  if (code !== null) return escrowErrorMessage(code) ?? `Contract error code ${code}.`;

  // Support legacy names and keep already formatted errors stable in the UI.
  const known = Object.values(CONTRACT_ERROR_TABLE).find(
    (error) => error.name === message || error.message === message,
  );
  if (known) return known.message;

  if (/user declined|user rejected|cancelled|canceled/i.test(message)) {
    return 'Signature rejected: you cancelled the request in your wallet.';
  }
  if (/passphrase|wrong network/i.test(message)) {
    return 'Network mismatch: switch Freighter to Stellar Testnet and try again.';
  }
  if (/not connected|wallet not|freighter not|extension/i.test(message)) {
    return 'Wallet not connected. Open Freighter and connect to this site.';
  }
  if (/insufficient|balance|xlm|fee/i.test(message)) {
    return 'Insufficient XLM: fund your testnet account with Friendbot before submitting.';
  }
  if (/timeout|timed out/i.test(message)) {
    return 'RPC timeout: the transaction was submitted but confirmation took too long. Check stellar.expert for the status.';
  }
  return message;
}
