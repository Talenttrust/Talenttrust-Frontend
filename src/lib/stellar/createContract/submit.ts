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

import {
  Transaction,
  TransactionBuilder,
  scValToNative,
} from '@stellar/stellar-sdk';
import { rpc as StellarRpc } from '@stellar/stellar-sdk';
import { getRpcServer } from './escrow';
import { signTransaction } from './freighter';
import { parseContractError } from '../errors';
import { stellarConfig } from '@/lib/stellar/config';

export interface SubmitResult {
  /** Transaction hash on the network. */
  hash: string;
  /**
   * The native JS value decoded from the contract's return ScVal.
   * For create_contract this is a bigint (u64).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  returnValue: any;
}

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
export async function simulateSignSubmit(tx: Transaction): Promise<SubmitResult> {
  const networkPassphrase = stellarConfig.passphrase;
  try {
    return await submitTransaction(tx);
  } catch (err) {
    throw new Error(parseContractError(err));
  }
}

async function submitTransaction(tx: Transaction): Promise<SubmitResult> {
  const server = getRpcServer();

  // ── 1. Simulate & prepare ────────────────────────────────────────────────
  const prepared = (await server.prepareTransaction(tx)) as Transaction;

  // ── 2. Sign via wallet ───────────────────────────────────────────────────
  const xdrToSign = prepared.toXDR();
  const { signedTxXdr, error: signError } = await signTransaction(xdrToSign, networkPassphrase);
  if (signError || !signedTxXdr) {
    throw new Error(signError ?? 'Wallet returned an empty signature.');
  }

  // ── 3. Submit ────────────────────────────────────────────────────────────
  const signedTx = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase) as Transaction;
  const sendResult = await server.sendTransaction(signedTx);

  if (sendResult.status === 'ERROR') {
    const detail = (sendResult as { errorResult?: { result?: () => unknown } }).errorResult;
    throw new Error(`Transaction rejected by the network: ${JSON.stringify(detail ?? sendResult.status)}`);
  }

  const hash = sendResult.hash;

  // ── 4. Poll for confirmation ─────────────────────────────────────────────
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const txStatus = await server.getTransaction(hash);

    if (txStatus.status === StellarRpc.Api.GetTransactionStatus.SUCCESS) {
      // Decode the return value from the transaction's result metadata
      const returnValue =
        txStatus.returnValue != null ? scValToNative(txStatus.returnValue) : undefined;
      return { hash, returnValue };
    }

    if (txStatus.status === StellarRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed on-chain. Hash: ${hash}`);
    }

    // status === NOT_FOUND — still pending, keep polling
  }

  throw new Error(`timeout: transaction not confirmed after ${POLL_TIMEOUT_MS / 1000}s. Hash: ${hash}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
