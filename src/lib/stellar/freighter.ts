import {
  isConnected,
  getAddress,
  getNetwork,
  requestAccess,
  signTransaction,
  isAllowed,
} from '@stellar/freighter-api';

/**
 * Check if Freighter extension is installed.
 * Returns false during SSR.
 */
export async function isInstalled(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const result = await isConnected();
  return result.isConnected;
}

/**
 * Get the user's Stellar address.
 * Returns empty string if not authorized or not installed.
 */
export async function getAddressSafe(): Promise<string> {
  if (typeof window === 'undefined') return '';
  const result = await getAddress();
  return result.address || '';
}

/**
 * Get the network passphrase from Freighter.
 * Returns empty string if not available.
 */
export async function getNetworkPassphrase(): Promise<string> {
  if (typeof window === 'undefined') return '';
  const result = await getNetwork();
  return result.networkPassphrase || '';
}

/**
 * Request access to the user's wallet.
 * Prompts the user to authorize the app and returns their address.
 */
export async function requestAccessSafe(): Promise<{ address: string; error?: string }> {
  if (typeof window === 'undefined') {
    return { address: '', error: 'SSR: window not available' };
  }
  const result = await requestAccess();
  if (result.error) {
    return { address: '', error: result.error.message };
  }
  return { address: result.address };
}

/**
 * Sign a transaction with Freighter.
 */
export async function signTransactionSafe(
  xdr: string,
  opts?: { networkPassphrase?: string }
): Promise<{ signedXdr: string; error?: string }> {
  if (typeof window === 'undefined') {
    return { signedXdr: '', error: 'SSR: window not available' };
  }
  const result = await signTransaction(xdr, opts);
  if (result.error) {
    return { signedXdr: '', error: result.error.message };
  }
  return { signedXdr: result.signedTxXdr };
}

/**
 * Check if the app is allowed to access the user's wallet.
 */
export async function isAllowedSafe(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const result = await isAllowed();
  return result.isAllowed;
}
