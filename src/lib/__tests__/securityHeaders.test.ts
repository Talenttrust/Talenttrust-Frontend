import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, securityHeaders } from '@/lib/securityHeaders';

describe('security headers', () => {
  it('derives connect-src from the configured API and RPC origins', () => {
    const policy = contentSecurityPolicy('production');
    expect(policy).toContain("connect-src 'self' https://talenttrust-backend.vercel.app https://soroban-testnet.stellar.org");
  });

  it('allows the hashed theme script without unsafe-inline', () => {
    const policy = contentSecurityPolicy('production');
    expect(policy).toMatch(/script-src 'self' 'sha256-[^']+'/);
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it('adds development-only unsafe-eval and production-only HSTS', () => {
    const development = securityHeaders('development');
    const production = securityHeaders('production');
    expect(development.find((header) => header.key === 'Content-Security-Policy')?.value).toContain("'unsafe-eval'");
    expect(development.some((header) => header.key === 'Strict-Transport-Security')).toBe(false);
    expect(production.find((header) => header.key === 'Strict-Transport-Security')?.value).toContain('max-age=31536000');
  });

  it('includes the required defense-in-depth directives', () => {
    const policy = contentSecurityPolicy('production');
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain('https://stellar.expert');
  });
});
