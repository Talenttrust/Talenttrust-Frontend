// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  Account,
  nativeToScVal,
  Operation,
  rpc as StellarRpc,
  Transaction,
  TransactionBuilder,
  Networks,
} from '@stellar/stellar-sdk';
import {
  submitTransaction,
  TransactionCancelledError,
  type RpcSubmitServer,
} from '../transaction';
import { escrowErrorMessage } from '../errors';

const HASH = 'aabbcc001122334455667788';
const PASSPHRASE = Networks.TESTNET;

function makeTx(): Transaction {
  const source = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
  return new TransactionBuilder(source, { fee: '100', networkPassphrase: PASSPHRASE })
    .addOperation(Operation.bumpSequence({ bumpTo: '1' }))
    .setTimeout(30)
    .build();
}

function makeServer(overrides: Partial<RpcSubmitServer> = {}): RpcSubmitServer {
  return {
    prepareTransaction: vi.fn(async (tx: Transaction) => tx),
    simulateTransaction: vi.fn(async () => ({})),
    sendTransaction: vi.fn(async () => ({ status: 'PENDING', hash: HASH })),
    getTransaction: vi.fn(async () => ({ status: StellarRpc.Api.GetTransactionStatus.SUCCESS })),
    ...overrides,
  };
}

function submit(
  server: RpcSubmitServer,
  overrides: Parameters<typeof submitTransaction>[1] = {},
) {
  return submitTransaction(makeTx(), {
    server,
    sign: vi.fn(async (xdr: string) => xdr),
    networkPassphrase: PASSPHRASE,
    pollIntervalMs: 5,
    timeoutMs: 1_000,
    ...overrides,
  });
}

describe('submitTransaction', () => {
  it.each(['PENDING', 'DUPLICATE'])('accepts %s send status and polls the returned hash', async (status) => {
    const sendTransaction = vi.fn(async () => ({ status, hash: HASH }));
    const getTransaction = vi.fn(async () => ({ status: StellarRpc.Api.GetTransactionStatus.SUCCESS }));
    const result = await submit(makeServer({ sendTransaction, getTransaction }));

    expect(result).toEqual({ hash: HASH, returnValue: undefined });
    expect(getTransaction).toHaveBeenCalledWith(HASH);
  });

  it('retries TRY_AGAIN_LATER with bounded backoff and then submits', async () => {
    const sendTransaction = vi.fn()
      .mockResolvedValueOnce({ status: 'TRY_AGAIN_LATER', hash: HASH })
      .mockResolvedValueOnce({ status: 'PENDING', hash: HASH });

    const result = await submit(makeServer({ sendTransaction }), {
      maxSendAttempts: 3,
      sendRetryBaseMs: 1,
    });

    expect(result.hash).toBe(HASH);
    expect(sendTransaction).toHaveBeenCalledTimes(2);
  });

  it('fails after TRY_AGAIN_LATER exhausts the retry budget', async () => {
    const sendTransaction = vi.fn(async () => ({ status: 'TRY_AGAIN_LATER', hash: HASH }));

    await expect(submit(makeServer({ sendTransaction }), {
      maxSendAttempts: 2,
      sendRetryBaseMs: 1,
    })).rejects.toThrow(/TRY_AGAIN_LATER after 2 attempts/);
    expect(sendTransaction).toHaveBeenCalledTimes(2);
  });

  it('decodes and maps ERROR send results through parseContractError', async () => {
    const sendTransaction = vi.fn(async () => ({
      status: 'ERROR',
      errorResult: `Error(Contract, #3)`,
    }));

    await expect(submit(makeServer({ sendTransaction })))
      .rejects.toThrow(escrowErrorMessage(3)!);
  });

  it('keeps useful context when an ERROR send result has no detail', async () => {
    const sendTransaction = vi.fn(async () => ({ status: 'ERROR' }));

    await expect(submit(makeServer({ sendTransaction })))
      .rejects.toThrow('Submit failed: unknown');
  });

  it('decodes the return value from a successful poll', async () => {
    const getTransaction = vi.fn(async () => ({
      status: StellarRpc.Api.GetTransactionStatus.SUCCESS,
      returnValue: nativeToScVal(42n, { type: 'u64' }),
    }));

    await expect(submit(makeServer({ getTransaction }))).resolves.toEqual({
      hash: HASH,
      returnValue: 42n,
    });
  });

  it('retries transient getTransaction failures before succeeding', async () => {
    const getTransaction = vi.fn()
      .mockRejectedValueOnce(new Error('RPC socket reset'))
      .mockResolvedValueOnce({ status: StellarRpc.Api.GetTransactionStatus.NOT_FOUND })
      .mockResolvedValueOnce({ status: StellarRpc.Api.GetTransactionStatus.SUCCESS });

    await expect(submit(makeServer({ getTransaction }))).resolves.toEqual({
      hash: HASH,
      returnValue: undefined,
    });
    expect(getTransaction).toHaveBeenCalledTimes(3);
  });

  it('fails after repeated getTransaction errors', async () => {
    const getTransaction = vi.fn(async () => {
      throw new Error('RPC unavailable');
    });

    await expect(submit(makeServer({ getTransaction }), { maxPollErrors: 2 }))
      .rejects.toThrow('RPC unavailable');
    expect(getTransaction).toHaveBeenCalledTimes(2);
  });

  it('reports a poll timeout', async () => {
    const getTransaction = vi.fn(async () => ({
      status: StellarRpc.Api.GetTransactionStatus.NOT_FOUND,
    }));

    await expect(submit(makeServer({ getTransaction }), {
      timeoutMs: 20,
      pollIntervalMs: 5,
    })).rejects.toThrow(/RPC timeout/);
  });

  it('stops polling and rejects a distinguishable error when aborted', async () => {
    const controller = new AbortController();
    const getTransaction = vi.fn(async () => {
      controller.abort();
      return { status: StellarRpc.Api.GetTransactionStatus.NOT_FOUND };
    });

    const promise = submit(makeServer({ getTransaction }), {
      signal: controller.signal,
      timeoutMs: 5_000,
    });

    await expect(promise).rejects.toBeInstanceOf(TransactionCancelledError);
    expect(getTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const sendTransaction = vi.fn();

    await expect(submit(makeServer({ sendTransaction }), {
      signal: controller.signal,
    })).rejects.toBeInstanceOf(TransactionCancelledError);
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it('forwards signer address and progress stages', async () => {
    const sign = vi.fn(async (xdr: string) => xdr);
    const onStatus = vi.fn();

    await submit(makeServer(), {
      sign,
      signerAddress: 'GSIGNER',
      onStatus,
    });

    expect(sign).toHaveBeenCalledWith(expect.any(String), {
      networkPassphrase: PASSPHRASE,
      address: 'GSIGNER',
    });
    expect(onStatus.mock.calls.map(([stage]) => stage)).toEqual([
      'simulating',
      'signing',
      'submitting',
      'confirmed',
    ]);
  });
});
