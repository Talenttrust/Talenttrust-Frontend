import type { MetadataRoute } from "next";
import sitemap, {
  __resetSitemapReportsForTests,
  buildSitemap,
  createSitemapReportMemo,
  resolveSitemapBaseUrl,
  DEFAULT_SITE_URL,
  SITEMAP_MAX_REPORTED_CONDITIONS,
  SITEMAP_MAX_URLS,
  SITEMAP_ROUTES,
  SITEMAP_INVALID_TIMESTAMP_CODE,
  SITEMAP_ROUTE_DROPPED_CODE,
  SITEMAP_SITE_URL_REJECTED_CODE,
  SITEMAP_SITE_URL_SANITIZED_CODE,
  SITEMAP_TRUNCATED_CODE,
} from "../sitemap";
import { setErrorReporter } from "@/lib/errorReporter";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date("2026-02-03T04:05:06.000Z");

/** Report spy shaped like the central `ErrorReporter`. */
const createReportSpy = () => {
  const fn = jest.fn();
  return {
    fn,
    callsFor: (code: string) =>
      fn.mock.calls.filter(
        (call) => (call[3] as { code?: string })?.code === code,
      ),
    reasons: (code: string) =>
      fn.mock.calls
        .filter((call) => (call[3] as { code?: string })?.code === code)
        .map((call) => (call[3] as { reason?: string }).reason),
  };
};

/** Asserts the S1 output invariant over a whole document. */
const expectOnlyAbsoluteHttpUrls = (result: MetadataRoute.Sitemap) => {
  expect(result.length).toBeGreaterThan(0);
  for (const entry of result) {
    const parsed = new URL(entry.url);
    expect(["http:", "https:"]).toContain(parsed.protocol);
    expect(parsed.hostname).not.toBe("");
    expect(parsed.username).toBe("");
    expect(parsed.password).toBe("");
  }
};

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.SOURCE_DATE_EPOCH;
  jest.restoreAllMocks();
});

afterEach(() => {
  process.env = originalEnv;
  setErrorReporter(null);
});

// ---------------------------------------------------------------------------
// Regression: the original contract of sitemap() must not change
// ---------------------------------------------------------------------------

