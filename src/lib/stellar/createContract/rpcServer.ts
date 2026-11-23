import { rpc as StellarRpc } from '@stellar/stellar-sdk';
import { stellarConfig } from '@/lib/stellar/config';

/**
 * Returns a Soroban RPC server pointed at the configured endpoint.
 * The URL is resolved once from stellarConfig (which reads env vars and
 * applies fallbacks), so this module has no direct env-var reads.
 */
export function getRpcServer(): StellarRpc.Server {
  return new StellarRpc.Server(stellarConfig.rpcUrl, { allowHttp: false });
}
