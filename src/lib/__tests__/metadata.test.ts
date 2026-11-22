import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('rootMetadata', () => {
  it('preserves the page metadata and provides social metadata with the production base URL', async () => {
    const { rootMetadata } = await import('../metadata');

    expect(rootMetadata.metadataBase?.toString()).toBe('https://talenttrust-frontend.vercel.app/');
    expect(rootMetadata.title).toEqual({
      default: 'TalentTrust | Milestone escrow on Stellar',
      template: '%s | TalentTrust',
    });
    expect(rootMetadata.description).toBe(
      'TalentTrust lets clients and freelancers lock payments in a Soroban smart contract, release funds milestone by milestone, resolve disputes and build on-chain reputation.',
    );
    expect(rootMetadata.icons).toEqual({ icon: '/icon.svg' });
    expect(rootMetadata.openGraph).toEqual({
      title: 'TalentTrust | Milestone escrow on Stellar',
      description: rootMetadata.description,
      url: '/',
      siteName: 'TalentTrust',
      type: 'website',
      locale: 'en_US',
    });
    expect(rootMetadata.twitter).toEqual({
      card: 'summary',
      title: 'TalentTrust | Milestone escrow on Stellar',
      description: rootMetadata.description,
    });
  });

  it('uses the configured public frontend URL instead of the API URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://preview.example.test');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test');
    const { rootMetadata } = await import('../metadata');

    expect(rootMetadata.metadataBase?.toString()).toBe('https://preview.example.test/');
    expect(rootMetadata.openGraph?.url).toBe('/');
  });

  it('uses the production URL when the override is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    const { rootMetadata } = await import('../metadata');

    expect(rootMetadata.metadataBase?.toString()).toBe('https://talenttrust-frontend.vercel.app/');
  });

  it('rejects a relative URL instead of generating an incorrect metadata base', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '/preview');

    await expect(import('../metadata')).rejects.toThrow();
  });
});
