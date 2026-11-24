import { getRpcServer, NETWORK_PASSPHRASE } from './rpc';
import { signTransaction } from './freighter';
import { parseContractError } from './errors';
import {
  isTransactionCancelled,
  submitTransaction as runSubmitTransaction,
  type SubmitTransactionOptions,
  type TransactionStage,
} from './transaction';

export type TxStatus =
  | 'idle'
  | 'simulating'
  | 'awaiting_signature'
  | 'submitting'
  | 'confirmed'
  | 'error';

export type StatusCallback = (status: TxStatus, detail?: string) => void;

/**
 * Full pipeline: simulate → sign → submit → poll.
 * Calls `onStatus` at each stage so the UI can show progress.
 */
export async function simulateSignSubmit(
  txXdr: string,
  signerAddress: string,
  onStatus: StatusCallback,
  options: SubmitTransactionOptions = {},
): Promise<string> {
  try {
    const forwardStatus = (stage: TransactionStage, detail?: string) => {
      onStatus(stage === 'signing' ? 'awaiting_signature' : stage, detail);
    };
    const result = await runSubmitTransaction(txXdr, {
      ...options,
      signerAddress,
      onStatus: forwardStatus,
      server: options.server ?? (getRpcServer() as never),
      sign: options.sign ?? signTransaction,
      networkPassphrase: options.networkPassphrase ?? NETWORK_PASSPHRASE,
      errorLabel: options.errorLabel ?? 'Submit failed',
    });
    return result.hash;
  } catch (err) {
    if (isTransactionCancelled(err)) throw err;
    throw new Error(parseContractError(err));
  }
}
