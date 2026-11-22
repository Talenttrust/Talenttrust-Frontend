import { afterEach, describe, expect, it, vi } from 'vitest';

const PUBLIC_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
const FUTURENET_PASSPHRASE = 'Test SDF Future Network ; October 2022';

describe('expectedPassphrase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('returns the public passphrase for "public"', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'public');
    vi.resetModules();
    const { expectedPassphrase } = await import('./network');
    expect(expectedPassphrase()).toBe(PUBLIC_PASSPHRASE);
  });

  it('returns the public passphrase for "mainnet"', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'mainnet');
    vi.resetModules();
    const { expectedPassphrase } = await import('./network');
    expect(expectedPassphrase()).toBe(PUBLIC_PASSPHRASE);
  });

  it('returns the testnet passphrase for "testnet"', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'testnet');
    vi.resetModules();
    const { expectedPassphrase } = await import('./network');
    expect(expectedPassphrase()).toBe(TESTNET_PASSPHRASE);
  });

  it('returns the futurenet passphrase for "futurenet"', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'futurenet');
    vi.resetModules();
    const { expectedPassphrase } = await import('./network');
    expect(expectedPassphrase()).toBe(FUTURENET_PASSPHRASE);
  });

  it('falls back to the testnet passphrase for unknown network names', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'custom-unknown');
    vi.resetModules();
    const { expectedPassphrase } = await import('./network');
    expect(expectedPassphrase()).toBe(TESTNET_PASSPHRASE);
  });
});
