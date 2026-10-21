/**
 * Generic simulate → sign → submit → poll pipeline for Soroban transactions.
 *
 * Steps:
 *   1. rpc.prepareTransaction  — simulation + footprint + fee bump
 *   2. wallet signTransaction  — Freighter prompts the user (uses config passphrase)
 *   3. rpc.sendTransaction     — broadcasts the signed XDR
 *   4. poll rpc.getTransaction — waits up to 60 s for SUCCESS or FAILED
 *
 * The network passphrase is always taken from TESTNET_PASSPHRASE (config),
 * never from the wallet response, so a mismatch causes an early error.
 */

import {
  Transaction,
  TransactionBuilder,
  scValToNative,
} from '@stellar/stellar-sdk';
import { rpc as StellarRpc } from '@stellar/stellar-sdk';
import { getRpcServer, TESTNET_PASSPHRASE } from './escrow';
import { signTransaction } from './freighter';
import { parseContractError } from './errors';

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
  const server = getRpcServer();

  // ── 1. Simulate & prepare ────────────────────────────────────────────────
  let prepared: Transaction;
  try {
    prepared = (await server.prepareTransaction(tx)) as Transaction;
  } catch (err) {
    throw new Error(parseContractError(err));
  }

  // ── 2. Sign via wallet ───────────────────────────────────────────────────
  const xdrToSign = prepared.toXDR();
  const { signedTxXdr, error: signError } = await signTransaction(xdrToSign, TESTNET_PASSPHRASE);
  if (signError || !signedTxXdr) {
    throw new Error(parseContractError(new Error(signError ?? 'Wallet returned an empty signature.')));
  }

  // ── 3. Submit ────────────────────────────────────────────────────────────
  const signedTx = TransactionBuilder.fromXDR(signedTxXdr, TESTNET_PASSPHRASE) as Transaction;
  let sendResult: StellarRpc.Api.SendTransactionResponse;
  try {
    sendResult = await server.sendTransaction(signedTx);
  } catch (err) {
    throw new Error(parseContractError(err));
  }

  if (sendResult.status === 'ERROR') {
    const detail = (sendResult as { errorResult?: { result?: () => unknown } }).errorResult;
    throw new Error(
      parseContractError(new Error(`Transaction rejected by the network: ${JSON.stringify(detail ?? sendResult.status)}`)),
    );
  }

  const hash = sendResult.hash;

  // ── 4. Poll for confirmation ─────────────────────────────────────────────
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let txStatus: StellarRpc.Api.GetTransactionResponse;
    try {
      txStatus = await server.getTransaction(hash);
    } catch (err) {
      throw new Error(parseContractError(err));
    }

    if (txStatus.status === StellarRpc.Api.GetTransactionStatus.SUCCESS) {
      // Decode the return value from the transaction's result metadata
      const returnValue =
        txStatus.returnValue != null ? scValToNative(txStatus.returnValue) : undefined;
      return { hash, returnValue };
    }

    if (txStatus.status === StellarRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(
        parseContractError(
          new Error(`Transaction failed on-chain. Hash: ${hash}`),
        ),
      );
    }

    // status === NOT_FOUND — still pending, keep polling
  }

  throw new Error(
    parseContractError(
      new Error(`timeout: transaction not confirmed after ${POLL_TIMEOUT_MS / 1000}s. Hash: ${hash}`),
    ),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
