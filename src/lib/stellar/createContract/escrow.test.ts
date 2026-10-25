// @vitest-environment node
// stellar-base XDR needs Node typed arrays; jsdom has its own Uint8Array realm.
/**
 * Tests for buildCreateContractTx.
 *
 * We mock the RPC server so no real network call is made.
 * We decode the resulting transaction XDR to assert the correct contract id,
 * function name, and ScVal argument types.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Contract,
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

let callSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockGetAccount.mockResolvedValue(makeAccount(CLIENT));
  callSpy?.mockRestore();
  callSpy = vi.spyOn(Contract.prototype, 'call');
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

    // The call was built against the configured contract with typed args.
    expect(callSpy).toHaveBeenCalledTimes(1);
    const contract = callSpy.mock.contexts[0] as Contract;
    expect(contract.contractId()).toBe(site.contractId);
    const [fnName, ...args] = callSpy.mock.calls[0] as [string, ...xdr.ScVal[]];
    expect(fnName).toBe('create_contract');
    expect(args).toHaveLength(4);

    // client, freelancer and token are Address ScVals
    expect(args[0].switch().name).toBe('scvAddress');
    expect(scValToNative(args[0])).toBe(CLIENT);
    expect(scValToNative(args[1])).toBe(FREELANCER);
    expect(scValToNative(args[2])).toBe(TOKEN);

    // milestone amounts are a Vec<i128>
    expect(args[3].switch().name).toBe('scvVec');
    const vec = args[3].vec()!;
    expect(vec).toHaveLength(2);
    expect(vec.map((v) => v.switch().name)).toEqual(['scvI128', 'scvI128']);
    expect(scValToNative(vec[0])).toBe(100_000_000n);
    expect(scValToNative(vec[1])).toBe(200_000_000n);

    // The transaction round-trips through XDR on testnet.
    expect(() => TransactionBuilder.fromXDR(tx.toXDR(), TESTNET_PASSPHRASE)).not.toThrow();
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
