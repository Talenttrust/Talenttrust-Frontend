/** @type {import('next').NextConfig} */

/*
  Content-Security-Policy
  ------------------------------------------------------------------
  Scoped to what the app actually loads today (no external CDNs, no
  analytics, wallet is mocked).  See docs/security-headers.md for the
  rationale behind each directive, the unavoidable `unsafe-inline` on
  styles, and a concrete path to tighten the policy later.

  Quick reference for future wallet integration:
    connect-src additions: https://*.infura.io wss://*.infura.io (MetaMask RPC)
                           wss://relay.walletconnect.com          (WalletConnect relay)
    script-src may also need the provider's injection origin.
*/
const cspHeader = [
  "default-src 'self'",

  // 'unsafe-eval' is required by Next.js Fast Refresh in dev mode.
  // For production deploys (next build && next start) it can be
  // dropped — uncomment the production-only line below and delete
  // the dev line when you're ready.
  "script-src 'self' 'unsafe-eval'",
  // "script-src 'self'",   // ← production-safe version

  // style-src 'unsafe-inline': unavoidable with Tailwind + Next.js
  // inline-style injection.  Documented in docs/security-headers.md
  // along with a nonce / strict-dynamic tightening path.
  "style-src 'self' 'unsafe-inline'",

  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        // Apply security headers to every route
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: cspHeader },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },

          // Bonus hardening headers (not part of the original spec but
          // recommended by OWASP and the security community):
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
