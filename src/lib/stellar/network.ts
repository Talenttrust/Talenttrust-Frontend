import { site } from '@/lib/site';

const Networks = {
  PUBLIC: 'Public Global Stellar Network ; September 2015',
  TESTNET: 'Test SDF Network ; September 2015',
  FUTURENET: 'Test SDF Future Network ; October 2022',
  STANDALONE: 'Standalone Network ; February 2017',
};

/**
 * Maps the configured network name to its Stellar network passphrase.
 */
export function expectedPassphrase(): string {
  switch (site.network) {
    case 'public':
    case 'mainnet':
      return Networks.PUBLIC;
    case 'testnet':
      return Networks.TESTNET;
    case 'futurenet':
      return Networks.FUTURENET;
    default:
      // Unknown network names intentionally fall back to the testnet passphrase.
      return Networks.TESTNET;
  }
}