describe("sitemap.ts", () => {
  /** Warnings captured through the central reporter for the current test. */
  let warnings: string[] = [];

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.SOURCE_DATE_EPOCH;
    warnings = [];
    setErrorReporter((error, _context, level) => {
      if (level === "warn") warnings.push(String(error));
    });
    // Freeze time for consistent lastModified testing
    jest.useFakeTimers().setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    process.env = originalEnv;
    setErrorReporter(null);
    jest.useRealTimers();
  });

  it("should generate sitemap with all public static routes", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    const result = sitemap();

    expect(result).toHaveLength(4);
    expect(result.map((entry) => entry.url)).toEqual([
      "http://localhost:3000",
      "http://localhost:3000/contracts",
      "http://localhost:3000/milestones",
      "http://localhost:3000/reputation",
    ]);

    result.forEach((entry) => {
      expect(entry.lastModified).toEqual(new Date("2024-01-01T00:00:00.000Z"));
    });
    // An unset variable is the documented local-development default, not a fault.
    expect(warnings).toEqual([]);
  });

  it("should use custom NEXT_PUBLIC_SITE_URL when provided", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://talenttrust.app";
    const result = sitemap();

    expect(result[0].url).toBe("https://talenttrust.app");
    expect(result[1].url).toBe("https://talenttrust.app/contracts");
    expect(warnings).toEqual([]);
  });

  it("keeps a zero-argument default export and a frozen route list (interface stability)", () => {
    expect(typeof sitemap).toBe("function");
    expect(sitemap.length).toBe(0);
    expect(Object.isFrozen(SITEMAP_ROUTES)).toBe(true);
    expect(SITEMAP_ROUTES[0]).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// Base URL resolution
// ---------------------------------------------------------------------------

describe("sitemap base URL resolution", () => {
  it("accepts an absolute https origin", () => {
    expect(resolveSitemapBaseUrl("https://talenttrust.app")).toEqual({
      base: "https://talenttrust.app",
      usedFallback: false,
      sanitised: [],
    });
  });

  it("accepts an origin with a port and a trailing slash", () => {
    expect(resolveSitemapBaseUrl("http://localhost:3000/").base).toBe(
      "http://localhost:3000",
    );
  });

  it("keeps a configured base path in front of every route", () => {
    const { fn: report } = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app/docs",
      report,
    });

    expect(result.map((entry) => entry.url)).toEqual([
      "https://talenttrust.app/docs",
      "https://talenttrust.app/docs/contracts",
      "https://talenttrust.app/docs/milestones",
      "https://talenttrust.app/docs/reputation",
    ]);
    expect(report).not.toHaveBeenCalled();
  });

  it("never emits a double slash for a trailing-slash base", () => {
    const { fn: report } = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app/",
      report,
    });

    expect(result.map((entry) => entry.url)).not.toContain(
      "https://talenttrust.app//contracts",
    );
  });

  it("normalises a single-slash or scheme-only https value instead of rejecting it", () => {
    // `https:/host` and `https:host` are normalised by the URL parser to the
    // same origin, so a sloppy-but-recoverable value keeps working.
    for (const value of ["https:/talenttrust.app", "https:talenttrust.app"]) {
      const resolved = resolveSitemapBaseUrl(value);
      expect(resolved.base).toBe("https://talenttrust.app");
      expect(resolved.usedFallback).toBe(false);
    }
  });

  it("treats an unset or blank value as unconfigured, without reporting a fault", () => {
    const { fn: report, callsFor } = createReportSpy();

    for (const value of [undefined, "", "   "]) {
      const resolved = resolveSitemapBaseUrl(value);
      expect(resolved.base).toBe(DEFAULT_SITE_URL);
      expect(resolved.usedFallback).toBe(true);
      expect(resolved.rejection).toBeUndefined();
    }

    buildSitemap({ siteUrl: undefined, report });
    expect(callsFor(SITEMAP_SITE_URL_REJECTED_CODE)).toHaveLength(0);
  });

  it.each([
    ["not a url at all", "unparsable"],
    ["https://", "unparsable"],
    ["//talenttrust.app", "unparsable"],
    ["javascript:alert(1)", "unsupported-protocol"],
    ["data:text/html,<script>", "unsupported-protocol"],
    ["file:///etc/passwd", "unsupported-protocol"],
    ["ftp://talenttrust.app", "unsupported-protocol"],
    ["https://talenttrust.app/has space", "invalid-characters"],
    ["https://talenttrust.app/tab\there", "invalid-characters"],
    ["https://talenttrust.app/new\nline", "invalid-characters"],
    // Boundary of the control-character scan: DEL (0x7f) and a C1 control
    // (U+0085 NEL), which the URL parser would otherwise silently percent-encode.
    ["https://talenttrust.app/del\u007fhere", "invalid-characters"],
    ["https://talenttrust.app/nel\u0085here", "invalid-characters"],
  ])(
    "rejects %s and falls back to the default origin (%s)",
    (value, rejection) => {
      const resolved = resolveSitemapBaseUrl(value);

      expect(resolved.base).toBe(DEFAULT_SITE_URL);
      expect(resolved.usedFallback).toBe(true);
      expect(resolved.rejection).toBe(rejection);
    },
  );

  it("percent-encodes rather than rejects a path containing markup characters", () => {
    // S1 only requires an absolute http(s) URL; `%3C` is a well-formed URL that
    // simply 404s, which is preferable to discarding the whole site origin.
    const resolved = resolveSitemapBaseUrl("https://talenttrust.app/<script>");

    expect(resolved.base).toBe("https://talenttrust.app/%3Cscript%3E");
    expect(resolved.usedFallback).toBe(false);

    const result = buildSitemap({
      siteUrl: "https://talenttrust.app/<script>",
      report: jest.fn(),
    });
    expectOnlyAbsoluteHttpUrls(result);
  });

  it("reports a rejected base URL with the reason and never the offending value", () => {
    const report = createReportSpy();
    buildSitemap({
      siteUrl: "https://user:sup3rs3cret@internal-host.example",
      report: report.fn,
    });

    // Credentials are stripped, so this one is *not* a rejection – see below.
    expect(report.callsFor(SITEMAP_SITE_URL_REJECTED_CODE)).toHaveLength(0);

    const rejected = createReportSpy();
    buildSitemap({
      siteUrl: "javascript:steal(document.cookie)",
      report: rejected.fn,
    });

    const [call] = rejected.callsFor(SITEMAP_SITE_URL_REJECTED_CODE);
    expect(call[2]).toBe("warn");
    expect(call[3]).toEqual({
      code: SITEMAP_SITE_URL_REJECTED_CODE,
      reason: "unsupported-protocol",
      protocol: "javascript",
      fallback: DEFAULT_SITE_URL,
    });
    expect(JSON.stringify(call)).not.toContain("steal");
  });

  it("strips credentials, query and hash instead of emitting them", () => {
    // The safety property is structural, not incidental: `URL.origin` cannot
    // represent userinfo, a query or a fragment, so the composed base cannot
    // carry them regardless of how the value was parsed.
    expect(new URL("https://user:pw@talenttrust.app/?a=1#b").origin).toBe(
      "https://talenttrust.app",
    );

    const report = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://user:sup3rs3cret@talenttrust.app/?token=abc#frag",
      report: report.fn,
    });

    expectOnlyAbsoluteHttpUrls(result);
    for (const entry of result) {
      expect(entry.url).not.toContain("sup3rs3cret");
      expect(entry.url).not.toContain("token");
      expect(entry.url).not.toContain("frag");
    }
    expect(result[0].url).toBe("https://talenttrust.app");
    expect(report.callsFor(SITEMAP_SITE_URL_SANITIZED_CODE)).toHaveLength(1);
    expect(
      (
        report.callsFor(SITEMAP_SITE_URL_SANITIZED_CODE)[0][3] as {
          sanitised: string[];
        }
      ).sanitised,
    ).toEqual(["credentials", "query", "hash"]);
  });

  it("still produces a usable document when the base URL is rejected (S2, S3)", () => {
    const { fn: report } = createReportSpy();
    const result = buildSitemap({ siteUrl: "ftp://talenttrust.app", report });

    expect(result).toHaveLength(SITEMAP_ROUTES.length);
    expectOnlyAbsoluteHttpUrls(result);
    expect(result[1].url).toBe("http://localhost:3000/contracts");
  });
});

// ---------------------------------------------------------------------------
// Entry invariants
// ---------------------------------------------------------------------------

