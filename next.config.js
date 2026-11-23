const { securityHeaders } = require('./security-headers.cjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          ...securityHeaders(process.env.NODE_ENV),
        ],
      },
      {
        // The service worker file must always be fetched fresh so users
        // receive updates immediately rather than serving a stale SW from
        // the HTTP cache.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
