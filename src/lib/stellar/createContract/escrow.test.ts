/**
 * Tests for buildCreateContractTx.
 *
 * We mock the RPC server so no real network call is made.
 * We decode the resulting transaction XDR to assert the correct contract id,
 * function name, and ScVal argument types.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  xdr,
  scValToNative,
  Address,
  Networks,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { site } from '@/lib/site';

// ── Mock the RPC server ────────────────────────────────────────────────────
const { mockGetAccount } = vi.hoisted(() => ({ mockGetAccount: vi.fn() }));
vi.mock('./rpcServer', () => ({
  getRpcServer: () => ({ getAccount: mockGetAccount }),
}));

import { buildCreateContractTx, TESTNET_PASSPHRASE } from './escrow';

// A stub Stellar account at sequence 0
function makeAccount(address: string) {
  return {
    accountId: () => address,
    sequenceNumber: () => '0',
    incrementSequenceNumber() {
      /* stub */
    },
  };
}

const CLIENT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const FREELANCER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC6PV';
// A valid-looking contract id (C…)
const TOKEN = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';

beforeEach(() => {
  mockGetAccount.mockResolvedValue(makeAccount(CLIENT));
});

describe('buildCreateContractTx', () => {
  it('produces a transaction with the configured contract id', async () => {
    const tx = await buildCreateContractTx({
      client: CLIENT,
      freelancer: FREELANCER,
      token: TOKEN,
      amounts: [100_000_000n, 200_000_000n],
    });

    // Decode the operation
    const op = tx.operations[0];
    expect(op.type).toBe('invokeHostFunction');

    // Serialise → deserialise to inspect the host function
    const envelope = tx.toEnvelope();
    const txXdr = envelope.toXDR('base64');
    const decoded = TransactionBuilder.fromXDR(txXdr, TESTNET_PASSPHRASE);
    const invokeOp = decoded.operations[0] as import('@stellar/stellar-sdk').Operation.InvokeHostFunction;

    // The host function must be an InvokeContract
    // The SDK types `func` loosely; narrow it to the XDR union we decode.
    const hf = invokeOp.func as unknown as {
      switch(): { name: string };
      invokeContract(): {
        contractAddress(): { contractId(): Parameters<typeof Address.contract>[0] };
        functionName(): { toString(): string };
        args(): Array<xdr.ScVal & { switch(): { name: string }; vec(): xdr.ScVal[] | null }>;
      };
    };
    expect(hf.switch().name).toBe('hostFunctionTypeInvokeContract');

    const invokeArgs = hf.invokeContract();

    // ── Contract address ──────────────────────────────────────────────────
    const contractAddrScVal = invokeArgs.contractAddress();
    const contractAddr = Address.contract(contractAddrScVal.contractId());
    expect(contractAddr.toString()).toBe(site.contractId);

    // ── Function name ─────────────────────────────────────────────────────
    const fnName = invokeArgs.functionName().toString();
    expect(fnName).toBe('create_contract');

    // ── Arguments ─────────────────────────────────────────────────────────
    const args = invokeArgs.args();
    expect(args).toHaveLength(4);

    // arg[0] = client Address
    expect(scValToNative(args[0])).toBe(CLIENT);

    // arg[1] = freelancer Address
    expect(scValToNative(args[1])).toBe(FREELANCER);

    // arg[2] = token Address
    expect(scValToNative(args[2])).toBe(TOKEN);

    // arg[3] = Vec<i128> milestone amounts
    expect(args[3].switch().name).toBe('scvVec');
    const vec = args[3].vec()!;
    expect(vec).toHaveLength(2);
    expect(scValToNative(vec[0])).toBe(100_000_000n);
    expect(scValToNative(vec[1])).toBe(200_000_000n);
  });

  it('uses the testnet network passphrase', async () => {
    const tx = await buildCreateContractTx({
      client: CLIENT,
      freelancer: FREELANCER,
      token: TOKEN,
      amounts: [10_000_000n],
    });
    // Verify the tx can be roundtripped with the testnet passphrase
    expect(() => TransactionBuilder.fromXDR(tx.toXDR(), TESTNET_PASSPHRASE)).not.toThrow();
    expect(TESTNET_PASSPHRASE).toBe(Networks.TESTNET);
  });
});
