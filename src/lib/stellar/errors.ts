/**
 * Maps Soroban EscrowError contract codes (1–16) to human-readable messages,
 * plus well-known wallet and RPC failure strings.
 */

export interface TalentTrustError {
  code: number | string;
  message: string;
}

// Contract error table — must cover all 16 EscrowError variants.
const CONTRACT_ERROR_MESSAGES: Record<number, string> = {
  1: 'Contract not found.',
  2: 'Unauthorized: only the contract owner can perform this action.',
  3: 'Invalid status: this action is not allowed in the current contract state.',
  4: 'Insufficient funds: the escrow does not hold enough balance.',
  5: 'Already funded: the escrow has already been fully funded.',
  6: 'Not funded: the escrow must be fully funded before releasing milestones.',
  7: 'Invalid milestones: between 1 and 20 milestones are required.',
  8: 'Milestone not found.',
  9: 'Milestone already released.',
  10: 'Dispute already open.',
  11: 'No active dispute to resolve.',
  12: 'Invalid basis points: resolution split must total 10,000 bps.',
  13: 'Reputation already issued for this contract.',
  14: 'Invalid rating: must be between 1 and 5.',
  15: 'Contract is paused by the admin circuit breaker.',
  16: 'Arithmetic overflow in fee or amount calculation.',
};

/**
 * Parse a raw error thrown during simulation, signing, or submission and
 * return a human-readable message.
 */
export function parseContractError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;

    // User rejected the signing request in the wallet
    if (/user declined|user rejected|cancelled|canceled/i.test(msg)) {
      return 'Signature rejected: you cancelled the request in your wallet.';
    }

    // Wrong network / passphrase mismatch
    if (/passphrase|wrong network/i.test(msg)) {
      return 'Network mismatch: switch Freighter to Stellar Testnet and try again.';
    }

    // Wallet not connected or extension not installed
    if (/not connected|wallet not|freighter not|extension/i.test(msg)) {
      return 'Wallet not connected. Open Freighter and connect to this site.';
    }

    // Insufficient XLM for fees
    if (/insufficient|balance|xlm|fee/i.test(msg)) {
      return 'Insufficient XLM: fund your testnet account with Friendbot before submitting.';
    }

    // RPC timeout
    if (/timeout|timed out/i.test(msg)) {
      return 'RPC timeout: the transaction was submitted but confirmation took too long. Check stellar.expert for the status.';
    }

    // Contract error codes embedded in XDR diagnostic strings, e.g. "Error(Contract, #7)"
    const contractCodeMatch = msg.match(/Error\(Contract,\s*#(\d+)\)/i);
    if (contractCodeMatch) {
      const code = parseInt(contractCodeMatch[1], 10);
      return CONTRACT_ERROR_MESSAGES[code] ?? `Contract error code ${code}.`;
    }

    return msg;
  }

  return String(err);
}

/**
 * Look up the human-readable message for a numeric EscrowError code directly.
 * Returns undefined when the code is not in the table.
 */
export function escrowErrorMessage(code: number): string | undefined {
  return CONTRACT_ERROR_MESSAGES[code];
}

/** Exported for tests — lets tests iterate the full table. */
export const ESCROW_ERROR_CODES = Object.keys(CONTRACT_ERROR_MESSAGES).map(Number);
