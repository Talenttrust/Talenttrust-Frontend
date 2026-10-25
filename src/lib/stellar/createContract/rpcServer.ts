import { rpc as StellarRpc } from '@stellar/stellar-sdk';

/**
 * The Soroban RPC endpoint for Stellar testnet.
 * We read this from an env var so CI can override it, but default to the
 * public SDF endpoint. The contract id comes exclusively from site.ts.
 */
const RPC_URL =
  (process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org').replace(
    /\/$/,
    '',
  );

export function getRpcServer(): StellarRpc.Server {
  return new StellarRpc.Server(RPC_URL, { allowHttp: false });
}
