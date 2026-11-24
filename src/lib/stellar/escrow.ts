import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { getRpcServer, NETWORK_PASSPHRASE, simulateRead } from './rpc';
import { site } from '../site';
import { formatStroopsTrimmed } from './stroops';
import { stellarConfig } from './config';
import { parseContractError } from './errors';

/**
 * Validity window (seconds) for transactions built by this module.
 * A signed transaction expires this long after it is built, so a stale
 * signature cannot be submitted indefinitely. Matches the 180 s bound
 * used by createContract/escrow.ts.
 */
export const TX_TIMEOUT_SECONDS = 180;

// ── Contract error codes ────────────────────────────────────────────────────

export { CONTRACT_ERRORS, extractContractErrorCode } from './errors';

// ── On-chain types ──────────────────────────────────────────────────────────

export type ContractStatus =
  | 'Created'
  | 'Funded'
  | 'Completed'
  | 'Cancelled'
  | 'Disputed'
  | 'Resolved';

export type OnChainMilestone = {
  title: string;
  amount: bigint;    // stroops
  released: boolean;
};

export type OnChainEscrow = {
  id: number;
  client: string;        // Stellar public key
  freelancer: string;    // Stellar public key
  token: string;         // SAC contract address
  totalAmount: bigint;   // stroops
  fundedAmount: bigint;  // stroops
  releasedAmount: bigint; // stroops
  status: ContractStatus;
  milestones: OnChainMilestone[];
};

// ── Contract address helper ─────────────────────────────────────────────────

const CONTRACT_ADDRESS = stellarConfig.contractId;

export function getEscrowContract(): Contract {
  return new Contract(CONTRACT_ADDRESS);
}

// ── ScVal decoders ──────────────────────────────────────────────────────────

export class EscrowDecodeError extends Error {
  constructor(field: string, received: unknown) {
    const type = received === null ? 'null' : Array.isArray(received) ? 'array' : typeof received;
    super(`Unable to decode escrow field "${field}": expected a valid value, received ${type}`);
    this.name = 'EscrowDecodeError';
  }
}

const STATUS_VALUES: readonly ContractStatus[] = [
  'Created', 'Funded', 'Completed', 'Cancelled', 'Disputed', 'Resolved',
];

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Map)) {
    return value as Record<string, unknown>;
  }
  if (value instanceof Map) return Object.fromEntries(value);
  throw new EscrowDecodeError(field, value);
}

function required(record: Record<string, unknown>, key: string, parent = ''): unknown {
  const value = record[key];
  if (value === undefined || value === null) throw new EscrowDecodeError(parent ? `${parent}.${key}` : key, value);
  return value;
}

function asString(value: unknown, field: string): string {
  if (typeof value === 'string' && value.length > 0) return value;
  throw new EscrowDecodeError(field, value);
}

function asBigInt(value: unknown, field: string): bigint {
  if (typeof value === 'bigint') return value;
  throw new EscrowDecodeError(field, value);
}

function asBoolean(value: unknown, field: string): boolean {
  if (typeof value === 'boolean') return value;
  throw new EscrowDecodeError(field, value);
}

function decodeStatus(value: unknown): ContractStatus {
  // Soroban unit enums are native string vectors, for example ['Funded'].
  const variant = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (typeof variant === 'string' && STATUS_VALUES.includes(variant as ContractStatus)) {
    return variant as ContractStatus;
  }
  throw new EscrowDecodeError('status', value);
}

function decodeMilestone(value: unknown, index: number): OnChainMilestone {
  const field = `milestones[${index}]`;
  const milestone = asRecord(value, field);
  return {
    title: asString(required(milestone, 'title', field), `${field}.title`),
    amount: asBigInt(required(milestone, 'amount', field), `${field}.amount`),
    released: asBoolean(required(milestone, 'released', field), `${field}.released`),
  };
}

export function decodeEscrow(raw: xdr.ScVal, id: number): OnChainEscrow {
  let native: unknown;
  try {
    native = scValToNative(raw);
  } catch {
    throw new EscrowDecodeError('escrow', raw);
  }
  const escrow = asRecord(native, 'escrow');
  const milestonesValue = required(escrow, 'milestones');
  if (!Array.isArray(milestonesValue)) throw new EscrowDecodeError('milestones', milestonesValue);

  return {
    id,
    client: asString(required(escrow, 'client'), 'client'),
    freelancer: asString(required(escrow, 'freelancer'), 'freelancer'),
    token: asString(required(escrow, 'token'), 'token'),
    totalAmount: asBigInt(required(escrow, 'total_amount'), 'total_amount'),
    fundedAmount: asBigInt(required(escrow, 'funded_amount'), 'funded_amount'),
    releasedAmount: asBigInt(required(escrow, 'released_amount'), 'released_amount'),
    status: decodeStatus(required(escrow, 'status')),
    milestones: milestonesValue.map(decodeMilestone),
  };
}

// ── Read helper ─────────────────────────────────────────────────────────────

export async function getContract(id: number): Promise<OnChainEscrow> {
  try {
    const retval = await simulateRead('get_contract', [
      nativeToScVal(id, { type: 'u32' }),
    ]);
    return decodeEscrow(retval, id);
  } catch (err) {
    if (err instanceof EscrowDecodeError) throw err;
    throw new Error(parseContractError(err));
  }
}

// ── TX builders ─────────────────────────────────────────────────────────────

export type BuiltTx = {
  xdr: string;
  networkPassphrase: string;
};

async function buildTx(
  sourceAddress: string,
  ...operations: xdr.Operation[]
): Promise<BuiltTx> {
  const server = getRpcServer();
  const account = await server.getAccount(sourceAddress);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  for (const op of operations) {
    tx.addOperation(op);
  }
  const built = tx.setTimeout(TX_TIMEOUT_SECONDS).build();
  return { xdr: built.toXDR(), networkPassphrase: NETWORK_PASSPHRASE };
}

export async function buildDepositTx(
  id: number,
  amountStroops: bigint,
  sourceAddress: string
): Promise<BuiltTx> {
  const contract = getEscrowContract();
  const op = contract.call(
    'deposit_funds',
    nativeToScVal(id, { type: 'u32' }),
    nativeToScVal(amountStroops, { type: 'i128' })
  );
  return buildTx(sourceAddress, op);
}

export async function buildReleaseTx(
  id: number,
  milestoneIndex: number,
  sourceAddress: string
): Promise<BuiltTx> {
  const contract = getEscrowContract();
  const op = contract.call(
    'release_milestone',
    nativeToScVal(id, { type: 'u32' }),
    nativeToScVal(milestoneIndex, { type: 'u32' })
  );
  return buildTx(sourceAddress, op);
}

export async function buildCancelTx(
  id: number,
  sourceAddress: string
): Promise<BuiltTx> {
  const contract = getEscrowContract();
  const op = contract.call(
    'cancel_contract',
    nativeToScVal(id, { type: 'u32' })
  );
  return buildTx(sourceAddress, op);
}

// ── Utilities ───────────────────────────────────────────────────────────────

/** Format stroops (bigint) as 7-decimal XLM string. No Number() on stroop values. */
export function formatStroops(stroops: bigint): string {
  const formatted = formatStroopsTrimmed(stroops);
  return formatted.includes('.') ? formatted : `${formatted}.0`;
}
