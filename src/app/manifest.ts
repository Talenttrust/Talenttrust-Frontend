import type { MetadataRoute } from 'next';

/**
 * Web app manifest for TalentTrust.
 *
 * Provides PWA installability and consistent branding when the app is
 * added to a device home screen.
 *
 * Icon assets (see public/):
 *   - icon.svg         – SVG vector icon (preferred, scales to any size)
 *   - icon-192x192.png – 192×192 PNG placeholder (designer must replace
 *                         with a branded raster)
 *   - icon-512x512.png – 512×512 PNG placeholder (designer must replace
 *                         with a branded raster)
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TalentTrust - Safe Freelance Payments',
    short_name: 'TalentTrust',
    description:
      'Safe, secure payments that protect both freelancers and clients throughout your project.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
      {
        src: '/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
