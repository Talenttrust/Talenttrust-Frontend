// src/app/__tests__/csp.test.ts


describe('Content Security Policy', () => {
  const originalEnv = process.env.NODE_ENV;

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  const loadHeaders = async () => {
    jest.resetModules();
    return require('../../../next.config').headers();
  };

  test('development includes unsafe-eval and unsafe-inline', async () => {
    process.env.NODE_ENV = 'development';
    const result = await loadHeaders();
    const cspHeader = result[0].headers.find((h: any) => h.key === 'Content-Security-Policy');
    expect(cspHeader).toBeDefined();
    const value: string = cspHeader.value;
    expect(value).toContain("script-src 'self' 'unsafe-eval'");
    expect(value).toContain("style-src 'self' 'unsafe-inline'");
  });

  test('production omits unsafe-eval and unsafe-inline', async () => {
    process.env.NODE_ENV = 'production';
    const result = await loadHeaders();
    const cspHeader = result[0].headers.find((h: any) => h.key === 'Content-Security-Policy');
    expect(cspHeader).toBeDefined();
    const value: string = cspHeader.value;
    expect(value).toContain("script-src 'self'");
    expect(value).not.toContain("unsafe-eval");
    expect(value).toContain("style-src 'self'");
    expect(value).not.toContain("unsafe-inline");
  });
});
