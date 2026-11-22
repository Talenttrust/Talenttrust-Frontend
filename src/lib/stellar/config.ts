/**
 * Central Stellar / Soroban configuration.
 *
 * Every piece of network-specific data is resolved here, in one place, with
 * a single documented env var per setting.  Legacy names are accepted as
 * fallbacks so existing deployments keep working without changes.
 *
 * Canonical env vars
 * ──────────────────
 * NEXT_PUBLIC_STELLAR_NETWORK      – "testnet" | "mainnet" | "futurenet"
 *                                    (fallback: "testnet")
 * NEXT_PUBLIC_STELLAR_RPC_URL      – Full Soroban RPC endpoint URL.
 *                                    Legacy fallback: NEXT_PUBLIC_SOROBAN_RPC_URL
 * NEXT_PUBLIC_STELLAR_CONTRACT_ID  – Deployed escrow contract address (C…).
 *                                    Legacy fallbacks: NEXT_PUBLIC_CONTRACT_ID,
 *                                                      NEXT_PUBLIC_ESCROW_CONTRACT_ID
 * NEXT_PUBLIC_NETWORK_PASSPHRASE   – Override the derived network passphrase.
 *                                    (Rarely needed; computed from network if absent.)
 */

import { Asset, Networks } from '@stellar/stellar-sdk';

export type StellarNetwork = 'testnet' | 'mainnet' | 'futurenet';

// ── Default values ───────────────────────────────────────────────────────────

const DEFAULT_CONTRACT_ID = 'CCZMIVUBMG5SBC47SDTC32RWLBJ2HW2DCFVWJEOKCH2IFJBZGBKTXK5W';

const DEFAULT_RPC: Record<StellarNetwork, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://soroban.stellar.org',
  futurenet: 'https://rpc-futurenet.stellar.org',
};

// ── Passphrase derivation ────────────────────────────────────────────────────

/**
 * Return the canonical Stellar network passphrase for a network name.
 * Mirrors the logic in network.ts#expectedPassphrase (which is intentionally
 * kept separate and not modified here).
 */
export function passphraseForNetwork(network: StellarNetwork | string): string {
  switch (network) {
    case 'mainnet':
    case 'public':
      return Networks.PUBLIC;
    case 'futurenet':
      return Networks.FUTURENET;
    case 'testnet':
    default:
      return Networks.TESTNET;
  }
}

// ── Config resolution ────────────────────────────────────────────────────────

function resolveNetwork(): StellarNetwork {
  const raw = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet').toLowerCase();
  if (raw === 'mainnet' || raw === 'public') return 'mainnet';
  if (raw === 'futurenet') return 'futurenet';
  return 'testnet';
}

function resolveRpcUrl(network: StellarNetwork): string {
  const url =
    process.env.NEXT_PUBLIC_STELLAR_RPC_URL ??    // canonical
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??    // legacy
    DEFAULT_RPC[network];
  return url.replace(/\/$/, '');
}

function resolveContractId(): string {
  return (
    process.env.NEXT_PUBLIC_STELLAR_CONTRACT_ID ?? // canonical
    process.env.NEXT_PUBLIC_CONTRACT_ID ??          // legacy (site.ts)
    process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID ??   // legacy (escrow.ts)
    DEFAULT_CONTRACT_ID
  );
}

function resolvePassphrase(network: StellarNetwork): string {
  return (
    process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ??  // explicit override
    passphraseForNetwork(network)
  );
}

// ── Exported config object ───────────────────────────────────────────────────

export interface StellarConfig {
  /** Normalised network name: "testnet" | "mainnet" | "futurenet". */
  network: StellarNetwork;
  /** Stellar network passphrase matching the network. */
  passphrase: string;
  /** Soroban RPC endpoint URL (no trailing slash). */
  rpcUrl: string;
  /** Deployed escrow contract address (C…). */
  contractId: string;
  /**
   * Stellar Asset Contract id for native XLM on this network.
   * Derived from the passphrase so it is always correct for the
   * configured network.
   */
  nativeAssetContractId: string;
}

function buildConfig(): StellarConfig {
  const network = resolveNetwork();
  const passphrase = resolvePassphrase(network);
  const rpcUrl = resolveRpcUrl(network);
  const contractId = resolveContractId();
  const nativeAssetContractId = Asset.native().contractId(passphrase);

  return { network, passphrase, rpcUrl, contractId, nativeAssetContractId };
}

export const stellarConfig: StellarConfig = buildConfig();

// ── URL helpers ──────────────────────────────────────────────────────────────

/**
 * Returns the stellar.expert explorer URL for a transaction hash on the
 * configured network.
 */
export function explorerTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/${stellarConfig.network}/tx/${hash}`;
}

/**
 * Returns the stellar.expert explorer URL for a contract on the configured
 * network.
 */
export function explorerContractUrl(id: string): string {
  return `https://stellar.expert/explorer/${stellarConfig.network}/contract/${id}`;
}
