// @vitest-environment node
// stellar-base XDR needs Node typed arrays; jsdom has its own Uint8Array realm.
/**
 * Tests for simulateSignSubmit pipeline.
 * All network calls and wallet interactions are mocked.
 */

import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';
import { Account, Operation, rpc as StellarRpc, Transaction, TransactionBuilder, Networks, nativeToScVal } from '@stellar/stellar-sdk';

// ── Mocks ──────────────────────────────────────────────────────────────────

const {
  mockPrepareTransaction, mockSendTransaction, mockGetTransaction, mockSignTransaction,
  mockActionSimulate, mockActionSend, mockActionGet, mockActionSign, mockAssemble,
} = vi.hoisted(() => ({
  mockPrepareTransaction: vi.fn(),
  mockSendTransaction: vi.fn(),
  mockGetTransaction: vi.fn(),
  mockSignTransaction: vi.fn(),
  mockActionSimulate: vi.fn(),
  mockActionSend: vi.fn(),
  mockActionGet: vi.fn(),
  mockActionSign: vi.fn(),
  mockAssemble: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@stellar/stellar-sdk')>();
  return { ...sdk, rpc: { ...sdk.rpc, assembleTransaction: mockAssemble } };
});

vi.mock('../rpc', () => ({
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  getRpcServer: () => ({
    simulateTransaction: mockActionSimulate,
    sendTransaction: mockActionSend,
    getTransaction: mockActionGet,
  }),
}));

vi.mock('../freighter', () => ({ signTransaction: mockActionSign }));

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
import { simulateSignSubmit as submitAction } from '../submit';
import { ESCROW_ERROR_CODES, escrowErrorMessage } from '../errors';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a small, valid testnet Transaction for the pipeline to serialise. */
function makeTx(): Transaction {
  const source = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
  return new TransactionBuilder(source, { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.bumpSequence({ bumpTo: '1' }))
    .setTimeout(30)
    .build();
}

const FAKE_HASH = 'aabbcc001122334455667788';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('shared contract errors across submission pipelines', () => {
  const signer = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

  beforeEach(() => {
    const tx = makeTx();
    mockAssemble.mockReturnValue({ build: () => tx });
    mockActionSimulate.mockResolvedValue({});
    mockActionSign.mockResolvedValue(tx.toXDR());
    mockActionSend.mockResolvedValue({ status: 'PENDING', hash: FAKE_HASH });
    mockActionGet.mockResolvedValue({ status: StellarRpc.Api.GetTransactionStatus.SUCCESS });
    mockPrepareTransaction.mockResolvedValue(tx);
    mockSignTransaction.mockResolvedValue({ signedTxXdr: tx.toXDR() });
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: FAKE_HASH });
    mockGetTransaction.mockResolvedValue({ status: StellarRpc.Api.GetTransactionStatus.SUCCESS });
  });

  it.each([...ESCROW_ERROR_CODES, 999])('uses identical simulation text for code %i', async (code) => {
    const diagnostic = `Error(Contract, #${code})`;
    mockActionSimulate.mockResolvedValue({ error: diagnostic });
    mockPrepareTransaction.mockRejectedValue(new Error(diagnostic));
    const expected = escrowErrorMessage(code) ?? `Contract error code ${code}.`;

    await expect(submitAction(makeTx().toXDR(), signer, vi.fn())).rejects.toThrow(expected);
    await expect(simulateSignSubmit(makeTx())).rejects.toThrow(expected);
    expect(mockActionSign).not.toHaveBeenCalled();
    expect(mockSignTransaction).not.toHaveBeenCalled();
  });

  it.each(['simulate', 'sign', 'send', 'poll'])('normalizes thrown %s errors in both pipelines', async (stage) => {
    const error = new Error('fee balance diagnostic: Error(Contract, #13)');
    if (stage === 'simulate') {
      mockActionSimulate.mockRejectedValue(error);
      mockPrepareTransaction.mockRejectedValue(error);
    } else if (stage === 'sign') {
      mockActionSign.mockRejectedValue(error);
      mockSignTransaction.mockRejectedValue(error);
    } else if (stage === 'send') {
      mockActionSend.mockRejectedValue(error);
      mockSendTransaction.mockRejectedValue(error);
    } else {
      mockActionGet.mockRejectedValue(error);
      mockGetTransaction.mockRejectedValue(error);
    }
    vi.useFakeTimers();
    const action = expect(submitAction(makeTx().toXDR(), signer, vi.fn()))
      .rejects.toThrow(escrowErrorMessage(13));
    const create = expect(simulateSignSubmit(makeTx())).rejects.toThrow(escrowErrorMessage(13));
    await vi.runAllTimersAsync();
    await Promise.all([action, create]);
  });

  it('still confirms an action transaction and reports progress', async () => {
    vi.useFakeTimers();
    const status = vi.fn();
    const result = submitAction(makeTx().toXDR(), signer, status);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe(FAKE_HASH);
    expect(status.mock.calls.map(([step]) => step)).toEqual([
      'simulating', 'awaiting_signature', 'submitting', 'confirmed',
    ]);
  });

  it('normalizes returned submission errors identically', async () => {
    mockActionSend.mockResolvedValue({ status: 'ERROR', errorResult: 'Error(Contract, #3)' });
    mockSendTransaction.mockResolvedValue({ status: 'ERROR', errorResult: 'Error(Contract, #3)' });
    await expect(submitAction(makeTx().toXDR(), signer, vi.fn()))
      .rejects.toThrow(escrowErrorMessage(3));
    await expect(simulateSignSubmit(makeTx())).rejects.toThrow(escrowErrorMessage(3));
  });

  it('preserves useful submission context when RPC returns no error detail', async () => {
    mockActionSend.mockResolvedValue({ status: 'ERROR' });
    mockSendTransaction.mockResolvedValue({ status: 'ERROR' });
    await expect(submitAction(makeTx().toXDR(), signer, vi.fn()))
      .rejects.toThrow('Submit failed: unknown');
    await expect(simulateSignSubmit(makeTx())).rejects.toThrow('Transaction rejected by the network');
  });

  it('rejects an empty wallet signature without submitting', async () => {
    mockSignTransaction.mockResolvedValue({ signedTxXdr: '' });
    await expect(simulateSignSubmit(makeTx())).rejects.toThrow('Wallet returned an empty signature.');
    expect(mockSendTransaction).not.toHaveBeenCalled();
  });

  it('confirms contract creation when the RPC supplies no return value', async () => {
    vi.useFakeTimers();
    const result = simulateSignSubmit(makeTx());
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ hash: FAKE_HASH, returnValue: undefined });
  });

  it('reports a failed action confirmation', async () => {
    mockActionGet.mockResolvedValue({ status: StellarRpc.Api.GetTransactionStatus.FAILED });
    vi.useFakeTimers();
    const result = expect(submitAction(makeTx().toXDR(), signer, vi.fn())).rejects.toThrow(/failed on-chain/i);
    await vi.runAllTimersAsync();
    await result;
  });

  it('reports an action confirmation timeout', async () => {
    mockActionGet.mockResolvedValue({ status: StellarRpc.Api.GetTransactionStatus.NOT_FOUND });
    vi.useFakeTimers();
    const result = expect(submitAction(makeTx().toXDR(), signer, vi.fn())).rejects.toThrow(/RPC timeout/i);
    await vi.runAllTimersAsync();
    await result;
  });
});

afterEach(() => {
  vi.useRealTimers();
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

    vi.useFakeTimers();
    const promise = simulateSignSubmit(tx);
    await vi.runAllTimersAsync();
    const result = await promise;

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

    vi.useFakeTimers();
    const assertion = expect(simulateSignSubmit(tx)).rejects.toThrow(/failed/i);
    await vi.runAllTimersAsync();
    await assertion;
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

    const assertion = expect(simulateSignSubmit(tx)).rejects.toThrow(/timeout/i);

    // Advance time past the 60s timeout
    await vi.runAllTimersAsync();

    await assertion;
  });
});
