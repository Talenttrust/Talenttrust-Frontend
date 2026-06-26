// src/app/__tests__/csp.test.ts


describe('Content Security Policy', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    (process.env as any).NODE_ENV = originalEnv;
  });

  test('development includes unsafe-eval and unsafe-inline', async () => {
    (process.env as any).NODE_ENV = 'development';
    // Re-require after resetModules so the module re-evaluates with the new env
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nextConfig = require('../../../next.config');
    const result = await nextConfig.headers();
    const cspHeader = result[0].headers.find((h: any) => h.key === 'Content-Security-Policy');
    expect(cspHeader).toBeDefined();
    const value: string = cspHeader.value;
    expect(value).toContain("script-src 'self' 'unsafe-eval'");
    expect(value).toContain("style-src 'self' 'unsafe-inline'");
  });

  test('production omits unsafe-eval and unsafe-inline', async () => {
    (process.env as any).NODE_ENV = 'production';
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nextConfig = require('../../../next.config');
    const result = await nextConfig.headers();
    const cspHeader = result[0].headers.find((h: any) => h.key === 'Content-Security-Policy');
    expect(cspHeader).toBeDefined();
    const value: string = cspHeader.value;
    expect(value).toContain("script-src 'self'");
    expect(value).not.toContain("unsafe-eval");
    expect(value).toContain("style-src 'self'");
    expect(value).not.toContain("unsafe-inline");
  });
});
