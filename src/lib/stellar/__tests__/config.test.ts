// @vitest-environment node
/**
 * Unit tests for src/lib/stellar/config.ts
 *
 * Each describe block uses vi.resetModules + vi.stubEnv to isolate env-var
 * resolution so tests do not bleed into each other.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Networks } from '@stellar/stellar-sdk';

// Helper: dynamically re-import the config module after env vars have been set.
async function importConfig() {
  const mod = await import('../config');
  return mod;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// ── Default (testnet) ─────────────────────────────────────────────────────────

describe('default resolution (no env vars set)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('resolves network to testnet', async () => {
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.network).toBe('testnet');
  });

  it('resolves passphrase to testnet passphrase', async () => {
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.passphrase).toBe(Networks.TESTNET);
  });

  it('resolves rpcUrl to the testnet SDF endpoint', async () => {
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.rpcUrl).toBe('https://soroban-testnet.stellar.org');
  });

  it('resolves contractId to the default contract', async () => {
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.contractId).toBe(
      'CCZMIVUBMG5SBC47SDTC32RWLBJ2HW2DCFVWJEOKCH2IFJBZGBKTXK5W',
    );
  });

  it('derives nativeAssetContractId from the testnet passphrase', async () => {
    const { stellarConfig, passphraseForNetwork } = await importConfig();
    const { Asset } = await import('@stellar/stellar-sdk');
    expect(stellarConfig.nativeAssetContractId).toBe(
      Asset.native().contractId(passphraseForNetwork('testnet')),
    );
  });

  it('explorerTxUrl returns a testnet URL', async () => {
    const { explorerTxUrl } = await importConfig();
    expect(explorerTxUrl('abc123')).toBe(
      'https://stellar.expert/explorer/testnet/tx/abc123',
    );
  });

  it('explorerContractUrl returns a testnet URL', async () => {
    const { explorerContractUrl } = await importConfig();
    expect(explorerContractUrl('CABC')).toBe(
      'https://stellar.expert/explorer/testnet/contract/CABC',
    );
  });
});

// ── Mainnet ───────────────────────────────────────────────────────────────────

describe('mainnet resolution', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'mainnet');
    vi.stubEnv('NEXT_PUBLIC_STELLAR_CONTRACT_ID', 'CMAINNET_CONTRACT');
  });

  it('resolves network to mainnet', async () => {
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.network).toBe('mainnet');
  });

  it('resolves passphrase to public network passphrase', async () => {
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.passphrase).toBe(Networks.PUBLIC);
  });

  it('resolves rpcUrl to the mainnet SDF endpoint', async () => {
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.rpcUrl).toBe('https://soroban.stellar.org');
  });

  it('resolves contractId from NEXT_PUBLIC_STELLAR_CONTRACT_ID', async () => {
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.contractId).toBe('CMAINNET_CONTRACT');
  });

  it('derives nativeAssetContractId from the mainnet passphrase', async () => {
    const { stellarConfig } = await importConfig();
    const { Asset } = await import('@stellar/stellar-sdk');
    expect(stellarConfig.nativeAssetContractId).toBe(
      Asset.native().contractId(Networks.PUBLIC),
    );
  });

  it('explorerTxUrl returns a mainnet URL', async () => {
    const { explorerTxUrl } = await importConfig();
    expect(explorerTxUrl('deadbeef')).toBe(
      'https://stellar.expert/explorer/mainnet/tx/deadbeef',
    );
  });

  it('nativeAssetContractId differs from testnet', async () => {
    const { stellarConfig } = await importConfig();
    const { Asset } = await import('@stellar/stellar-sdk');
    const testnetSac = Asset.native().contractId(Networks.TESTNET);
    expect(stellarConfig.nativeAssetContractId).not.toBe(testnetSac);
  });
});

// ── Futurenet ─────────────────────────────────────────────────────────────────

describe('futurenet resolution', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'futurenet');
    vi.stubEnv('NEXT_PUBLIC_STELLAR_RPC_URL', 'https://custom-futurenet-rpc.example.com/');
  });

  it('resolves network to futurenet', async () => {
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.network).toBe('futurenet');
  });

  it('resolves passphrase to futurenet passphrase', async () => {
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.passphrase).toBe(Networks.FUTURENET);
  });

  it('strips trailing slash from custom rpcUrl', async () => {
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.rpcUrl).toBe('https://custom-futurenet-rpc.example.com');
  });

  it('derives nativeAssetContractId from the futurenet passphrase', async () => {
    const { stellarConfig } = await importConfig();
    const { Asset } = await import('@stellar/stellar-sdk');
    expect(stellarConfig.nativeAssetContractId).toBe(
      Asset.native().contractId(Networks.FUTURENET),
    );
  });

  it('explorerTxUrl returns a futurenet URL', async () => {
    const { explorerTxUrl } = await importConfig();
    expect(explorerTxUrl('ff00')).toBe(
      'https://stellar.expert/explorer/futurenet/tx/ff00',
    );
  });
});

// ── Legacy env-var fallbacks ──────────────────────────────────────────────────

describe('legacy env var fallbacks', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('NEXT_PUBLIC_SOROBAN_RPC_URL is accepted as a legacy fallback for rpcUrl', async () => {
    vi.stubEnv('NEXT_PUBLIC_SOROBAN_RPC_URL', 'https://legacy-rpc.example.com');
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.rpcUrl).toBe('https://legacy-rpc.example.com');
  });

  it('NEXT_PUBLIC_STELLAR_RPC_URL takes precedence over NEXT_PUBLIC_SOROBAN_RPC_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_RPC_URL', 'https://canonical-rpc.example.com');
    vi.stubEnv('NEXT_PUBLIC_SOROBAN_RPC_URL', 'https://legacy-rpc.example.com');
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.rpcUrl).toBe('https://canonical-rpc.example.com');
  });

  it('NEXT_PUBLIC_CONTRACT_ID is accepted as a legacy fallback for contractId', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONTRACT_ID', 'CLEGACY_CONTRACT_ID');
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.contractId).toBe('CLEGACY_CONTRACT_ID');
  });

  it('NEXT_PUBLIC_ESCROW_CONTRACT_ID is accepted as a legacy fallback for contractId', async () => {
    vi.stubEnv('NEXT_PUBLIC_ESCROW_CONTRACT_ID', 'CESCROW_LEGACY_ID');
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.contractId).toBe('CESCROW_LEGACY_ID');
  });

  it('NEXT_PUBLIC_STELLAR_CONTRACT_ID takes precedence over legacy names', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_CONTRACT_ID', 'CCANONICAL');
    vi.stubEnv('NEXT_PUBLIC_CONTRACT_ID', 'CLEGACY');
    vi.stubEnv('NEXT_PUBLIC_ESCROW_CONTRACT_ID', 'CESCROW');
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.contractId).toBe('CCANONICAL');
  });

  it('NEXT_PUBLIC_NETWORK_PASSPHRASE overrides the derived passphrase', async () => {
    vi.stubEnv('NEXT_PUBLIC_NETWORK_PASSPHRASE', 'Custom Network Passphrase ; 2024');
    const { stellarConfig } = await importConfig();
    expect(stellarConfig.passphrase).toBe('Custom Network Passphrase ; 2024');
  });
});

// ── passphraseForNetwork helper ───────────────────────────────────────────────

describe('passphraseForNetwork', () => {
  it('maps testnet to Networks.TESTNET', async () => {
    const { passphraseForNetwork } = await importConfig();
    expect(passphraseForNetwork('testnet')).toBe(Networks.TESTNET);
  });

  it('maps mainnet to Networks.PUBLIC', async () => {
    const { passphraseForNetwork } = await importConfig();
    expect(passphraseForNetwork('mainnet')).toBe(Networks.PUBLIC);
  });

  it('maps public to Networks.PUBLIC', async () => {
    const { passphraseForNetwork } = await importConfig();
    expect(passphraseForNetwork('public')).toBe(Networks.PUBLIC);
  });

  it('maps futurenet to Networks.FUTURENET', async () => {
    const { passphraseForNetwork } = await importConfig();
    expect(passphraseForNetwork('futurenet')).toBe(Networks.FUTURENET);
  });

  it('falls back to Networks.TESTNET for unknown names', async () => {
    const { passphraseForNetwork } = await importConfig();
    expect(passphraseForNetwork('unknown')).toBe(Networks.TESTNET);
  });
});
