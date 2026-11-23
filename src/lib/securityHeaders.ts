import { site } from './site';

const themeScript = `(function(){try{var t=localStorage.getItem('tt.theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export const THEME_SCRIPT_HASH = `'sha256-${Buffer.from(themeScript).toString('base64')}'`;

function origin(value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

export function contentSecurityPolicy(nodeEnv: string = process.env.NODE_ENV ?? 'production'): string {
  const scriptSources = ["'self'", THEME_SCRIPT_HASH];
  if (nodeEnv === 'development') scriptSources.push("'unsafe-eval'");

  return [
    "default-src 'self'",
    `connect-src 'self' ${origin(site.apiUrl)} ${origin(site.rpcUrl)}`,
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://stellar.expert",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function securityHeaders(nodeEnv: string = process.env.NODE_ENV ?? 'production') {
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

