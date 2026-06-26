// src/app/__tests__/csp.test.ts
// import { headers as getHeaders } from "../../../../next.config";

describe("Content Security Policy", () => {
  const originalEnv = process.env.NODE_ENV;

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  test("development includes unsafe-eval and unsafe-inline", async () => {
    process.env.NODE_ENV = "development";
    // Re-import to pick up new env
    const result = await (
      await import("../../../../next.config")
    ).default.headers();
    const cspHeader = result[0].headers.find(
      (h: any) => h.key === "Content-Security-Policy",
    );
    expect(cspHeader).toBeDefined();
    const value: string = cspHeader.value;
    expect(value).toContain("script-src 'self' 'unsafe-eval'");
    expect(value).toContain("style-src 'self' 'unsafe-inline'");
  });

  test("production omits unsafe-eval and unsafe-inline", async () => {
    process.env.NODE_ENV = "production";
    const result = await (
      await import("../../../../next.config")
    ).default.headers();
    const cspHeader = result[0].headers.find(
      (h: any) => h.key === "Content-Security-Policy",
    );
    expect(cspHeader).toBeDefined();
    const value: string = cspHeader.value;
    expect(value).toContain("script-src 'self'");
    expect(value).not.toContain("unsafe-eval");
    expect(value).toContain("style-src 'self'");
    expect(value).not.toContain("unsafe-inline");
  });
});
