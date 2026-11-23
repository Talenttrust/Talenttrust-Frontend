/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Address,
  Keypair,
  Operation,
  TransactionBuilder,
  xdr,
  rpc as StellarRpc,
  scValToNative,
} from '@stellar/stellar-sdk';
import { stellarConfig } from './config';

export const RPC_URL = stellarConfig.rpcUrl;
export const NETWORK_PASSPHRASE = stellarConfig.passphrase;

let _server: StellarRpc.Server | null = null;

export function getRpcServer(): StellarRpc.Server {
  if (!_server) {
    _server = new StellarRpc.Server(RPC_URL, { allowHttp: false });
  }
  return _server;
}

// ── Legacy simulateRead (used by reputation.ts) ──────────────────────────────

const CONTRACT_ADDRESS = stellarConfig.contractId;

/**
 * Run a read-only simulation of a Soroban contract call.
 * No transaction is signed or submitted.
 */
export async function simulateRead(method: string, args: unknown[]): Promise<xdr.ScVal> {
  const server = getRpcServer();
  const keypair = Keypair.random();

  // Minimal account-like object for TransactionBuilder
  const simulationSource: any = {
    accountId: () => keypair.publicKey(),
    sequenceNumber: () => '0',
    incrementSequenceNumber: () => { /* no-op */ },
  };

  function toScVal(arg: unknown): xdr.ScVal {
    if (arg instanceof xdr.ScVal) {
      return arg as xdr.ScVal;
    }
    if (typeof arg === 'string') {
      return Address.fromString(arg).toScVal();
    }
    if (typeof arg === 'number' || typeof arg === 'bigint') {
      return xdr.ScVal.scvU64(new (xdr as any).Uint64(BigInt(arg)));
    }
    throw new Error(`Unsupported simulation argument: ${typeof arg}`);
  }

  const tx = new TransactionBuilder(simulationSource, {
    fee: '0',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: xdr.HostFunction.hostFunctionTypeInvokeContract(
          new xdr.InvokeContractArgs({
            contractAddress: Address.fromString(CONTRACT_ADDRESS).toScAddress(),
            functionName: method,
            args: args.map(toScVal),
          }),
        ),
      }),
    )
    .build();

  const sim = await server.simulateTransaction(tx) as any;
  if (sim.error) {
    throw new Error(String(sim.error));
  }
  if (!sim.result?.retval) {
    throw new Error('On-chain read returned no result');
  }
  return sim.result.retval as xdr.ScVal;
}

export type ScValResult = boolean | number | bigint | string | Uint8Array | null;

/** Simulate a read-only contract call and decode the return value to a JS primitive. */
export async function simulateContractCall(method: string, args: unknown[] = []): Promise<ScValResult> {
  const value = scValToNative(await simulateRead(method, args));
  return (value ?? null) as ScValResult;
}

/**
 * Simulate a read-only call on an arbitrary contract (not just the escrow).
 * Used by token.ts to read symbol/decimals from any SEP-41 token contract.
 */
export async function simulateContractCallFor(
  contractId: string,
  method: string,
  args: unknown[] = [],
): Promise<ScValResult> {
  const server = getRpcServer();
  const keypair = Keypair.random();
  const simulationSource: any = {
    accountId: () => keypair.publicKey(),
    sequenceNumber: () => '0',
    incrementSequenceNumber: () => { /* no-op */ },
  };
  const tx = new TransactionBuilder(simulationSource, {
    fee: '0',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: xdr.HostFunction.hostFunctionTypeInvokeContract(
          new xdr.InvokeContractArgs({
            contractAddress: Address.fromString(contractId).toScAddress(),
            functionName: method,
            args: [],
          }),
        ),
      }),
    )
    .build();
  const sim = await server.simulateTransaction(tx) as any;
  if (sim.error) throw new Error(String(sim.error));
  if (!sim.result?.retval) throw new Error('No result');
  return (scValToNative(sim.result.retval) ?? null) as ScValResult;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
