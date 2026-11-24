// @vitest-environment node
// stellar-base XDR needs Node typed arrays; jsdom has its own Uint8Array realm
// (same pattern as createContract/escrow.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nativeToScVal, TransactionBuilder, xdr, type Transaction } from '@stellar/stellar-sdk';
import {
  formatStroops,
  extractContractErrorCode,
  CONTRACT_ERRORS,
  getContract,
  buildDepositTx,
  buildReleaseTx,
  buildCancelTx,
  TX_TIMEOUT_SECONDS,
  decodeEscrow,
  EscrowDecodeError,
} from '../escrow';
import { simulateRead } from '../rpc';
import { CONTRACT_ERRORS as sharedNames, escrowErrorMessage } from '../errors';
import { createFakeSoroban, installFakeSoroban } from '@/test/fakeSoroban';

// One merged mock for ../rpc: the transaction builders talk to the chain
// through getRpcServer(), swapped for the fake Soroban server (see
// src/test/fakeSoroban.ts) so no network is touched, while getContract
// reads go through simulateRead, stubbed here for the unit tests below.
vi.mock('../rpc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../rpc')>();
  const fake = await import('@/test/fakeSoroban');
  return {
    ...fake.rpcModuleWithFake(actual),
    simulateRead: vi.fn(),
  };
});

describe('formatStroops', () => {
  it('formats whole XLM', () => expect(formatStroops(10_000_000n)).toBe('1.0'));
  it('formats minimum stroop', () => expect(formatStroops(1n)).toBe('0.0000001'));
  it('formats zero', () => expect(formatStroops(0n)).toBe('0.0'));
  it('formats 10 XLM', () => expect(formatStroops(100_000_000n)).toBe('10.0'));
  it('trims trailing zeros', () => expect(formatStroops(10_500_000n)).toBe('1.05'));
  it('preserves all 7 decimals when needed', () =>
    expect(formatStroops(10_000_001n)).toBe('1.0000001'));
});

describe('extractContractErrorCode', () => {
  it('extracts code 5', () =>
    expect(extractContractErrorCode('Error(Contract, #5)')).toBe(5));
  it('extracts code 13', () =>
    expect(extractContractErrorCode('Error(Contract, #13)')).toBe(13));
  it('returns null for unrecognised string', () =>
    expect(extractContractErrorCode('unknown error')).toBeNull());
  it('returns null for empty string', () =>
    expect(extractContractErrorCode('')).toBeNull());
});

describe('TX_TIMEOUT_SECONDS', () => {
  const CLIENT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

  beforeEach(() => {
    installFakeSoroban(createFakeSoroban());
  });
  afterEach(() => {
    installFakeSoroban(null);
  });

  it('is 180 seconds', () => expect(TX_TIMEOUT_SECONDS).toBe(180));

  it.each([
    ['deposit', () => buildDepositTx(1, 10_000_000n, CLIENT)],
    ['release', () => buildReleaseTx(1, 0, CLIENT)],
    ['cancel', () => buildCancelTx(1, CLIENT)],
  ])(
    'bounds the %s transaction validity to 180 s (decoded timeBounds.maxTime)',
    async (_name, build) => {
      const before = Math.floor(Date.now() / 1000);
      const built = await build();
      const after = Math.floor(Date.now() / 1000);
      const tx = TransactionBuilder.fromXDR(built.xdr, built.networkPassphrase) as Transaction;
      const maxTime = Number(tx.timeBounds?.maxTime ?? '0');
      expect(maxTime).toBeGreaterThanOrEqual(before + TX_TIMEOUT_SECONDS);
      expect(maxTime).toBeLessThanOrEqual(after + TX_TIMEOUT_SECONDS);
    }
  );
});

describe('CONTRACT_ERRORS', () => {
  it('re-exports the shared derived lookup', () => expect(CONTRACT_ERRORS).toBe(sharedNames));
  it('maps 5 → ContractNotFound', () => expect(CONTRACT_ERRORS[5]).toBe('ContractNotFound'));
  it('maps 10 → InvalidStatus', () => expect(CONTRACT_ERRORS[10]).toBe('InvalidStatus'));
  it('maps 12 → MilestoneAlreadyReleased', () =>
    expect(CONTRACT_ERRORS[12]).toBe('MilestoneAlreadyReleased'));
  it('maps 13 → InsufficientFunds', () =>
    expect(CONTRACT_ERRORS[13]).toBe('InsufficientFunds'));
  it('maps 9 → OverFunded', () => expect(CONTRACT_ERRORS[9]).toBe('OverFunded'));
});

