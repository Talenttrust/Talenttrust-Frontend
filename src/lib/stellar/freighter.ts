/**
 * Minimal adapter over @stellar/freighter-api that exposes only the three
 * functions this codebase needs. Keeping the same names here means the wallet-
 * connect integration PR can swap to a shared WalletProvider without changing
 * any call sites.
 */

import {
  getAddress,
  getNetworkDetails,
  signTransaction as freighterSignTransaction,
} from '@stellar/freighter-api';

export interface WalletAddress {
  address: string;
  error?: string;
}

export interface NetworkDetails {
  network: string;
  networkPassphrase: string;
  sorobanRpcUrl?: string;
  error?: string;
}

export interface SignedTransaction {
  signedTxXdr: string;
  error?: string;
}

/** Return the connected wallet's public key, or an error string. */
export async function getWalletAddress(): Promise<WalletAddress> {
  const result = await getAddress();
  if (result.error) {
    return { address: '', error: result.error.message };
  }
  return { address: result.address };
}

/** Return network details from the connected wallet. */
export async function getWalletNetworkDetails(): Promise<NetworkDetails> {
  const result = await getNetworkDetails();
  if (result.error) {
    return { network: '', networkPassphrase: '', error: result.error.message };
  }
  return {
    network: result.network,
    networkPassphrase: result.networkPassphrase,
    sorobanRpcUrl: result.sorobanRpcUrl,
  };
}

/**
 * Ask the wallet to sign `txXdr` on `networkPassphrase`.
 *
 * The passphrase is taken from our config (site.ts / TESTNET_PASSPHRASE),
 * NOT from the wallet response, so a passphrase mismatch always causes a
 * signing failure rather than silently submitting to the wrong network.
 */
export async function signTransaction(
  txXdr: string,
  networkPassphrase: string,
): Promise<SignedTransaction> {
  const result = await freighterSignTransaction(txXdr, { networkPassphrase });
  if (result.error) {
    return { signedTxXdr: '', error: result.error.message };
  }
  return { signedTxXdr: result.signedTxXdr };
}
