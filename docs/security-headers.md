# Security headers

TalentTrust sends the following headers for every route. The policy is built
in `src/lib/securityHeaders.ts` and wired into `next.config.js` through the
CommonJS-compatible `security-headers.cjs` adapter.

## Content Security Policy

`Content-Security-Policy` uses these directives:

- `default-src 'self'`
- `connect-src 'self'` plus the configured API and Soroban RPC origins
- `script-src 'self'` plus the SHA-256 hash of the inline theme bootstrap
- `style-src 'self' 'unsafe-inline'` for the application stylesheet strategy
- `img-src 'self' data: blob: https://stellar.expert`
- `font-src 'self'`
- `object-src 'none'`, `base-uri 'self'`, and `frame-ancestors 'none'`

Development adds `unsafe-eval` for the development toolchain. Production does
not. The inline theme script is allowed by its hash, not by `unsafe-inline`.

The API origin comes from `NEXT_PUBLIC_API_URL`, and the RPC origin comes from
`NEXT_PUBLIC_STELLAR_RPC_URL` (or the network-specific default). To add a new
browser origin, update the corresponding directive in
`src/lib/securityHeaders.ts` and its CommonJS adapter, then add a regression
assertion to `src/lib/__tests__/securityHeaders.test.ts`.

## Other headers

- `Strict-Transport-Security: max-age=31536000; includeSubDomains` in production only
- `Cross-Origin-Opener-Policy: same-origin`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