describe('getContract', () => {
  const mockSimulateRead = vi.mocked(simulateRead);

  beforeEach(() => {
    mockSimulateRead.mockReset();
  });

  it('delegates to simulateRead with a u32 ScVal id and decodes the result', async () => {
    mockSimulateRead.mockResolvedValue(escrowFixture() as xdr.ScVal);

    const result = await getContract(42);

    expect(mockSimulateRead).toHaveBeenCalledTimes(1);
    const [method, args] = mockSimulateRead.mock.calls[0];
    expect(method).toBe('get_contract');
    expect(args).toHaveLength(1);
    expect(args[0]).toBeInstanceOf(xdr.ScVal);
    expect((args[0] as xdr.ScVal).toXDR('base64')).toBe(
      xdr.ScVal.scvU32(42).toXDR('base64')
    );

    expect(result.id).toBe(42);
    expect(result.status).toBe('Created');
    expect(result.milestones).toHaveLength(1);
  });

  it('maps contract error code 5 to a readable not-found message', async () => {
    mockSimulateRead.mockRejectedValue(
      new Error('HostError: Error(Contract, #5)')
    );

    await expect(getContract(99)).rejects.toThrow(escrowErrorMessage(5));
  });

  it('formats other contract simulation errors using the shared table', async () => {
    mockSimulateRead.mockRejectedValue(
      new Error('HostError: Error(Contract, #3)')
    );

    await expect(getContract(99)).rejects.toThrow(escrowErrorMessage(3));
  });

  it('preserves unknown simulation messages', async () => {
    mockSimulateRead.mockRejectedValue(new Error('Unexpected RPC response'));
    await expect(getContract(99)).rejects.toThrow('Unexpected RPC response');
  });
});

const escrowFixture = (overrides: Record<string, unknown> = {}) => {
  const fields: Record<string, unknown> = {
    client: 'GCLIENT',
    freelancer: 'GFREELANCER',
    token: 'CTOKEN',
    total_amount: 2n ** 100n,
    funded_amount: 0n,
    released_amount: 0n,
    status: ['Created'],
    milestones: [{ title: 'Build', amount: -(2n ** 100n), released: false }],
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) delete fields[key];
  }
  return nativeToScVal(fields, { type: 'map' });
};

describe('decodeEscrow', () => {
  it.each(['Created', 'Funded', 'Completed', 'Cancelled', 'Disputed', 'Resolved'] as const)(
    'decodes the %s contract status strictly', (status) => {
      const decoded = decodeEscrow(escrowFixture({ status: [status] }), 9);
      expect(decoded.status).toBe(status);
      expect(decoded.id).toBe(9);
    },
  );

  it('preserves large and negative i128 amounts', () => {
    const decoded = decodeEscrow(escrowFixture(), 1);
    expect(decoded.totalAmount).toBe(2n ** 100n);
    expect(decoded.milestones[0].amount).toBe(-(2n ** 100n));
  });

  it.each([
    ['missing status', { status: undefined }, 'status'],
    ['wrong amount type', { total_amount: '100' }, 'total_amount'],
    ['wrong milestone type', { milestones: 'none' }, 'milestones'],
    ['unknown status variant', { status: ['Unexpected'] }, 'status'],
  ])('rejects %s with a field-specific error', (_name, overrides, field) => {
    expect(() => decodeEscrow(escrowFixture(overrides), 1)).toThrow(EscrowDecodeError);
    expect(() => decodeEscrow(escrowFixture(overrides), 1)).toThrow(field);
  });

  it('rejects a missing required milestone field', () => {
    expect(() => decodeEscrow(escrowFixture({ milestones: [{ title: 'Build', released: false }] }), 1))
      .toThrow(/milestones\[0\]\.amount/);
  });
});