describe("sitemap entry invariants", () => {
  it("collapses duplicates and preserves declaration order (S4)", () => {
    const { fn: report } = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      routes: [
        "/",
        "/contracts",
        "/contracts",
        "contracts/",
        "//",
        "/contracts",
      ],
      report,
    });

    expect(result.map((entry) => entry.url)).toEqual([
      "https://talenttrust.app",
      "https://talenttrust.app/contracts",
    ]);
  });

  it("always emits at least the base entry, even for an empty route list (S3)", () => {
    const { fn: report } = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      routes: [],
      report,
    });

    expect(result).toEqual([
      { url: "https://talenttrust.app", lastModified: expect.any(Date) },
    ]);
  });

  it("drops unusable routes and keeps the valid ones (partial completion)", () => {
    const report = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      routes: [
        "/",
        "/contracts",
        "/con tracts",
        "/../etc/passwd",
        "/nested/../escape",
        "/a//b",
        "/reputation?admin=1",
        "/milestones#top",
        "/[id]",
        "/wallet",
      ],
      report: report.fn,
    });

    expect(result.map((entry) => entry.url)).toEqual([
      "https://talenttrust.app",
      "https://talenttrust.app/contracts",
      "https://talenttrust.app/wallet",
    ]);
    expect(report.reasons(SITEMAP_ROUTE_DROPPED_CODE)).toEqual(
      new Array(7).fill("invalid-route"),
    );
    // The dropped route strings are not echoed into the report (S6).
    expect(JSON.stringify(report.fn.mock.calls)).not.toContain("passwd");
    expect(JSON.stringify(report.fn.mock.calls)).not.toContain("admin=1");
  });

  it("normalises leading slashes and whitespace around a route", () => {
    const { fn: report } = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      routes: ["  /contracts  "],
      report,
    });

    expect(result.map((entry) => entry.url)).toEqual([
      "https://talenttrust.app/contracts",
    ]);
  });

  it('treats a sub-1 or non-finite cap as the protocol limit, never as "unbounded" (S4)', () => {
    const { fn: report } = createReportSpy();
    const routes = ["/", "/contracts", "/milestones", "/reputation", "/wallet"];

    for (const maxUrls of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = buildSitemap({
        siteUrl: "https://talenttrust.app",
        routes,
        maxUrls,
        report,
      });
      expect(result).toHaveLength(routes.length);
    }
    expect(report).not.toHaveBeenCalled();
  });

  it("caps the document at the configured limit and reports truncation (S4)", () => {
    const report = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      routes: ["/", "/contracts", "/milestones", "/reputation", "/wallet"],
      maxUrls: 3,
      report: report.fn,
    });

    expect(result.map((entry) => entry.url)).toEqual([
      "https://talenttrust.app",
      "https://talenttrust.app/contracts",
      "https://talenttrust.app/milestones",
    ]);
    expect(report.callsFor(SITEMAP_TRUNCATED_CODE)).toHaveLength(1);
    expect(report.callsFor(SITEMAP_TRUNCATED_CODE)[0][3]).toEqual({
      code: SITEMAP_TRUNCATED_CODE,
      limit: 3,
      dropped: 2,
    });
  });

  it("documents the protocol limit and does not truncate a small document", () => {
    // The 50,000-entry build is not exercised inline: `new URL` costs ~70µs per
    // call under jsdom, which would add ~8s to the suite for a case the
    // injectable `maxUrls` seam already covers. The default is asserted here,
    // and the truncation path is covered by the test above.
    expect(SITEMAP_MAX_URLS).toBe(50_000);

    const report = createReportSpy();
    const routes = ["/", "/contracts", "/milestones", "/reputation"];

    const clock = () => FIXED_NOW;
    const withDefault = buildSitemap({
      siteUrl: "https://talenttrust.app",
      routes,
      now: clock,
      report: report.fn,
    });
    const withExplicitLimit = buildSitemap({
      siteUrl: "https://talenttrust.app",
      routes,
      maxUrls: SITEMAP_MAX_URLS,
      now: clock,
      report: jest.fn(),
    });

    expect(withDefault).toEqual(withExplicitLimit);
    expect(report.callsFor(SITEMAP_TRUNCATED_CODE)).toHaveLength(0);
  });

  it("isolates a throwing resolver to the affected route (S2)", () => {
    const report = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      report: report.fn,
      resolveUrl: (path, base) => {
        if (path === "milestones") throw new Error("URL parser unavailable");
        return new URL(path, base);
      },
    });

    expect(result.map((entry) => entry.url)).toEqual([
      "https://talenttrust.app",
      "https://talenttrust.app/contracts",
      "https://talenttrust.app/reputation",
    ]);
    expect(report.reasons(SITEMAP_ROUTE_DROPPED_CODE)).toEqual([
      "unresolvable-route",
    ]);
    expectOnlyAbsoluteHttpUrls(result);
  });

  it("rejects a resolver that returns a non-http URL (S1 is enforced, not assumed)", () => {
    const report = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      report: report.fn,
      resolveUrl: (path, base) =>
        path === "contracts"
          ? new URL("javascript:alert(1)")
          : new URL(path, base),
    });

    expect(result.map((entry) => entry.url)).toEqual([
      "https://talenttrust.app",
      "https://talenttrust.app/milestones",
      "https://talenttrust.app/reputation",
    ]);
    expect(report.reasons(SITEMAP_ROUTE_DROPPED_CODE)).toEqual([
      "not-absolute-http",
    ]);
    expect(JSON.stringify(report.fn.mock.calls)).not.toContain("alert");
  });

  it("rejects a resolver that leaks credentials into the output", () => {
    const report = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      routes: ["/", "/contracts"],
      report: report.fn,
      resolveUrl: (path, base) =>
        new URL(`https://leak:token@${new URL(base).host}/${path}`),
    });

    // Home is emitted from the configured base, so it survives; the leaky
    // resolver output is rejected outright.
    expect(result).toEqual([
      { url: "https://talenttrust.app", lastModified: expect.any(Date) },
    ]);
    expect(report.reasons(SITEMAP_ROUTE_DROPPED_CODE)).toEqual([
      "not-absolute-http",
    ]);
  });

  it("never throws for any combination of hostile inputs", () => {
    const hostile = [
      undefined,
      "",
      "://",
      "javascript:alert(1)",
      "https://",
      "https://user:pw@host.example/base?a=1#b",
      "https://host.example/%0A%0D",
    ];

    for (const siteUrl of hostile) {
      expect(() => buildSitemap({ siteUrl, report: jest.fn() })).not.toThrow();
    }

    expect(() =>
      buildSitemap({
        siteUrl: "https://host.example",
        routes: ["", "///", "../../etc", "/a b", "/x?y"],
        report: jest.fn(),
        resolveUrl: () => {
          throw new Error("resolver down");
        },
      }),
    ).not.toThrow();

    // No-argument call: every seam falls back to its default.
    expect(() => buildSitemap()).not.toThrow();
    expect(buildSitemap()[0].url).toBe(DEFAULT_SITE_URL);
  });

  it("drops a non-string route instead of throwing on it (defensive against untyped callers)", () => {
    const report = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      routes: [
        "/",
        null,
        42,
        { path: "/x" },
        "/contracts",
      ] as unknown as string[],
      report: report.fn,
    });

    // A non-string normalises to the home route and is then collapsed as a
    // duplicate of '/', so nothing hostile and nothing extra is emitted.
    expect(result.map((entry) => entry.url)).toEqual([
      "https://talenttrust.app",
      "https://talenttrust.app/contracts",
    ]);
    expectOnlyAbsoluteHttpUrls(result);
  });

  it("rejects a resolver whose output is not a real URL object (S1 is enforced, not assumed)", () => {
    const report = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      routes: ["/", "/contracts"],
      report: report.fn,
      resolveUrl: () =>
        ({ toString: () => "not a url at all" }) as unknown as URL,
    });

    expect(result.map((entry) => entry.url)).toEqual([
      "https://talenttrust.app",
    ]);
    expect(report.reasons(SITEMAP_ROUTE_DROPPED_CODE)).toEqual([
      "not-absolute-http",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

describe("sitemap timestamps", () => {
  it("shares one timestamp across the whole document (S5)", () => {
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      now: () => FIXED_NOW,
    });

    for (const entry of result) {
      expect(entry.lastModified).toEqual(FIXED_NOW);
    }
  });

  it("honours SOURCE_DATE_EPOCH for reproducible builds", () => {
    process.env.SOURCE_DATE_EPOCH = "1700000000";
    const { fn: report } = createReportSpy();

    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      now: () => FIXED_NOW,
      report,
    });

    expect(result[0].lastModified).toEqual(
      new Date("2023-11-14T22:13:20.000Z"),
    );
    expect(report).not.toHaveBeenCalled();
  });

  it.each(["abc", "-1", "1e30", "Infinity", "NaN"])(
    "falls back to the current time and reports an unusable SOURCE_DATE_EPOCH (%s)",
    (value) => {
      process.env.SOURCE_DATE_EPOCH = value;
      const report = createReportSpy();

      const result = buildSitemap({
        siteUrl: "https://talenttrust.app",
        now: () => FIXED_NOW,
        report: report.fn,
      });

      expect(result[0].lastModified).toEqual(FIXED_NOW);
      expect(report.callsFor(SITEMAP_INVALID_TIMESTAMP_CODE)).toHaveLength(1);
      expect(
        (
          report.callsFor(SITEMAP_INVALID_TIMESTAMP_CODE)[0][3] as {
            source: string;
          }
        ).source,
      ).toBe("SOURCE_DATE_EPOCH");
    },
  );

  it("recovers from a clock that yields an Invalid Date", () => {
    const report = createReportSpy();

    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      now: () => new Date("not-a-date"),
      report: report.fn,
    });

    expect(result[0].lastModified).toBeInstanceOf(Date);
    expect(Number.isFinite((result[0].lastModified as Date).getTime())).toBe(
      true,
    );
    expect(
      (
        report.callsFor(SITEMAP_INVALID_TIMESTAMP_CODE)[0][3] as {
          source: string;
        }
      ).source,
    ).toBe("clock");
  });

  it("is byte-stable for identical inputs (deterministic)", () => {
    const options = {
      siteUrl: "https://talenttrust.app",
      now: () => FIXED_NOW,
    };
    const first = buildSitemap({ ...options, report: jest.fn() });
    const second = buildSitemap({ ...options, report: jest.fn() });

    expect(second).toEqual(first);
  });
});

