/**
 * Minimal adapter over @stellar/freighter-api.
 *
 * Exports three functions with stable names so any future WalletProvider
 * (wallet-connect issue) can be swapped in without touching call-sites:
 *   getAddress()              → currently connected Stellar public key, or null
 *   getNetworkPassphrase()    → e.g. "Test SDF Network ; September 2015"
 *   signTransaction(xdr)      → signed XDR string
 *
 * All three are async and throw a plain Error on failure so callers don't
 * need to know about Freighter's internal error shapes.
 */

import {
  getAddress as freighterGetAddress,
  getNetworkDetails,
  signTransaction as freighterSignTransaction,
  isAllowed,
  setAllowed,
} from '@stellar/freighter-api';

/** Returns the connected wallet address, or null when not connected / not installed. */
export async function getAddress(): Promise<string | null> {
  try {
    // isAllowed() returns false when Freighter is not installed or the site
    // hasn't been granted access yet.
    const allowed = await isAllowed();
    if (!allowed) {
      await setAllowed();
    }
    const result = await freighterGetAddress();
    // Freighter v4 returns { address: string } or { error: string }
    if ('error' in result && result.error) return null;
    return 'address' in result ? result.address : null;
  } catch {
    return null;
  }
}

/** Returns the network passphrase for the currently selected Freighter network. */
export async function getNetworkPassphrase(): Promise<string> {
  const result = await getNetworkDetails();
  if ('error' in result && result.error) {
    throw new Error(`Freighter network error: ${result.error}`);
  }
  return 'networkPassphrase' in result ? result.networkPassphrase : '';
}

/**
 * Signs a Stellar transaction XDR string.
 * @param xdr - Base64-encoded transaction XDR.
 * @returns Signed transaction XDR.
 */
export async function signTransaction(xdr: string): Promise<string> {
  const networkPassphrase = await getNetworkPassphrase();
  const result = await freighterSignTransaction(xdr, { networkPassphrase });
  if ('error' in result && result.error) {
    throw new Error(`Freighter signing error: ${result.error}`);
  }
  if (!('signedTxXdr' in result)) {
    throw new Error('Freighter did not return a signed transaction.');
  }
  return result.signedTxXdr;
}