// @vitest-environment node
// stellar-base XDR needs Node typed arrays; jsdom has its own Uint8Array realm.
/**
 * Tests for simulateSignSubmit pipeline.
 * All network calls and wallet interactions are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rpc as StellarRpc, Transaction, TransactionBuilder, Networks, xdr, nativeToScVal } from '@stellar/stellar-sdk';

// ── Mocks ──────────────────────────────────────────────────────────────────

const { mockPrepareTransaction, mockSendTransaction, mockGetTransaction, mockSignTransaction } = vi.hoisted(() => ({
  mockPrepareTransaction: vi.fn(),
  mockSendTransaction: vi.fn(),
  mockGetTransaction: vi.fn(),
  mockSignTransaction: vi.fn(),
}));

vi.mock('./escrow', async (importOriginal) => {
  const orig = await importOriginal<typeof import('./escrow')>();
  return {
    ...orig,
    getRpcServer: () => ({
      prepareTransaction: mockPrepareTransaction,
      sendTransaction: mockSendTransaction,
      getTransaction: mockGetTransaction,
    }),
  };
});

vi.mock('./freighter', () => ({
  signTransaction: mockSignTransaction,
}));

import { simulateSignSubmit } from './submit';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a minimal dummy Transaction for test use. */
function makeTx(): Transaction {
  // We don't actually need a fully valid tx here — the pipeline serialises it.
  // Use a valid XDR envelope from stellar-base for testnet.
  const txXdr =
    'AAAAAgAAAABi/B8mYjW05prqx2r6rh0YkNGJ3gkbAAAAAQAAAAAAAAAAAAAAAQAAAAEAAAAAYvwfJmI1tOaa6sdq+q4dGJDRid4JGwAAAAAAAAAAAAAAAAAAAAA=';
  return TransactionBuilder.fromXDR(txXdr, Networks.TESTNET) as Transaction;
}

const FAKE_HASH = 'aabbcc001122334455667788';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('simulateSignSubmit', () => {
  it('succeeds on the happy path and returns hash + decoded returnValue', async () => {
    const tx = makeTx();
    // prepareTransaction returns the same tx
    mockPrepareTransaction.mockResolvedValue(tx);
    // wallet signs OK
    mockSignTransaction.mockResolvedValue({ signedTxXdr: tx.toXDR(), error: undefined });
    // submission accepted
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: FAKE_HASH });
    // first poll: NOT_FOUND, second poll: SUCCESS with a u64 return value
    const returnScVal = nativeToScVal(42n, { type: 'u64' });
    mockGetTransaction
      .mockResolvedValueOnce({ status: StellarRpc.Api.GetTransactionStatus.NOT_FOUND })
      .mockResolvedValueOnce({
        status: StellarRpc.Api.GetTransactionStatus.SUCCESS,
        returnValue: returnScVal,
      });

    const result = await simulateSignSubmit(tx);

    expect(result.hash).toBe(FAKE_HASH);
    expect(result.returnValue).toBe(42n);
  });

  it('throws a human-readable error when simulation fails', async () => {
    const tx = makeTx();
    mockPrepareTransaction.mockRejectedValue(new Error('Error(Contract, #7)'));

    await expect(simulateSignSubmit(tx)).rejects.toThrow(/milestone/i);
  });

  it('throws when the user rejects the wallet signature', async () => {
    const tx = makeTx();
    mockPrepareTransaction.mockResolvedValue(tx);
    mockSignTransaction.mockResolvedValue({
      signedTxXdr: '',
      error: 'User declined signing',
    });

    await expect(simulateSignSubmit(tx)).rejects.toThrow(/cancelled|rejected/i);
  });

  it('throws when the transaction lands as FAILED', async () => {
    const tx = makeTx();
    mockPrepareTransaction.mockResolvedValue(tx);
    mockSignTransaction.mockResolvedValue({ signedTxXdr: tx.toXDR(), error: undefined });
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: FAKE_HASH });
    mockGetTransaction.mockResolvedValue({
      status: StellarRpc.Api.GetTransactionStatus.FAILED,
    });

    await expect(simulateSignSubmit(tx)).rejects.toThrow(/failed/i);
  });

  it('throws a timeout error when the transaction never confirms', async () => {
    vi.useFakeTimers();

    const tx = makeTx();
    mockPrepareTransaction.mockResolvedValue(tx);
    mockSignTransaction.mockResolvedValue({ signedTxXdr: tx.toXDR(), error: undefined });
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: FAKE_HASH });
    // Always returns NOT_FOUND
    mockGetTransaction.mockResolvedValue({
      status: StellarRpc.Api.GetTransactionStatus.NOT_FOUND,
    });

    const promise = simulateSignSubmit(tx);

    // Advance time past the 60s timeout
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow(/timeout/i);

    vi.useRealTimers();
  });
});
