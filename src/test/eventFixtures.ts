import { xdr } from '@stellar/stellar-sdk';
import type { RawContractEvent } from '@/lib/stellar/events';

export const FIXTURE_CLIENT = 'GDKIJJIKXLOM2NRMPNQZUUYK24ZPVFC6426GZAEP3KUK6KEJLACCWNMX';
export const FIXTURE_FREELANCER = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

/** Base64 XDR topics/values as returned by Soroban RPC `getEvents` for each escrow event. */
export const EVENT_XDR = {
  created: {
    topic: ['AAAADwAAAAdjcmVhdGVkAA==', 'AAAABQAAAAAAAAAE'],
    value:
      'AAAAEAAAAAEAAAADAAAAEgAAAAAAAAAA1ISlCrrczTYse2GaUwrXMvqUXua8bICP2qivKIlYBCsAAAASAAAAAAAAAABi/B0L0JGythwN1lY0aypo19NHxvLCyO5tBEcCVvwF9wAAAAoAAAAAAAAAAAAAAACy0F4A',
  },
  deposit: { topic: ['AAAADwAAAAdkZXBvc2l0AA==', 'AAAABQAAAAAAAAAE'], value: 'AAAACgAAAAAAAAAAAAAAAFloLwA=' },
  release: {
    topic: ['AAAADwAAAAdyZWxlYXNlAA==', 'AAAABQAAAAAAAAAE'],
    value: 'AAAAEAAAAAEAAAACAAAAAwAAAAAAAAAKAAAAAAAAAAAAAAAAO5rKAA==',
  },
  dispute: {
    topic: ['AAAADwAAAAdkaXNwdXRlAA==', 'AAAABQAAAAAAAAAE'],
    value: 'AAAAEgAAAAAAAAAA1ISlCrrczTYse2GaUwrXMvqUXua8bICP2qivKIlYBCs=',
  },
  resolved: {
    topic: ['AAAADwAAAAhyZXNvbHZlZA==', 'AAAABQAAAAAAAAAE'],
    value: 'AAAAEAAAAAEAAAACAAAACgAAAAAAAAAAAAAAAA7msoAAAAAKAAAAAAAAAAAAAAAAAExLQA==',
  },
  cancel: { topic: ['AAAADwAAAAZjYW5jZWwAAA==', 'AAAABQAAAAAAAAAF'], value: 'AAAACgAAAAAAAAAAAAAAAAAS1oc=' },
  rep: {
    topic: ['AAAADwAAAANyZXAA', 'AAAABQAAAAAAAAAE'],
    value: 'AAAAEAAAAAEAAAACAAAAEgAAAAAAAAAAYvwdC9CRsrYcDdZWNGsqaNfTR8bywsjubQRHAlb8BfcAAAADAAAABQ==',
  },
  unknown: { topic: ['AAAADwAAAAZwYXVzZWQAAA=='], value: 'AAAAAAAAAAE=' },
} as const;

export type EventFixtureKind = keyof typeof EVENT_XDR;

export function rawEvent(kind: EventFixtureKind, overrides: Partial<RawContractEvent> = {}): RawContractEvent {
  const { topic, value } = EVENT_XDR[kind];
  const ledger = overrides.ledger ?? 5_372_100;
  return {
    id: `${String(ledger).padStart(19, '0')}-0000000001`,
    ledger,
    ledgerClosedAt: '2026-10-24T23:00:00Z',
    txHash: `${kind.padEnd(8, '0')}${'ab'.repeat(28)}`,
    topic: topic.map((t) => xdr.ScVal.fromXDR(t, 'base64')),
    value: xdr.ScVal.fromXDR(value, 'base64'),
    ...overrides,
  };
}