// ---------------------------------------------------------------------------
// Report hygiene at the Next.js entry point
// ---------------------------------------------------------------------------

describe("sitemap() reporting", () => {
  /**
   * The dedupe memo is module state, so each case needs its own module
   * instance. `jest.doMock` is used (rather than `setErrorReporter`) because an
   * isolated module registry also isolates the real `errorReporter` instance
   * the statically imported helper would otherwise patch.
   */
  const loadFresh = (
    env: Record<string, string | undefined>,
    onReport: (...args: unknown[]) => void,
  ) => {
    process.env = { ...originalEnv };
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }

    let freshModule: typeof import("../sitemap") | undefined;
    jest.isolateModules(() => {
      jest.doMock("@/lib/errorReporter", () => ({
        reportError: onReport,
        setErrorReporter: jest.fn(),
      }));
      freshModule = require("../sitemap");
    });
    return freshModule;
  };

  afterEach(() => {
    jest.dontMock("@/lib/errorReporter");
  });

  it("stays silent when the site URL is valid", () => {
    const reporter = jest.fn();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const fresh = loadFresh(
      { NEXT_PUBLIC_SITE_URL: "https://talenttrust.app" },
      reporter,
    );

    expect(fresh.default()).toHaveLength(4);
    expect(reporter).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("reports a misconfigured site URL once per process, not once per request (S7)", () => {
    const reporter = jest.fn();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const fresh = loadFresh(
      { NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" },
      reporter,
    );

    fresh.default();
    fresh.default();
    fresh.default();

    const rejections = reporter.mock.calls.filter(
      (call) =>
        (call[3] as { code?: string })?.code === SITEMAP_SITE_URL_REJECTED_CODE,
    );
    expect(rejections).toHaveLength(1);
    // Production visibility: the default reporter is a no-op under
    // NODE_ENV=production, so the deployment misconfiguration is also logged.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("unsupported-protocol");
    expect(warn.mock.calls[0][0]).not.toContain("alert");
  });

  it("distinguishes distinct conditions so neither is swallowed", () => {
    const reporter = jest.fn();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const fresh = loadFresh(
      { NEXT_PUBLIC_SITE_URL: "https://talenttrust.app" },
      reporter,
    );

    // First condition, then a different one inside the same process.
    process.env.NEXT_PUBLIC_SITE_URL = "https://talenttrust.app/has space";
    fresh.default();
    process.env.NEXT_PUBLIC_SITE_URL = "ftp://talenttrust.app";
    fresh.default();

    const reasons = reporter.mock.calls
      .filter(
        (call) =>
          (call[3] as { code?: string })?.code ===
          SITEMAP_SITE_URL_REJECTED_CODE,
      )
      .map((call) => (call[3] as { reason: string }).reason);
    expect(reasons).toEqual(["invalid-characters", "unsupported-protocol"]);
  });

  it("always returns a usable document even when every condition is bad", () => {
    const reporter = jest.fn();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const fresh = loadFresh(
      {
        NEXT_PUBLIC_SITE_URL: "ftp://talenttrust.app",
        SOURCE_DATE_EPOCH: "not-a-number",
      },
      reporter,
    );

    const result = fresh.default();

    expectOnlyAbsoluteHttpUrls(result);
    expect(result[0].url).toBe(DEFAULT_SITE_URL);
    expect(result).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Concurrent and repeated execution (S2, S5, S7, S8, S9)
// ---------------------------------------------------------------------------

/**
 * These suites drive the real zero-argument entry point wherever possible, so
 * the behaviour under test is exactly what Next.js invokes per request. The
 * dedupe memo is reset through the test hook rather than by isolating the
 * module registry, which keeps every call on the same module instance — the
 * situation a long-lived server is actually in.
 */
describe("sitemap() concurrent and repeated execution", () => {
  const VALID_SITE = "https://talenttrust.app";

  /** A whole document reduced to comparable primitives. */
  const snapshot = (doc: MetadataRoute.Sitemap) =>
    doc.map(
      (entry) => `${entry.url}@${(entry.lastModified as Date).getTime()}`,
    );

  /** Schedules `fn` on a later microtask so calls interleave like concurrent requests. */
  const defer = <T>(fn: () => T): Promise<T> => Promise.resolve().then(fn);

  beforeEach(() => {
    __resetSitemapReportsForTests();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("racing requests", () => {
    it("produces identical, independently owned documents for 50 interleaved calls", async () => {
      process.env.NEXT_PUBLIC_SITE_URL = VALID_SITE;
      process.env.SOURCE_DATE_EPOCH = "1700000000";

      const docs = await Promise.all(
        Array.from({ length: 50 }, () => defer(() => sitemap())),
      );

      const expected = snapshot(docs[0]);
      expect(expected).toEqual([
        "https://talenttrust.app@1700000000000",
        "https://talenttrust.app/contracts@1700000000000",
        "https://talenttrust.app/milestones@1700000000000",
        "https://talenttrust.app/reputation@1700000000000",
      ]);
      for (const doc of docs) {
        expect(snapshot(doc)).toEqual(expected);
      }

      // S8: no array, entry object or Date instance is shared between documents.
      const arrays = new Set(docs);
      const entries = new Set(docs.flat());
      const dates = new Set(docs.flat().map((entry) => entry.lastModified));
      expect(arrays.size).toBe(50);
      expect(entries.size).toBe(50 * 4);
      expect(dates.size).toBe(50 * 4);
    });

    it("reports a misconfiguration once across a burst of concurrent requests, never once per request (S7)", async () => {
      const reporter = jest.fn();
      setErrorReporter(reporter);
      process.env.NEXT_PUBLIC_SITE_URL = "javascript:alert(1)";

      const docs = await Promise.all(
        Array.from({ length: 25 }, () => defer(() => sitemap())),
      );

      for (const doc of docs) {
        expect(doc.map((entry) => entry.url)).toEqual([
          "http://localhost:3000",
          "http://localhost:3000/contracts",
          "http://localhost:3000/milestones",
          "http://localhost:3000/reputation",
        ]);
      }
      const rejections = reporter.mock.calls.filter(
        (call) =>
          (call[3] as { code?: string })?.code ===
          SITEMAP_SITE_URL_REJECTED_CODE,
      );
      expect(rejections).toHaveLength(1);
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(reporter.mock.calls)).not.toContain("alert");
    });

    it("never serves a stale or mixed document when the environment changes between racing calls (S9)", async () => {
      const sites = [
        "https://one.app",
        "https://two.app",
        "ftp://broken.app",
        "https://one.app",
      ];

      const results = await Promise.all(
        sites.map((site, index) =>
          defer(() => {
            // Each "request" observes a different environment at the moment it runs.
            process.env.NEXT_PUBLIC_SITE_URL = site;
            process.env.SOURCE_DATE_EPOCH = String(1_700_000_000 + index);
            return sitemap();
          }),
        ),
      );

      expect(results.map((doc) => doc[0].url)).toEqual([
        "https://one.app",
        "https://two.app",
        DEFAULT_SITE_URL,
        "https://one.app",
      ]);
      // Every document is internally consistent: a single origin and a single
      // timestamp, taken from the environment at the time of *its* call.
      results.forEach((doc, index) => {
        const origins = new Set(doc.map((entry) => new URL(entry.url).origin));
        const stamps = new Set(
          doc.map((entry) => (entry.lastModified as Date).getTime()),
        );
        expect(origins.size).toBe(1);
        expect(stamps).toEqual(new Set([(1_700_000_000 + index) * 1000]));
      });
    });
  });

  describe("isolation of returned documents (S8)", () => {
    it("does not let a consumer mutating one result influence the next call", () => {
      process.env.NEXT_PUBLIC_SITE_URL = VALID_SITE;
      process.env.SOURCE_DATE_EPOCH = "1700000000";

      const first = sitemap();
      const before = snapshot(first);

      // Hostile or careless consumer: rewrite, mutate and extend the document.
      first[0].url = "javascript:alert(1)";
      (first[1].lastModified as Date).setTime(0);
      first.push({ url: "https://evil.example", lastModified: new Date(0) });
      first.length = 0;

      const second = sitemap();
      expect(snapshot(second)).toEqual(before);
      expectOnlyAbsoluteHttpUrls(second);
    });

    it("gives every entry its own Date so a partial mutation cannot desynchronise a document", () => {
      const doc = buildSitemap({
        siteUrl: VALID_SITE,
        now: () => FIXED_NOW,
        report: jest.fn(),
      });

      const instances = new Set(doc.map((entry) => entry.lastModified));
      expect(instances.size).toBe(doc.length);
      for (const entry of doc) {
        expect(entry.lastModified).not.toBe(FIXED_NOW);
        expect(entry.lastModified).toEqual(FIXED_NOW);
      }
    });

    it("never aliases the injected clock, so mutating a result cannot corrupt later documents (regression)", () => {
      // A memoised or shared clock instance is a realistic seam in callers.
      const sharedClock = new Date("2026-02-03T04:05:06.000Z");
      const options = {
        siteUrl: VALID_SITE,
        now: () => sharedClock,
        report: jest.fn(),
      };

      const first = buildSitemap(options);
      (first[0].lastModified as Date).setTime(0);

      const second = buildSitemap(options);
      expect(sharedClock.toISOString()).toBe("2026-02-03T04:05:06.000Z");
      expect((second[0].lastModified as Date).toISOString()).toBe(
        "2026-02-03T04:05:06.000Z",
      );
      // The S3 fallback entry is minted the same way.
      const fallbackOnly = buildSitemap({ ...options, routes: [] });
      expect(fallbackOnly[0].lastModified).not.toBe(sharedClock);
      expect(fallbackOnly[0].lastModified).toEqual(sharedClock);
    });

    it("does not expose the frozen route list through the result", () => {
      const doc = sitemap();
      expect(doc).not.toBe(SITEMAP_ROUTES);
      expect(Object.isFrozen(doc)).toBe(false);
      expect(Object.isFrozen(SITEMAP_ROUTES)).toBe(true);
    });
  });

  describe("idempotent retries and duplicate work", () => {
    it("is byte-identical across repeated calls when SOURCE_DATE_EPOCH pins the clock", () => {
      process.env.NEXT_PUBLIC_SITE_URL = VALID_SITE;
      process.env.SOURCE_DATE_EPOCH = "1700000000";

      const runs = Array.from({ length: 10 }, () => JSON.stringify(sitemap()));
      expect(new Set(runs).size).toBe(1);
    });

    it("reflects a changed SOURCE_DATE_EPOCH or site URL on the very next call (no stale cache)", () => {
      process.env.NEXT_PUBLIC_SITE_URL = "https://one.app";
      process.env.SOURCE_DATE_EPOCH = "1700000000";
      expect(snapshot(sitemap())[0]).toBe("https://one.app@1700000000000");

      process.env.SOURCE_DATE_EPOCH = "1700000001";
      expect(snapshot(sitemap())[0]).toBe("https://one.app@1700000001000");

      process.env.NEXT_PUBLIC_SITE_URL = "https://two.app";
      expect(snapshot(sitemap())[0]).toBe("https://two.app@1700000001000");

      delete process.env.SOURCE_DATE_EPOCH;
      jest.useFakeTimers().setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
      try {
        expect(snapshot(sitemap())[0]).toBe(
          `https://two.app@${Date.UTC(2030, 0, 1)}`,
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it("re-reports after the dedupe memo is reset but not before (retry semantics are explicit)", () => {
      const reporter = jest.fn();
      setErrorReporter(reporter);
      process.env.NEXT_PUBLIC_SITE_URL = "ftp://talenttrust.app";

      sitemap();
      sitemap();
      expect(reporter).toHaveBeenCalledTimes(1);

      __resetSitemapReportsForTests();
      sitemap();
      expect(reporter).toHaveBeenCalledTimes(2);
    });

    it("leaves the pure builder undeduplicated, so direct callers see every occurrence", () => {
      const report = createReportSpy();
      buildSitemap({ siteUrl: "ftp://talenttrust.app", report: report.fn });
      buildSitemap({ siteUrl: "ftp://talenttrust.app", report: report.fn });
      expect(report.callsFor(SITEMAP_SITE_URL_REJECTED_CODE)).toHaveLength(2);
    });
  });

  describe("timing boundaries (S5, S9)", () => {
    it("consults the clock exactly once per document, and not at all when SOURCE_DATE_EPOCH is valid", () => {
      const now = jest.fn(() => FIXED_NOW);

      buildSitemap({ siteUrl: VALID_SITE, now, report: jest.fn() });
      expect(now).toHaveBeenCalledTimes(1);

      now.mockClear();
      buildSitemap({
        siteUrl: VALID_SITE,
        sourceDateEpoch: "1700000000",
        now,
        report: jest.fn(),
      });
      expect(now).not.toHaveBeenCalled();
    });

    it("stamps the whole document from one reading even if the clock advances mid-build", () => {
      let tick = Date.UTC(2026, 0, 1);
      const advancing = () => new Date((tick += 1000));

      const doc = buildSitemap({
        siteUrl: VALID_SITE,
        now: advancing,
        report: jest.fn(),
      });
      const stamps = new Set(
        doc.map((entry) => (entry.lastModified as Date).getTime()),
      );
      expect(stamps.size).toBe(1);
    });

    it("keeps successive documents monotonic with the clock and each internally consistent", () => {
      let tick = Date.UTC(2026, 0, 1);
      const advancing = () => new Date((tick += 60_000));

      const docs = [1, 2, 3].map(() =>
        buildSitemap({
          siteUrl: VALID_SITE,
          now: advancing,
          report: jest.fn(),
        }),
      );
      const stamps = docs.map((doc) => (doc[0].lastModified as Date).getTime());
      expect(stamps).toEqual([...stamps].sort((a, b) => a - b));
      expect(new Set(stamps).size).toBe(3);
    });

    it("accepts SOURCE_DATE_EPOCH exactly at the Date range boundary and rejects one step past it", () => {
      const atLimit = createReportSpy();
      const atLimitDoc = buildSitemap({
        siteUrl: VALID_SITE,
        sourceDateEpoch: "8640000000000", // 8.64e15 ms — the largest representable Date
        report: atLimit.fn,
      });
      expect((atLimitDoc[0].lastModified as Date).getTime()).toBe(8.64e15);
      expect(atLimit.callsFor(SITEMAP_INVALID_TIMESTAMP_CODE)).toHaveLength(0);

      const pastLimit = createReportSpy();
      const pastLimitDoc = buildSitemap({
        siteUrl: VALID_SITE,
        sourceDateEpoch: "8640000000001",
        now: () => FIXED_NOW,
        report: pastLimit.fn,
      });
      expect(pastLimitDoc[0].lastModified).toEqual(FIXED_NOW);
      expect(pastLimit.callsFor(SITEMAP_INVALID_TIMESTAMP_CODE)).toHaveLength(
        1,
      );
    });

    it("treats a zero epoch as valid and a fractional epoch as milliseconds precision", () => {
      const zero = buildSitemap({
        siteUrl: VALID_SITE,
        sourceDateEpoch: "0",
        report: jest.fn(),
      });
      expect((zero[0].lastModified as Date).toISOString()).toBe(
        "1970-01-01T00:00:00.000Z",
      );

      const fractional = buildSitemap({
        siteUrl: VALID_SITE,
        sourceDateEpoch: "1700000000.5",
        report: jest.fn(),
      });
      expect((fractional[0].lastModified as Date).getTime()).toBe(
        1_700_000_000_500,
      );
    });
  });

  describe("failure containment (S2)", () => {
    it("still returns a complete document when the injected reporter throws (regression)", () => {
      const throwingReporter = jest.fn(() => {
        throw new Error("logger down: token=sup3rs3cret");
      });

      let doc: MetadataRoute.Sitemap | undefined;
      expect(() => {
        doc = buildSitemap({
          siteUrl: "javascript:alert(1)",
          routes: ["/", "/contracts", "/bad path"],
          sourceDateEpoch: "abc",
          now: () => FIXED_NOW,
          report: throwingReporter,
        });
      }).not.toThrow();

      expect(doc?.map((entry) => entry.url)).toEqual([
        "http://localhost:3000",
        "http://localhost:3000/contracts",
      ]);
      // Three conditions, three attempts, three contained failures.
      expect(throwingReporter).toHaveBeenCalledTimes(3);
      expect(console.error).toHaveBeenCalledTimes(3);
      // The console note never echoes the report payload.
      for (const call of (console.error as jest.Mock).mock.calls) {
        expect(String(call[0])).not.toContain("alert");
        expect(String(call[0])).not.toContain("bad path");
      }
    });

    it("still returns a document when the entry point's own reporter throws", () => {
      setErrorReporter(() => {
        throw new Error("sink unavailable");
      });
      process.env.NEXT_PUBLIC_SITE_URL = "ftp://talenttrust.app";

      let doc: MetadataRoute.Sitemap | undefined;
      expect(() => {
        doc = sitemap();
      }).not.toThrow();
      expect(doc).toHaveLength(4);
      expectOnlyAbsoluteHttpUrls(doc!);
      // Production visibility survives a broken reporter.
      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it("treats a throwing clock like an invalid one and still stamps a finite date", () => {
      const report = createReportSpy();
      const doc = buildSitemap({
        siteUrl: VALID_SITE,
        now: () => {
          throw new Error("clock unavailable");
        },
        report: report.fn,
      });

      expect(Number.isFinite((doc[0].lastModified as Date).getTime())).toBe(
        true,
      );
      expect(
        (
          report.callsFor(SITEMAP_INVALID_TIMESTAMP_CODE)[0][3] as {
            source: string;
          }
        ).source,
      ).toBe("clock");
    });

    it("treats a clock that returns a non-Date value like an invalid one", () => {
      const report = createReportSpy();
      const doc = buildSitemap({
        siteUrl: VALID_SITE,
        now: () => "2026-01-01T00:00:00.000Z" as unknown as Date,
        report: report.fn,
      });

      expect(doc[0].lastModified).toBeInstanceOf(Date);
      expect(Number.isFinite((doc[0].lastModified as Date).getTime())).toBe(
        true,
      );
      expect(report.reasons(SITEMAP_INVALID_TIMESTAMP_CODE)).toHaveLength(1);
    });

    it("stays silent on the console about a throwing reporter in production, but still ships the document", () => {
      process.env.NODE_ENV = "production";
      const doc = buildSitemap({
        siteUrl: "ftp://talenttrust.app",
        report: () => {
          throw new Error("logger down");
        },
      });

      expect(doc).toHaveLength(4);
      expectOnlyAbsoluteHttpUrls(doc);
      expect(console.error).not.toHaveBeenCalled();
    });

    it("never emits an Invalid Date even when the process clock itself is broken (route would 500)", () => {
      const reporter = jest.fn();
      setErrorReporter(reporter);
      process.env.NEXT_PUBLIC_SITE_URL = VALID_SITE;
      jest.useFakeTimers().setSystemTime(new Date(Number.NaN));

      try {
        const doc = sitemap();
        for (const entry of doc) {
          const stamp = entry.lastModified as Date;
          expect(Number.isFinite(stamp.getTime())).toBe(true);
          // Serialisable exactly as Next's resolver does it.
          expect(() => stamp.toISOString()).not.toThrow();
        }
        const sources = reporter.mock.calls
          .filter(
            (call) =>
              (call[3] as { code?: string })?.code ===
              SITEMAP_INVALID_TIMESTAMP_CODE,
          )
          .map((call) => (call[3] as { source: string }).source);
        expect(sources).toEqual(["clock"]);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe("report memo hygiene (S6, S7)", () => {
    it("distinguishes the two timestamp sources so neither is swallowed (regression)", () => {
      const reporter = jest.fn();
      setErrorReporter(reporter);
      process.env.NEXT_PUBLIC_SITE_URL = VALID_SITE;

      // Condition 1: unusable SOURCE_DATE_EPOCH (clock is healthy).
      process.env.SOURCE_DATE_EPOCH = "abc";
      sitemap();

      // Condition 2: healthy SOURCE_DATE_EPOCH is absent and the clock is broken.
      delete process.env.SOURCE_DATE_EPOCH;
      jest.useFakeTimers().setSystemTime(new Date(Number.NaN));
      try {
        sitemap();
      } finally {
        jest.useRealTimers();
      }

      const sources = reporter.mock.calls
        .filter(
          (call) =>
            (call[3] as { code?: string })?.code ===
            SITEMAP_INVALID_TIMESTAMP_CODE,
        )
        .map((call) => (call[3] as { source: string }).source);
      expect(sources).toEqual(["SOURCE_DATE_EPOCH", "clock"]);
    });

    it("distinguishes every sanitisation combination", () => {
      const reporter = jest.fn();
      setErrorReporter(reporter);

      for (const site of [
        "https://u:p@talenttrust.app",
        "https://talenttrust.app/?q=1",
        "https://talenttrust.app/#frag",
        "https://u:p@talenttrust.app/?q=1#frag",
      ]) {
        process.env.NEXT_PUBLIC_SITE_URL = site;
        sitemap();
        sitemap();
      }

      const sanitised = reporter.mock.calls
        .filter(
          (call) =>
            (call[3] as { code?: string })?.code ===
            SITEMAP_SITE_URL_SANITIZED_CODE,
        )
        .map((call) =>
          (call[3] as { sanitised: string[] }).sanitised.join("+"),
        );
      expect(sanitised).toEqual([
        "credentials",
        "query",
        "hash",
        "credentials+query+hash",
      ]);
    });

    it("reports every distinct real-world condition exactly once across repeated passes", () => {
      const reporter = jest.fn();
      setErrorReporter(reporter);
      const conditions: Array<Record<string, string>> = [
        { NEXT_PUBLIC_SITE_URL: "not a url" },
        { NEXT_PUBLIC_SITE_URL: "ftp://x" },
        { NEXT_PUBLIC_SITE_URL: "https://x/has space" },
        { NEXT_PUBLIC_SITE_URL: "https://u:p@x" },
        { NEXT_PUBLIC_SITE_URL: "https://x/?q" },
        { NEXT_PUBLIC_SITE_URL: "https://x/#h" },
        { NEXT_PUBLIC_SITE_URL: VALID_SITE, SOURCE_DATE_EPOCH: "abc" },
      ];

      for (let pass = 0; pass < 3; pass += 1) {
        for (const env of conditions) {
          delete process.env.SOURCE_DATE_EPOCH;
          for (const [key, value] of Object.entries(env))
            process.env[key] = value;
          sitemap();
        }
      }

      // Seven distinct conditions, each reported exactly once across three passes.
      expect(reporter).toHaveBeenCalledTimes(conditions.length);
    });

    it("keeps the fixed vocabulary comfortably inside the hard cap", () => {
      // 3 rejections + 7 sanitisation combinations + 3 route drops + 1 truncation
      // + 2 timestamp sources. If this grows, revisit SITEMAP_MAX_REPORTED_CONDITIONS.
      const VOCABULARY_SIZE = 16;
      expect(SITEMAP_MAX_REPORTED_CONDITIONS).toBeGreaterThanOrEqual(
        VOCABULARY_SIZE * 2,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Report memo factory (S7 bound, eviction, reset)
// ---------------------------------------------------------------------------

describe("createSitemapReportMemo", () => {
  const condition = (reason: string) => ({
    code: SITEMAP_ROUTE_DROPPED_CODE,
    reason,
  });

  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("forwards the first occurrence of a condition and suppresses repeats", () => {
    const sink = jest.fn();
    const memo = createSitemapReportMemo({ report: sink });

    memo.reporter(new Error("a"), "sitemap", "warn", condition("x"));
    memo.reporter(new Error("a"), "sitemap", "warn", condition("x"));
    memo.reporter(new Error("b"), "sitemap", "warn", condition("y"));

    expect(sink).toHaveBeenCalledTimes(2);
    expect(memo.size()).toBe(2);
  });

  it("evicts the oldest condition at the bound so memory stays flat under a vocabulary mistake", () => {
    const sink = jest.fn();
    const memo = createSitemapReportMemo({ report: sink, maxEntries: 3 });

    for (const reason of ["a", "b", "c", "d", "e"]) {
      memo.reporter(new Error(reason), "sitemap", "warn", condition(reason));
    }
    expect(memo.size()).toBe(3);
    expect(sink).toHaveBeenCalledTimes(5);

    // The two most recent survive; the oldest was evicted and would be re-reported.
    memo.reporter(new Error("e"), "sitemap", "warn", condition("e"));
    memo.reporter(new Error("d"), "sitemap", "warn", condition("d"));
    expect(sink).toHaveBeenCalledTimes(5);
    memo.reporter(new Error("a"), "sitemap", "warn", condition("a"));
    expect(sink).toHaveBeenCalledTimes(6);
    expect(memo.size()).toBe(3);
  });

  it("cannot have its bound disabled by a bad maxEntries", () => {
    for (const maxEntries of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const memo = createSitemapReportMemo({ report: jest.fn(), maxEntries });
      for (
        let index = 0;
        index < SITEMAP_MAX_REPORTED_CONDITIONS + 10;
        index += 1
      ) {
        memo.reporter(
          new Error("x"),
          "sitemap",
          "warn",
          condition(String(index)),
        );
      }
      expect(memo.size()).toBe(SITEMAP_MAX_REPORTED_CONDITIONS);
    }
  });

  it("reset() lets each condition through exactly once more", () => {
    const sink = jest.fn();
    const memo = createSitemapReportMemo({ report: sink });

    memo.reporter(new Error("a"), "sitemap", "warn", condition("x"));
    memo.reset();
    expect(memo.size()).toBe(0);
    memo.reporter(new Error("a"), "sitemap", "warn", condition("x"));
    memo.reporter(new Error("a"), "sitemap", "warn", condition("x"));

    expect(sink).toHaveBeenCalledTimes(2);
  });

  it("marks a condition before delivery, so a throwing sink is not retried on every request", () => {
    const sink = jest.fn(() => {
      throw new Error("sink down");
    });
    const memo = createSitemapReportMemo({ report: sink });

    // Through the builder, which contains the throw (S2).
    buildSitemap({ siteUrl: "ftp://x", report: memo.reporter });
    buildSitemap({ siteUrl: "ftp://x", report: memo.reporter });

    expect(sink).toHaveBeenCalledTimes(1);
    expect(memo.size()).toBe(1);
  });

  it("is frozen and independent per instance", () => {
    const first = createSitemapReportMemo({ report: jest.fn() });
    const second = createSitemapReportMemo({ report: jest.fn() });

    expect(Object.isFrozen(first)).toBe(true);
    first.reporter(new Error("a"), "sitemap", "warn", condition("x"));
    expect(first.size()).toBe(1);
    expect(second.size()).toBe(0);
  });

  it('keys a report without metadata under a single "unknown" condition and defaults the level to error', () => {
    const sink = jest.fn();
    const memo = createSitemapReportMemo({ report: sink });

    memo.reporter(new Error("bare"), "sitemap");
    memo.reporter(new Error("bare again"), "sitemap");
    memo.reporter(
      new Error("bare, with non-string code"),
      "sitemap",
      undefined,
      { code: 42 },
    );

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(
      expect.any(Error),
      "sitemap",
      "error",
      undefined,
    );
    expect(memo.size()).toBe(1);
  });

  it("does not emit the production console warning for contexts or codes it does not own", () => {
    const memo = createSitemapReportMemo({ report: jest.fn() });

    memo.reporter(new Error("x"), "other", "warn", {
      code: SITEMAP_SITE_URL_REJECTED_CODE,
      reason: "unparsable",
    });
    memo.reporter(new Error("y"), "sitemap", "warn", {
      code: SITEMAP_TRUNCATED_CODE,
    });

    expect(console.warn).not.toHaveBeenCalled();
  });
});
