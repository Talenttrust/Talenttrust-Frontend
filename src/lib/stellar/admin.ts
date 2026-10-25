import { Address } from '@stellar/stellar-sdk';
import { simulateRead } from './rpc';

let adminRequest: Promise<string> | undefined;

/** Reads the contract admin (the dispute arbiter). Cached; a failed read is retried next time. */
export function readAdmin(): Promise<string> {
  adminRequest ??= simulateRead('get_admin', [])
    .then((value) => Address.fromScVal(value).toString())
    .catch((error) => {
      adminRequest = undefined;
      throw error;
    });
  return adminRequest;
}
