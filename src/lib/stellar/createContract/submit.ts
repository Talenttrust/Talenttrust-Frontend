/**
 * Generic simulate → sign → submit → poll pipeline for Soroban transactions.
 *
 * Steps:
 *   1. rpc.prepareTransaction  — simulation + footprint + fee bump
 *   2. wallet signTransaction  — Freighter prompts the user (uses config passphrase)
 *   3. rpc.sendTransaction     — broadcasts the signed XDR
 *   4. poll rpc.getTransaction — waits up to 60 s for SUCCESS or FAILED
 *
 * The network passphrase is always taken from stellarConfig, never from the
 * wallet response, so a mismatch causes an early error.
 */

import type { Transaction } from '@stellar/stellar-sdk';
import { getRpcServer } from './escrow';
import { signTransaction } from './freighter';
import { parseContractError } from '../errors';
import { stellarConfig } from '@/lib/stellar/config';
import {
  isTransactionCancelled,
  submitTransaction as runSubmitTransaction,
  type SubmitResult,
  type SubmitTransactionOptions,
} from '../transaction';

export type { SubmitResult } from '../transaction';

/** Maximum time to wait for ledger confirmation (ms). */
const POLL_TIMEOUT_MS = 60_000;
/** Interval between getTransaction polls (ms). */
const POLL_INTERVAL_MS = 3_000;

/**
 * Run the full simulate → sign → submit → poll pipeline.
 *
 * Throws a plain Error with a human-readable message on any failure so callers
 * can display it directly without further parsing.
 */
export async function simulateSignSubmit(
  tx: Transaction,
  options: SubmitTransactionOptions = {},
): Promise<SubmitResult> {
  try {
    return await runSubmitTransaction(tx, {
      timeoutMs: POLL_TIMEOUT_MS,
      pollIntervalMs: POLL_INTERVAL_MS,
      ...options,
      server: options.server ?? (getRpcServer() as never),
      sign: options.sign ?? ((xdr, opts) => signTransaction(xdr, opts.networkPassphrase)),
      networkPassphrase: options.networkPassphrase ?? stellarConfig.passphrase,
      errorLabel: options.errorLabel ?? 'Transaction rejected by the network',
    });
  } catch (err) {
    if (isTransactionCancelled(err)) throw err;
    throw new Error(parseContractError(err));
  }
}
