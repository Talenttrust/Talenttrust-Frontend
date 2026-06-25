import { metadata } from '../layout';

describe('root metadata', () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  afterEach(() => {
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
      return;
    }

    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  it('exports the expected root metadata shape', () => {
    expect(metadata.title).toBe('TalentTrust - Safe Freelance Payments');
    expect(metadata.description).toBe(
      'Safe, secure payments that protect both freelancers and clients throughout your project.',
    );
    expect(metadata.metadataBase?.toString()).toBe('http://localhost:3000/');
  });

  it('includes open graph metadata with a non-empty preview image array', () => {
    expect(metadata.openGraph).toMatchObject({
      title: 'TalentTrust - Safe Freelance Payments',
      description:
        'Safe, secure payments that protect both freelancers and clients throughout your project.',
      type: 'website',
      siteName: 'TalentTrust',
      url: 'http://localhost:3000',
    });

    expect(metadata.openGraph?.images).toHaveLength(1);
    expect(metadata.openGraph?.images?.[0]).toMatchObject({
      url: '/og-preview.svg',
      width: 1200,
      height: 630,
      alt: 'TalentTrust social preview showing safe freelance payments',
    });
  });

  it('includes twitter metadata using the large preview card', () => {
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'TalentTrust - Safe Freelance Payments',
      description:
        'Safe, secure payments that protect both freelancers and clients throughout your project.',
    });

    expect(metadata.twitter?.images).toEqual(['/og-preview.svg']);
  });

  it('keeps manifest and social image paths relative so metadataBase can resolve them', () => {
    expect(metadata.manifest).toBe('/manifest.webmanifest');
    expect(metadata.icons?.icon?.every(icon => icon.url.startsWith('/'))).toBe(true);
    expect(metadata.openGraph?.images?.every(image => image.url.startsWith('/'))).toBe(true);
    expect(metadata.twitter?.images?.every(image => image.startsWith('/'))).toBe(true);
  });
});
