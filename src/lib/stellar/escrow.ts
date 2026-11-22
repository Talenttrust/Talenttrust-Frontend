import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  xdr,
  Address,
} from '@stellar/stellar-sdk';
import { getRpcServer, NETWORK_PASSPHRASE, simulateRead } from './rpc';
import { site } from '../site';

/**
 * Validity window (seconds) for transactions built by this module.
 * A signed transaction expires this long after it is built, so a stale
 * signature cannot be submitted indefinitely. Matches the 180 s bound
 * used by createContract/escrow.ts.
 */
export const TX_TIMEOUT_SECONDS = 180;

// ── Contract error codes ────────────────────────────────────────────────────

export const CONTRACT_ERRORS: Record<number, string> = {
  1: 'AlreadyInitialized',
  2: 'NotInitialized',
  3: 'Unauthorized',
  4: 'InvalidAmount',
  5: 'ContractNotFound',
  6: 'InvalidStatus',
  7: 'MilestoneNotFound',
  8: 'InvalidMilestone',
  9: 'OverFunded',
  10: 'InvalidStatus',
  11: 'ContractAlreadyFunded',
  12: 'MilestoneAlreadyReleased',
  13: 'InsufficientFunds',
  14: 'DisputeNotFound',
};

// ── On-chain types ──────────────────────────────────────────────────────────

export type ContractStatus =
  | 'Created'
  | 'Funded'
  | 'Completed'
  | 'Cancelled'
  | 'Disputed';

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

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID ?? site.contractId;

export function getEscrowContract(): Contract {
  return new Contract(CONTRACT_ADDRESS);
}

// ── ScVal decoders ──────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */

// The installed @stellar/stellar-sdk (v17) exposes ScVal arms as properties
// (val.type, val.map, val.vec, val.i128, val.sym, …), not as the method calls
// (val.map(), val.switch(), …) of older stellar-base releases. The decoders
// below read the property form; every decoder stays defensive and falls back
// to a neutral value on unexpected shapes.

// XDR text values (symbols, strings) arrive as XdrString objects; decode
// their raw bytes directly so the result does not depend on which realm's
// typed arrays the value was created with (jsdom tests, SSR, browser).
function xdrText(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Buffer.isBuffer(v)) return v.toString('utf8');
  if (v.bytes) return Buffer.from(v.bytes as Uint8Array).toString('utf8');
  return String(v);
}

function symName(val: xdr.ScVal): string {
  try {
    return xdrText((val as any).sym);
  } catch { return ''; }
}

function decodeStatus(val: xdr.ScVal): ContractStatus {
  try {
    // Soroban enum values arrive as scvVec([scvSymbol('Funded')]);
    // accept a bare symbol as well.
    const inner =
      (val as any).type === 'scvVec' ? ((val as any).vec?.[0] as xdr.ScVal) : val;
    const name = inner ? symName(inner) : '';
    if (name.includes('Funded')) return 'Funded';
    if (name.includes('Completed')) return 'Completed';
    if (name.includes('Cancelled')) return 'Cancelled';
    if (name.includes('Disputed')) return 'Disputed';
  } catch { /* ignore */ }
  return 'Created';
}

function decodeI128(val: xdr.ScVal): bigint {
  try {
    const parts = (val as any).i128 as { hi: any; lo: any };
    if (!parts) return 0n;
    const hi = BigInt(parts.hi.toString());
    const lo = BigInt(parts.lo.toString());
    return (hi << 64n) | lo;
  } catch {
    return 0n;
  }
}

function decodeString(val: xdr.ScVal): string {
  try {
    const s = (val as any).str;
    if (s != null) return xdrText(s);
    return symName(val);
  } catch { return ''; }
}

function decodeAddress(val: xdr.ScVal): string {
  try {
    return Address.fromScVal(val).toString();
  } catch { return ''; }
}

function decodeBool(val: xdr.ScVal): boolean {
  try { return Boolean((val as any).b); } catch { return false; }
}

function scMapGet(entries: xdr.ScMapEntry[], key: string): xdr.ScVal | undefined {
  const found = entries.find((e) => {
    try { return symName((e as any).key as xdr.ScVal) === key; } catch { return false; }
  });
  if (!found) return undefined;
  return (found as any).val as xdr.ScVal;
}

function decodeMilestone(val: xdr.ScVal): OnChainMilestone {
  try {
    const rawMap = (val as any).map;
    const entries: xdr.ScMapEntry[] = Array.isArray(rawMap) ? rawMap : [];
    return {
      title: decodeString(scMapGet(entries, 'title') ?? xdr.ScVal.scvVoid()),
      amount: decodeI128(scMapGet(entries, 'amount') ?? xdr.ScVal.scvVoid()),
      released: decodeBool(scMapGet(entries, 'released') ?? xdr.ScVal.scvVoid()),
    };
  } catch {
    return { title: '', amount: 0n, released: false };
  }
}

export function decodeEscrow(raw: xdr.ScVal, id: number): OnChainEscrow {
  const rawMap = (raw as any).map;
  const entries: xdr.ScMapEntry[] = Array.isArray(rawMap) ? rawMap : [];
  const get = (k: string) => scMapGet(entries, k) ?? xdr.ScVal.scvVoid();

  const milestones: OnChainMilestone[] = [];
  try {
    for (const m of ((get('milestones') as any).vec ?? []) as xdr.ScVal[]) {
      milestones.push(decodeMilestone(m));
    }
  } catch { /* empty */ }

  return {
    id,
    client: decodeAddress(get('client')),
    freelancer: decodeAddress(get('freelancer')),
    token: decodeAddress(get('token')),
    totalAmount: decodeI128(get('total_amount')),
    fundedAmount: decodeI128(get('funded_amount')),
    releasedAmount: decodeI128(get('released_amount')),
    status: decodeStatus(get('status')),
    milestones,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Read helper ─────────────────────────────────────────────────────────────

export async function getContract(id: number): Promise<OnChainEscrow> {
  try {
    const retval = await simulateRead('get_contract', [
      nativeToScVal(id, { type: 'u32' }),
    ]);
    return decodeEscrow(retval, id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = extractContractErrorCode(message);
    if (code === 5) throw new Error('ContractNotFound');
    throw err;
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

export function extractContractErrorCode(errStr: string): number | null {
  const m = errStr.match(/Error\(Contract,\s*#(\d+)\)/);
  if (m) return parseInt(m[1], 10);
  return null;
}

/** Format stroops (bigint) as 7-decimal XLM string. No Number() on stroop values. */
export function formatStroops(stroops: bigint): string {
  const whole = stroops / 10_000_000n;
  const frac = stroops % 10_000_000n;
  const fracStr = frac.toString().padStart(7, '0').replace(/0+$/, '') || '0';
  return `${whole}.${fracStr}`;
}
