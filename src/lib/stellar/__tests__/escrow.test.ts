import { beforeEach, describe, expect, it, vi } from 'vitest';
import { xdr } from '@stellar/stellar-sdk';
import {
  formatStroops,
  extractContractErrorCode,
  CONTRACT_ERRORS,
  getContract,
} from '../escrow';
import { simulateRead } from '../rpc';

vi.mock('../rpc', () => ({
  getRpcServer: vi.fn(),
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  simulateRead: vi.fn(),
}));

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

describe('CONTRACT_ERRORS', () => {
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
    mockSimulateRead.mockResolvedValue({ map: () => [] } as unknown as xdr.ScVal);

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
    expect(result.milestones).toEqual([]);
  });

  it('maps contract error code 5 to ContractNotFound', async () => {
    mockSimulateRead.mockRejectedValue(
      new Error('HostError: Error(Contract, #5)')
    );

    await expect(getContract(99)).rejects.toThrow('ContractNotFound');
  });

  it('rethrows other simulation errors', async () => {
    mockSimulateRead.mockRejectedValue(
      new Error('HostError: Error(Contract, #3)')
    );

    await expect(getContract(99)).rejects.toThrow('HostError: Error(Contract, #3)');
  });
});
