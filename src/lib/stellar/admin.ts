import { Address } from '@stellar/stellar-sdk';
import { simulateRead } from './rpc';

let adminRequest: Promise<string> | undefined;

export function readAdmin(): Promise<string> {
  adminRequest ??= simulateRead('get_admin').then((value) => Address.fromScVal(value).toString());
  return adminRequest;
}
