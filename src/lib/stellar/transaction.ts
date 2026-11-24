import {
  rpc as StellarRpc,
  scValToNative,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { getRpcServer, NETWORK_PASSPHRASE } from './rpc';
import { signTransaction as freighterSignTransaction } from './freighter';
import { stellarConfig } from './config';
import { parseContractError } from './errors';

export type TransactionStage = 'simulating' | 'signing' | 'submitting' | 'confirmed';
export type TransactionStatusCallback = (stage: TransactionStage, detail?: string) => void;

export interface SubmitResult {
  hash: string;
  returnValue: unknown;
}

export type SignTransactionResult =
  | string
  | { signedTxXdr?: string; error?: string };

export type SignTransaction = (
  xdr: string,
  options: { networkPassphrase: string; address?: string },
) => Promise<SignTransactionResult>;

interface SendTransactionResult {
  status: string;
  hash?: string;
  errorResult?: unknown;
  diagnosticEvents?: unknown;
  [key: string]: unknown;
}

interface GetTransactionResult {
  status: string;
  returnValue?: unknown;
  [key: string]: unknown;
}

export interface RpcSubmitServer {
  prepareTransaction?: (tx: Transaction) => Promise<Transaction>;
  simulateTransaction?: (tx: Transaction) => Promise<unknown>;
  sendTransaction: (tx: Transaction) => Promise<SendTransactionResult>;
  getTransaction: (hash: string) => Promise<GetTransactionResult>;
}

export interface SubmitTransactionOptions {
  signerAddress?: string;
  onStatus?: TransactionStatusCallback;
  signal?: AbortSignal;
  timeoutMs?: number;
  pollIntervalMs?: number;
  maxSendAttempts?: number;
  sendRetryBaseMs?: number;
  maxPollErrors?: number;
  networkPassphrase?: string;
  server?: RpcSubmitServer;
  sign?: SignTransaction;
  errorLabel?: string;
}

export class TransactionCancelledError extends Error {
  readonly code = 'aborted';

  constructor(message = 'Transaction submission was cancelled.') {
    super(message);
    this.name = 'TransactionCancelledError';
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_MAX_SEND_ATTEMPTS = 3;
const DEFAULT_SEND_RETRY_BASE_MS = 500;
const DEFAULT_MAX_POLL_ERRORS = 3;
const MAX_SEND_BACKOFF_MS = 5_000;

export function isTransactionCancelled(error: unknown): boolean {
  return error instanceof TransactionCancelledError ||
    (error instanceof Error && error.name === 'TransactionCancelledError');
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new TransactionCancelledError();
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    if (ms <= 0) {
      resolve();
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      reject(new TransactionCancelledError());
    };
    timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function describeSendError(result: SendTransactionResult): string {
  const detail = result.errorResult ?? result.diagnosticEvents;
  if (detail === undefined || detail === null) return 'unknown';
  if (typeof detail === 'string') return detail;

  const text = String(detail);
  if (text && text !== '[object Object]') return text;

  try {
    return JSON.stringify(detail) ?? 'unknown';
  } catch {
    return text || 'unknown';
  }
}

async function normalizeSignature(result: SignTransactionResult): Promise<string> {
  if (typeof result === 'string') {
    if (!result) throw new Error('Freighter returned an empty signed transaction.');
    return result;
  }
  if (result?.error) throw new Error(result.error);
  if (!result?.signedTxXdr) throw new Error('Wallet returned an empty signature.');
  return result.signedTxXdr;
}

function decodeReturnValue(result: GetTransactionResult): unknown {
  const value = result.returnValue ??
    (result as { result?: { returnValue?: unknown } }).result?.returnValue;
  return value == null ? undefined : scValToNative(value as Parameters<typeof scValToNative>[0]);
}

async function sendWithRetry(
  server: RpcSubmitServer,
  signedTx: Transaction,
  options: SubmitTransactionOptions,
  signal: AbortSignal,
): Promise<string> {
  const attempts = Math.max(1, options.maxSendAttempts ?? DEFAULT_MAX_SEND_ATTEMPTS);
  const baseDelay = Math.max(0, options.sendRetryBaseMs ?? DEFAULT_SEND_RETRY_BASE_MS);
  const label = options.errorLabel ?? 'Submit failed';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    throwIfAborted(signal);
    const result = await server.sendTransaction(signedTx);
    throwIfAborted(signal);

    switch (result.status) {
      case 'PENDING':
      case 'DUPLICATE':
        return result.hash ?? '';
      case 'TRY_AGAIN_LATER':
        if (attempt === attempts) {
          throw new Error(parseContractError(
            `${label}: TRY_AGAIN_LATER after ${attempts} attempts. Hash: ${result.hash ?? 'unknown'}`,
          ));
        }
        await sleep(Math.min(baseDelay * 2 ** (attempt - 1), MAX_SEND_BACKOFF_MS), signal);
        break;
      case 'ERROR':
        throw new Error(parseContractError(`${label}: ${describeSendError(result)}`));
      default:
        throw new Error(`${label}: unexpected send status ${String(result.status)}`);
    }
  }

  throw new Error(`${label}: TRY_AGAIN_LATER after ${attempts} attempts.`);
}

async function waitForConfirmation(
  hash: string,
  server: RpcSubmitServer,
  options: SubmitTransactionOptions,
  signal: AbortSignal,
): Promise<SubmitResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  const maxPollErrors = Math.max(1, options.maxPollErrors ?? DEFAULT_MAX_POLL_ERRORS);
  const deadline = Date.now() + timeoutMs;
  let consecutiveErrors = 0;

  for (;;) {
    await sleep(pollIntervalMs, signal);
    throwIfAborted(signal);

    if (Date.now() >= deadline) {
      throw new Error(
        `RPC timeout: transaction not confirmed within ${Math.round(timeoutMs / 1000)}s. Hash: ${hash}`,
      );
    }

    let poll: GetTransactionResult;
    try {
      poll = await server.getTransaction(hash);
    } catch (error) {
      if (isTransactionCancelled(error)) throw error;
      consecutiveErrors += 1;
      if (consecutiveErrors >= maxPollErrors) throw error;
      continue;
    }

    throwIfAborted(signal);
    consecutiveErrors = 0;

    if (poll.status === StellarRpc.Api.GetTransactionStatus.SUCCESS) {
      return { hash, returnValue: decodeReturnValue(poll) };
    }
    if (poll.status === StellarRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed on-chain. Hash: ${hash}`);
    }
  }
}

export async function submitTransaction(
  input: Transaction | string,
  options: SubmitTransactionOptions = {},
): Promise<SubmitResult> {
  const signal = options.signal ?? new AbortController().signal;
  throwIfAborted(signal);

  const server = options.server ?? (getRpcServer() as unknown as RpcSubmitServer);
  const sign = options.sign ?? freighterSignTransaction;
  const networkPassphrase = options.networkPassphrase ??
    (typeof input === 'string' ? NETWORK_PASSPHRASE : stellarConfig.passphrase);

  options.onStatus?.('simulating');
  throwIfAborted(signal);

  let prepared: Transaction;
  if (typeof input === 'string') {
    const rawTx = TransactionBuilder.fromXDR(input, networkPassphrase) as Transaction;
    if (!server.simulateTransaction) {
      throw new Error('RPC server does not support simulateTransaction.');
    }
    const simResult = await server.simulateTransaction(rawTx);
    if (StellarRpc.Api.isSimulationError(simResult as StellarRpc.Api.SimulateTransactionResponse)) {
      throw new Error((simResult as { error?: string }).error ?? 'Simulation failed.');
    }
    prepared = StellarRpc.assembleTransaction(
      rawTx,
      simResult as StellarRpc.Api.SimulateTransactionSuccessResponse,
    ).build();
  } else {
    if (!server.prepareTransaction) {
      throw new Error('RPC server does not support prepareTransaction.');
    }
    prepared = await server.prepareTransaction(input);
  }

  throwIfAborted(signal);
  options.onStatus?.('signing');
  const signature = await sign(prepared.toXDR(), {
    networkPassphrase,
    address: options.signerAddress,
  });
  const signedXdr = await normalizeSignature(signature);
  throwIfAborted(signal);

  options.onStatus?.('submitting');
  const signedTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase) as Transaction;
  const hash = await sendWithRetry(server, signedTx, options, signal);
  if (!hash) throw new Error(`${options.errorLabel ?? 'Submit failed'}: RPC returned no transaction hash.`);

  const result = await waitForConfirmation(hash, server, options, signal);
  options.onStatus?.('confirmed', result.hash);
  return result;
}
