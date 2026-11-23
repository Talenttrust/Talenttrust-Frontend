import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTokenMetadata, clearTokenMetadataCache, FALLBACK_METADATA } from '../token';

vi.mock('../rpc', () => ({
  simulateContractCallFor: vi.fn(),
}));

import { simulateContractCallFor } from '../rpc';
const mockSimulate = simulateContractCallFor as ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearTokenMetadataCache();
  mockSimulate.mockReset();
});

describe('getTokenMetadata', () => {
  it('returns symbol and decimals from the contract', async () => {
    mockSimulate
      .mockResolvedValueOnce('USDC')   // symbol
      .mockResolvedValueOnce(6);       // decimals

    const meta = await getTokenMetadata('CONTRACT_A');
    expect(meta).toEqual({ symbol: 'USDC', decimals: 6 });
  });

  it('caches the result and does not call simulate twice', async () => {
    mockSimulate.mockResolvedValue('XLM').mockResolvedValueOnce('USDC').mockResolvedValueOnce(6);

    await getTokenMetadata('CONTRACT_B');
    await getTokenMetadata('CONTRACT_B');
    // simulate called only on first fetch (2 calls for symbol + decimals)
    expect(mockSimulate).toHaveBeenCalledTimes(2);
  });

  it('busts cache when bust=true', async () => {
    mockSimulate.mockResolvedValue('XLM');
    mockSimulate
      .mockResolvedValueOnce('USDC').mockResolvedValueOnce(6)
      .mockResolvedValueOnce('USDC').mockResolvedValueOnce(6);

    await getTokenMetadata('CONTRACT_C');
    await getTokenMetadata('CONTRACT_C', true);
    expect(mockSimulate).toHaveBeenCalledTimes(4);
  });

  it('falls back to XLM/7 when simulation throws', async () => {
    mockSimulate.mockRejectedValue(new Error('network error'));
    const meta = await getTokenMetadata('CONTRACT_ERR');
    expect(meta).toEqual(FALLBACK_METADATA);
  });

  it('falls back to XLM/7 for empty symbol', async () => {
    mockSimulate.mockResolvedValueOnce('').mockResolvedValueOnce(6);
    const meta = await getTokenMetadata('CONTRACT_EMPTY');
    expect(meta.symbol).toBe('XLM');
  });

  it('falls back decimals to 7 for negative value', async () => {
    mockSimulate.mockResolvedValueOnce('TOK').mockResolvedValueOnce(-1);
    const meta = await getTokenMetadata('CONTRACT_NEG');
    expect(meta.decimals).toBe(7);
  });

  it('caches the fallback so simulate is not called again', async () => {
    mockSimulate.mockRejectedValue(new Error('fail'));
    await getTokenMetadata('CONTRACT_FALLBACK');
    await getTokenMetadata('CONTRACT_FALLBACK');
    expect(mockSimulate).toHaveBeenCalledTimes(2); // only first attempt
  });
});
