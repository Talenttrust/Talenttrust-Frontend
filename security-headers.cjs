const crypto = require('node:crypto');

const themeScript = `(function(){try{var t=localStorage.getItem('tt.theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
const themeScriptHash = `'sha256-${crypto.createHash('sha256').update(themeScript).digest('base64')}'`;

function origin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

function configuredRpcUrl() {
  if (process.env.NEXT_PUBLIC_STELLAR_RPC_URL) return process.env.NEXT_PUBLIC_STELLAR_RPC_URL;
  return process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet'
    ? 'https://soroban.stellar.org'
    : 'https://soroban-testnet.stellar.org';
}

function contentSecurityPolicy(nodeEnv = process.env.NODE_ENV || 'production') {
  const scriptSources = ["'self'", themeScriptHash];
  if (nodeEnv === 'development') scriptSources.push("'unsafe-eval'");
  return [
    "default-src 'self'",
    `connect-src 'self' ${origin(process.env.NEXT_PUBLIC_API_URL || 'https://talenttrust-backend.vercel.app')} ${origin(configuredRpcUrl())}`,
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://stellar.expert",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function securityHeaders(nodeEnv = process.env.NODE_ENV || 'production') {
  const headers = [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(nodeEnv) },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ];
  if (nodeEnv === 'production') {
    headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
  }
  return headers;
}

module.exports = { securityHeaders, contentSecurityPolicy, themeScriptHash };
