# Security Headers

This project sets HTTP response headers via the `headers()` function in
`next.config.js`.  The headers are applied to every route.

## Headers in use

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | See CSP section below | Defence-in-depth against XSS, data injection |
| `X-Frame-Options` | `DENY` | Prevents clickjacking (legacy; also covered by CSP `frame-ancestors`) |
| `X-Content-Type-Options` | `nosniff` | Stops MIME-type sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Sends only the origin (not full URL) on cross-origin nav |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Enforces HTTPS for 1 year (ignored by browsers on localhost per RFC 6797) |
| `X-Permitted-Cross-Domain-Policies` | `none` | Blocks Adobe Flash/PDF cross-domain requests (bonus hardening) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables sensitive browser features app-wide (bonus hardening) |

## Content-Security-Policy

### Current directives

```
default-src 'self'
script-src 'self' 'unsafe-eval'
style-src 'self' 'unsafe-inline'
img-src 'self' data:
font-src 'self'
connect-src 'self'
frame-src 'self'
object-src 'none'
base-uri 'self'
form-action 'self'
frame-ancestors 'none'
```

| Directive | Value | Notes |
|---|---|---|
| `default-src` | `'self'` | Baseline — only allow same-origin resources |
| `script-src` | `'self' 'unsafe-eval'` | `'unsafe-eval'` is **only needed in dev** for Next.js Fast Refresh. See below. |
| `style-src` | `'self' 'unsafe-inline'` | **Unavoidable** with current Next.js + Tailwind setup. See below. |
| `img-src` | `'self' data:` | Allows inline `data:` URIs (SVGs, etc.) |
| `font-src` | `'self'` | All fonts are self-hosted |
| `connect-src` | `'self'` | API calls only go to the same origin today |
| `frame-src` | `'self'` | No cross-origin iframes |
| `object-src` | `'none'` | Blocks `<object>`, `<embed>`, `<applet>` |
| `base-uri` | `'self'` | Stops `<base>` tag injection |
| `form-action` | `'self'` | Prevents form hijacking to external endpoints |
| `frame-ancestors` | `'none'` | Same protection as `X-Frame-Options: DENY` but CSP-native |

### Unavoidable `'unsafe-inline'` on styles

Next.js injects `<style>` tags at runtime for:

1. **Tailwind CSS** — The JIT compiler emits inline `<style>` blocks during
   development (in production, Tailwind is extracted to static CSS files, but
   Next.js may still inject small inline style blocks for component-level
   styles).
2. **CSS-in-JS / styled-jsx** — If any component uses Next.js's built-in
   styled-jsx, those styles are injected as inline `<style>` tags.
3. **Font optimization** — `next/font` may inject inline critical CSS.

Removing `'unsafe-inline'` from `style-src` will break the dev server
immediately (styles disappear) and may cause subtle breakage in production.

### Path to tighten `style-src`

1. **Short term** — Switch `style-src` to use a **nonce**:
   ```
   style-src 'self' 'nonce-{random}'
   ```
   This requires a custom `_document.tsx` that reads a per-request nonce from
   headers and threads it into every `<style>` tag.  Next.js 14 does not yet
   provide a built-in nonce mechanism for all injected styles — you would need
   to maintain a custom `renderToHTML` override or wait for stable nonce
   support in a future Next.js release.

2. **Medium term** — Adopt **strict-dynamic + hashes**:
   ```
   style-src 'self' 'sha256-abc123' 'sha256-def456' 'strict-dynamic'
   ```
   Generate hashes for every inline style block emitted by the production
   build.  This is brittle across builds (hashes change when CSS changes) but
   can be automated in CI with a script that scans the production HTML output
   and updates the CSP header.

3. **Long term** — When the project moves away from Tailwind's runtime
   injection (e.g., to a zero-runtime CSS solution or a fully extracted
   stylesheet), `'unsafe-inline'` can be dropped entirely.

### `'unsafe-eval'` on scripts

Next.js uses `eval()` for **Fast Refresh** in development mode.  This is
**not needed in production** (`next build && next start`).  To tighten:

1. In `next.config.js`, swap the `script-src` line to the production version:
   ```
   "script-src 'self'",
   ```
2. The dev server will break (Fast Refresh stops working), so you may want to
   keep both lines and toggle with an environment variable:
   ```js
   `script-src 'self'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
   ```

### Future: wallet integration

The wallet connect flow is currently mocked.  When a real provider (MetaMask,
WalletConnect v2) is integrated, extend the CSP:

```
connect-src 'self' https://*.infura.io wss://*.infura.io wss://relay.walletconnect.com
```

And allow the provider's injected script origin in `script-src` if needed.

## Verifying the headers locally

```bash
# 1. Build the production bundle
npm run build

# 2. Start the production server (defaults to http://localhost:3000)
npm start

# 3. In another terminal, check the headers
curl -I http://localhost:3000 2>&1 | grep -E 'content-security-policy|x-frame|x-content|referrer|strict-transport|permitted-cross|permissions-policy'
```

Or open DevTools → Network tab → click the document request → inspect the
Response Headers section.
