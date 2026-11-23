/**
 * On-chain token metadata reader.
 *
 * Reads `symbol` and `decimals` from a Soroban SEP-41 token contract via
 * read-only simulation and caches the result in memory so each contract is
 * only queried once per page load.
 *
 * Falls back to `{ symbol: "XLM", decimals: 7 }` whenever the simulation
 * fails (network unavailable, unit-test environment, native SAC).
 */

import { simulateContractCallFor } from './rpc';

export interface TokenMetadata {
  symbol: string;
  decimals: number;
}

export const FALLBACK_METADATA: TokenMetadata = { symbol: 'XLM', decimals: 7 };

/** In-memory cache: contractId -> metadata */
const cache = new Map<string, TokenMetadata>();

/**
 * Return the token's symbol and decimals.
 * Results are memoised; pass `bust = true` to force a fresh read.
 */
export async function getTokenMetadata(
  contractId: string,
  bust = false,
): Promise<TokenMetadata> {
  if (!bust && cache.has(contractId)) {
    return cache.get(contractId)!;
  }

  try {
    const [rawSymbol, rawDecimals] = await Promise.all([
      simulateContractCallFor(contractId, 'symbol'),
      simulateContractCallFor(contractId, 'decimals'),
    ]);

    const symbol =
      typeof rawSymbol === 'string' && rawSymbol.length > 0
        ? rawSymbol
        : FALLBACK_METADATA.symbol;

    const decimals =
      typeof rawDecimals === 'number' && rawDecimals >= 0
        ? rawDecimals
        : typeof rawDecimals === 'bigint' && rawDecimals >= 0n
          ? Number(rawDecimals)
          : FALLBACK_METADATA.decimals;

    const meta: TokenMetadata = { symbol, decimals };
    cache.set(contractId, meta);
    return meta;
  } catch {
    cache.set(contractId, FALLBACK_METADATA);
    return FALLBACK_METADATA;
  }
}

/** Clear the metadata cache (useful in tests). */
export function clearTokenMetadataCache(): void {
  cache.clear();
}
