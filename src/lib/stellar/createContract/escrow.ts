/**
 * Builds an unsigned create_contract invocation transaction.
 *
 * The contract signature is:
 *   create_contract(client: Address, freelancer: Address, token: Address,
 *                   milestone_amounts: Vec<i128>) -> u64
 *
 * client.require_auth() is called inside the contract, so the source account
 * of this transaction must be the client and the client must sign it.
 */

import {
  Asset,
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  nativeToScVal,
  Address,
  xdr,
} from '@stellar/stellar-sdk';
import { getRpcServer } from './rpcServer';
import { site } from '@/lib/site';

/** Testnet network passphrase — sourced from config, never from the wallet. */
export const TESTNET_PASSPHRASE: string = Networks.TESTNET;

/**
 * The Stellar Asset Contract id for native XLM on testnet, derived from the
 * network passphrase (never hard-coded).
 */
export const XLM_SAC_ID: string = Asset.native().contractId(Networks.TESTNET);

export { getRpcServer } from './rpcServer';

export interface BuildCreateContractTxParams {
  /** Stellar public key (G…) of the client — becomes the tx source and signer. */
  client: string;
  /** Stellar public key (G…) of the freelancer. */
  freelancer: string;
  /**
   * Stellar Asset Contract id (C…) of the token.
   * Defaults to the XLM SAC for the testnet passphrase.
   */
  token: string;
  /**
   * Milestone amounts in stroops (already converted — use stroopsFromXlm).
   * Each value is a JS bigint so there is no floating-point rounding.
   */
  amounts: bigint[];
}

/**
 * Build an unsigned Transaction that calls create_contract on the deployed
 * escrow contract.  The caller must:
 *   1. simulate + prepare via rpc.prepareTransaction
 *   2. serialise to XDR, send to Freighter for signing
 *   3. submit via sendTransaction
 */
export async function buildCreateContractTx(
  params: BuildCreateContractTxParams,
): Promise<import('@stellar/stellar-sdk').Transaction> {
  const { client, freelancer, token, amounts } = params;

  const server = getRpcServer();
  const account = await server.getAccount(client);

  const contract = new Contract(site.contractId);

  // Encode arguments as Soroban ScVals
  const clientScVal = nativeToScVal(Address.fromString(client), { type: 'address' });
  const freelancerScVal = nativeToScVal(Address.fromString(freelancer), { type: 'address' });
  const tokenScVal = nativeToScVal(Address.fromString(token), { type: 'address' });
  const amountsScVal = xdr.ScVal.scvVec(
    amounts.map((a) => nativeToScVal(a, { type: 'i128' })),
  );

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(contract.call('create_contract', clientScVal, freelancerScVal, tokenScVal, amountsScVal))
    .setTimeout(180) // 3 minutes
    .build();

  return tx;
}
