import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_CONTRACT_ID',
  'NEXT_PUBLIC_STELLAR_NETWORK',
  'NEXT_PUBLIC_STELLAR_RPC_URL',
] as const;

beforeEach(() => {
  vi.resetModules();
  for (const key of ENV_KEYS) {
    vi.stubEnv(key, undefined);
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('site config', () => {
  it('uses expected defaults when no environment variables are set', async () => {
    const { site, explorerUrl, apiDocsUrl } = await import('../site');

    expect(site).toEqual({
      name: 'TalentTrust',
      tagline: 'Milestone escrow for freelancers, secured on Stellar.',
      apiUrl: 'https://talenttrust-backend.vercel.app',
      contractId: 'CCZMIVUBMG5SBC47SDTC32RWLBJ2HW2DCFVWJEOKCH2IFJBZGBKTXK5W',
      network: 'testnet',
      rpcUrl: 'https://soroban-testnet.stellar.org',
      github: 'https://github.com/Talenttrust',
    });
    expect(explorerUrl).toBe(
      'https://stellar.expert/explorer/testnet/contract/CCZMIVUBMG5SBC47SDTC32RWLBJ2HW2DCFVWJEOKCH2IFJBZGBKTXK5W',
    );
    expect(apiDocsUrl).toBe('https://talenttrust-backend.vercel.app/docs');
  });

  it('strips a trailing slash from NEXT_PUBLIC_API_URL and derives apiDocsUrl cleanly', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test/');
    const { site, apiDocsUrl } = await import('../site');

    expect(site.apiUrl).toBe('https://api.example.test');
    expect(apiDocsUrl).toBe('https://api.example.test/docs');
  });

  it('preserves NEXT_PUBLIC_API_URL without a trailing slash', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
    const { site, apiDocsUrl } = await import('../site');

    expect(site.apiUrl).toBe('https://api.example.test');
    expect(apiDocsUrl).toBe('https://api.example.test/docs');
  });

  it('strips a trailing slash from NEXT_PUBLIC_STELLAR_RPC_URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_RPC_URL', 'https://rpc.example.test/');
    const { site } = await import('../site');

    expect(site.rpcUrl).toBe('https://rpc.example.test');
  });

  it('uses the mainnet default RPC URL when NEXT_PUBLIC_STELLAR_NETWORK is mainnet', async () => {
    const { site: testnetSite } = await import('../site');

    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'mainnet');
    const { site: mainnetSite, explorerUrl } = await import('../site');

    expect(mainnetSite.network).toBe('mainnet');
    expect(mainnetSite.rpcUrl).toBe('https://soroban.stellar.org');
    expect(mainnetSite.rpcUrl).not.toBe(testnetSite.rpcUrl);
    expect(explorerUrl).toBe(
      `https://stellar.expert/explorer/mainnet/contract/${mainnetSite.contractId}`,
    );
  });

  it('allows a custom RPC URL to override the mainnet default and strips its trailing slash', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'mainnet');
    vi.stubEnv('NEXT_PUBLIC_STELLAR_RPC_URL', 'https://custom-mainnet-rpc.example.test/');
    const { site } = await import('../site');

    expect(site.network).toBe('mainnet');
    expect(site.rpcUrl).toBe('https://custom-mainnet-rpc.example.test');
  });

  it('builds explorerUrl from custom contractId and network', async () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'mainnet');
    vi.stubEnv('NEXT_PUBLIC_CONTRACT_ID', 'CCUSTOMCONTRACTID1234567890');
    const { site, explorerUrl } = await import('../site');

    expect(site.contractId).toBe('CCUSTOMCONTRACTID1234567890');
    expect(explorerUrl).toBe(
      'https://stellar.expert/explorer/mainnet/contract/CCUSTOMCONTRACTID1234567890',
    );
  });
});
