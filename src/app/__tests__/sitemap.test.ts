import type { MetadataRoute } from "next";
import sitemap, {
  buildSitemap,
  resolveSitemapBaseUrl,
  resolveLastModifiedMs,
  createSitemapReportMemo,
  __resetSitemapReportMemoForTests,
  DEFAULT_SITE_URL,
  SITEMAP_MAX_URLS,
  SITEMAP_MAX_REPORTED_CONDITIONS,
  SITEMAP_ROUTES,
  SITEMAP_INVALID_TIMESTAMP_CODE,
  SITEMAP_ROUTE_DROPPED_CODE,
  SITEMAP_SITE_URL_REJECTED_CODE,
  SITEMAP_SITE_URL_SANITIZED_CODE,
  SITEMAP_TRUNCATED_CODE,
  type SitemapBuildOptions,
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

/** Asserts the S2 serialisability invariant: Next's XML serialiser calls
 * `toISOString()` on every stamp and throws `RangeError` on an Invalid Date,
 * which would turn `/sitemap.xml` into a 500. */
const expectSerialisableDocument = (result: MetadataRoute.Sitemap) => {
  expect(result.length).toBeGreaterThan(0);
  for (const entry of result) {
    const stamp = entry.lastModified as Date;
    expect(stamp).toBeInstanceOf(Date);
    expect(Number.isFinite(stamp.getTime())).toBe(true);
    expect(() => stamp.toISOString()).not.toThrow();
  }
};

/**
 * Loads a fresh `sitemap` module instance with a mocked central reporter.
 *
 * The dedupe memo is module state, so each case that observes reporting
 * through the `sitemap()` entry point needs its own module instance.
 * `jest.doMock` is used (rather than `setErrorReporter`) because an isolated
 * module registry also isolates the real `errorReporter` instance the
 * statically imported helper would otherwise patch.
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
  return freshModule!;
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
  // Concurrency/boundary suites install fake timers (including a broken-clock
  // NaN time); always restore the real clock so no suite leaks into the next.
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Regression: the original contract of sitemap() must not change
// ---------------------------------------------------------------------------

describe("sitemap.ts", () => {
  // Collects warn-level reports routed through the central reporter so the
  // default-export path can be observed without spying on the console.
  // (Was left undeclared by a merge, which failed every test in this block.)
  let warnings: string[] = [];

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
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
  });

  it("should use custom NEXT_PUBLIC_SITE_URL when provided", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://talenttrust.app";
    const result = sitemap();

    expect(result[0].url).toBe("https://talenttrust.app");
    expect(result[1].url).toBe("https://talenttrust.app/contracts");
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
    ["https://talenttrust.app/\u0085c1-control", "invalid-characters"],
    ["https://talenttrust.app/\u007fdel", "invalid-characters"],
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

  it("floors a fractional cap rather than overfilling the document", () => {
    const report = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      routes: ["/", "/contracts", "/milestones"],
      maxUrls: 2.9,
      report: report.fn,
    });

    expect(result).toHaveLength(2);
    expect(report.callsFor(SITEMAP_TRUNCATED_CODE)[0][3]).toEqual({
      code: SITEMAP_TRUNCATED_CODE,
      limit: 2,
      dropped: 1,
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
// Concurrency hardening (#1257)
//
// Every test in these blocks fails against the pre-#1257 module: they are the
// regression net for the probed defects (timestamp aliasing, reporter/clock
// exceptions escaping, Invalid Date reaching the serialiser, dedupe-key
// collision, unbounded memo, non-string routes becoming home entries).
// ---------------------------------------------------------------------------

describe("sitemap isolation across invocations (S8)", () => {
  it("mints a distinct Date per entry while all entries share one logical timestamp (S5)", () => {
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      now: () => FIXED_NOW,
      report: jest.fn(),
    });

    expect(result.length).toBeGreaterThan(1);
    for (let i = 1; i < result.length; i += 1) {
      // Distinct instances...
      expect(result[i].lastModified).not.toBe(result[0].lastModified);
      // ...same logical value.
      expect((result[i].lastModified as Date).getTime()).toBe(
        (result[0].lastModified as Date).getTime(),
      );
    }
  });

  it("never aliases the injected clock: mutating a result cannot rewrite the clock or the next document", () => {
    const clockDate = new Date("2026-01-01T00:00:00.000Z");
    const build = () =>
      buildSitemap({
        siteUrl: "https://talenttrust.app",
        now: () => clockDate,
        report: jest.fn(),
      });

    const first = build();
    (first[0].lastModified as Date).setTime(0); // hostile consumer

    // The clock instance is untouched...
    expect(clockDate.getTime()).toBe(
      new Date("2026-01-01T00:00:00.000Z").getTime(),
    );
    // ...sibling entries in the same document are untouched...
    expect(first[1].lastModified).toEqual(clockDate);
    // ...and the next document is not stamped from a mutated value.
    expect(build()[0].lastModified).toEqual(clockDate);
  });

  it("does not let a consumer mutating one result influence the next call", () => {
    const first = buildSitemap({
      siteUrl: "https://talenttrust.app",
      now: () => FIXED_NOW,
      report: jest.fn(),
    });

    first.length = 0; // hostile consumer empties the array it was handed

    const second = buildSitemap({
      siteUrl: "https://talenttrust.app",
      now: () => FIXED_NOW,
      report: jest.fn(),
    });
    expect(second).toHaveLength(SITEMAP_ROUTES.length);
    expect(second.map((entry) => entry.url)).toEqual([
      "https://talenttrust.app",
      "https://talenttrust.app/contracts",
      "https://talenttrust.app/milestones",
      "https://talenttrust.app/reputation",
    ]);
  });

  it("produces identical, independently owned documents for 50 interleaved calls", () => {
    const docs: MetadataRoute.Sitemap[] = [];
    for (let i = 0; i < 50; i += 1) {
      docs.push(
        buildSitemap({
          siteUrl: "https://talenttrust.app",
          now: () => FIXED_NOW,
          report: jest.fn(),
        }),
      );
    }

    const reference = JSON.stringify(docs[0]);
    for (const doc of docs) {
      expect(JSON.stringify(doc)).toBe(reference); // identical content
    }
    for (let i = 1; i < docs.length; i += 1) {
      expect(docs[i]).not.toBe(docs[0]); // distinct arrays
      expect(docs[i][0]).not.toBe(docs[0][0]); // distinct entry objects
      expect(docs[i][0].lastModified).not.toBe(docs[0][0].lastModified); // distinct Dates
    }

    // Corrupting one document leaves every other document untouched.
    (docs[7][0].lastModified as Date).setFullYear(1999);
    docs[7][0].url = "https://evil.example";
    docs[7].length = 1;
    expect(JSON.stringify(docs[6])).toBe(reference);
    expect(JSON.stringify(docs[8])).toBe(reference);
  });

  it("drops a non-string route instead of turning it into the home entry", () => {
    const report = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      routes: [
        null as unknown as string,
        42 as unknown as string,
        "/",
        "/contracts",
      ],
      report: report.fn,
    });

    // Junk routes are dropped and reported; the real routes still ship (S3
    // home entry comes from the genuine '/' route, not from the junk).
    expect(result.map((entry) => entry.url)).toEqual([
      "https://talenttrust.app",
      "https://talenttrust.app/contracts",
    ]);
    expect(report.reasons(SITEMAP_ROUTE_DROPPED_CODE)).toEqual([
      "invalid-route",
      "invalid-route",
    ]);
    // The junk values themselves are never echoed into reports (S6).
    expect(JSON.stringify(report.fn.mock.calls)).not.toContain("42");
  });
});

describe("sitemap input snapshots (S9)", () => {
  it("never serves a stale or mixed document when the environment changes between racing calls", () => {
    const bases = [
      "https://a.example",
      "https://b.example",
      "https://c.example",
    ];

    for (let i = 0; i < 30; i += 1) {
      process.env.NEXT_PUBLIC_SITE_URL = bases[i % bases.length];
      // buildSitemap reads the env itself; each call must reflect exactly the
      // value set for it — never a previous call's base, never a mix.
      const doc = buildSitemap({ now: () => FIXED_NOW, report: jest.fn() });

      const expectedBase = bases[i % bases.length];
      expect(doc[0].url).toBe(expectedBase);
      for (const entry of doc) {
        expect(
          entry.url === expectedBase ||
            entry.url.startsWith(`${expectedBase}/`),
        ).toBe(true);
      }
    }
  });

  it("invokes the clock at most once per document", () => {
    let clockCalls = 0;
    buildSitemap({
      siteUrl: "https://talenttrust.app",
      now: () => {
        clockCalls += 1;
        return FIXED_NOW;
      },
      report: jest.fn(),
    });
    expect(clockCalls).toBe(1);
  });

  it("does not consult the clock at all when SOURCE_DATE_EPOCH pins the timestamp", () => {
    let clockCalls = 0;
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      sourceDateEpoch: "1700000000",
      now: () => {
        clockCalls += 1;
        return FIXED_NOW;
      },
      report: jest.fn(),
    });
    expect(clockCalls).toBe(0);
    expect(result[0].lastModified).toEqual(
      new Date("2023-11-14T22:13:20.000Z"),
    );
  });

  it("honours a changed SOURCE_DATE_EPOCH on the very next call (no cache to go stale)", () => {
    process.env.SOURCE_DATE_EPOCH = "1000000000";
    const first = buildSitemap({
      siteUrl: "https://talenttrust.app",
      report: jest.fn(),
    });
    process.env.SOURCE_DATE_EPOCH = "2000000000";
    const second = buildSitemap({
      siteUrl: "https://talenttrust.app",
      report: jest.fn(),
    });

    expect((first[0].lastModified as Date).getTime()).toBe(1_000_000_000_000);
    expect((second[0].lastModified as Date).getTime()).toBe(2_000_000_000_000);
  });

  it("is byte-identical across repeated calls when SOURCE_DATE_EPOCH pins the clock (idempotent retries)", () => {
    process.env.SOURCE_DATE_EPOCH = "1700000000";

    const reference = JSON.stringify(
      buildSitemap({ siteUrl: "https://talenttrust.app", report: jest.fn() }),
    );
    for (let i = 0; i < 5; i += 1) {
      const retry = JSON.stringify(
        buildSitemap({ siteUrl: "https://talenttrust.app", report: jest.fn() }),
      );
      expect(retry).toBe(reference);
    }
  });
});

describe("sitemap failure containment (S2)", () => {
  it("still returns a complete document when the injected reporter throws", () => {
    const result = buildSitemap({
      siteUrl: "ftp://talenttrust.app", // base rejection → report fires
      routes: ["/", "/contracts", "/bad route", "/milestones"], // route drop → report fires
      report: () => {
        throw new Error("sink down");
      },
    });

    expect(result.map((entry) => entry.url)).toEqual([
      DEFAULT_SITE_URL,
      `${DEFAULT_SITE_URL}/contracts`,
      `${DEFAULT_SITE_URL}/milestones`,
    ]);
    expectSerialisableDocument(result);
  });

  it("never propagates a throwing clock", () => {
    const report = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      now: () => {
        throw new Error("clock down");
      },
      report: report.fn,
    });

    expect(result).toHaveLength(SITEMAP_ROUTES.length);
    expectSerialisableDocument(result);
    expect(
      (
        report.callsFor(SITEMAP_INVALID_TIMESTAMP_CODE)[0][3] as {
          source: string;
        }
      ).source,
    ).toBe("clock");
  });

  it("never emits an Invalid Date even when the process clock itself is broken", () => {
    // Break the platform clock AND the injected clock: the previous fallback
    // (`new Date()`) was the same broken clock, so entries carried Invalid
    // Date and Next's serialiser raised RangeError → the route became a 500.
    jest.useFakeTimers().setSystemTime(new Date(NaN));

    const report = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      now: () => new Date(NaN),
      report: report.fn,
    });

    expect(result).toHaveLength(SITEMAP_ROUTES.length);
    expectSerialisableDocument(result);
    expect(
      (
        report.callsFor(SITEMAP_INVALID_TIMESTAMP_CODE)[0][3] as {
          source: string;
        }
      ).source,
    ).toBe("clock");
  });

  it("emits a serialisable document for every hostile seam combination", () => {
    const hostile: SitemapBuildOptions[] = [
      { siteUrl: "https://talenttrust.app", now: () => new Date(NaN) },
      {
        siteUrl: "https://talenttrust.app",
        now: () => {
          throw new Error("clock");
        },
      },
      {
        siteUrl: "https://talenttrust.app",
        sourceDateEpoch: "garbage",
        now: () => new Date(NaN),
      },
      {
        siteUrl: "javascript:alert(1)",
        report: () => {
          throw new Error("sink");
        },
      },
      {
        siteUrl: "https://talenttrust.app",
        resolveUrl: () => {
          throw new Error("resolver");
        },
      },
      {
        // A resolver that returns a non-URL object with a usable toString:
        // the output must still pass the absolute-http re-validation (S1).
        siteUrl: "https://talenttrust.app",
        resolveUrl: (() => ({
          toString: () => "https://resolved.example/page",
        })) as unknown as SitemapBuildOptions["resolveUrl"],
      },
      {
        // A resolver whose toString is not callable must degrade to a dropped
        // route, not an exception.
        siteUrl: "https://talenttrust.app",
        resolveUrl: (() => ({
          toString: "https://resolved.example/page",
        })) as unknown as SitemapBuildOptions["resolveUrl"],
      },
      {
        // A resolver that smuggles a foreign scheme must be rejected (S1).
        siteUrl: "https://talenttrust.app",
        resolveUrl: (() => ({
          toString: () => "javascript:alert(1)",
        })) as unknown as SitemapBuildOptions["resolveUrl"],
      },
      {
        // A resolver whose output is not even parseable as a URL must be
        // rejected without propagating the parser failure (S1/S2).
        siteUrl: "https://talenttrust.app",
        resolveUrl: (() => ({
          toString: () => "not a url at all",
        })) as unknown as SitemapBuildOptions["resolveUrl"],
      },
    ];

    for (const options of hostile) {
      const doc = buildSitemap({
        report: jest.fn(),
        now: () => FIXED_NOW,
        ...options,
      });
      expectOnlyAbsoluteHttpUrls(doc);
      expectSerialisableDocument(doc);
    }
  });

  it("contains a throwing console without failing the document (sitemap() path)", () => {
    jest.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("console down");
    });
    jest.spyOn(console, "error").mockImplementation(() => {});
    const reporter = jest.fn();
    const fresh = loadFresh(
      { NEXT_PUBLIC_SITE_URL: "ftp://talenttrust.app" },
      reporter,
    );

    // The rejected-site-URL path always writes a console.warn; with the
    // console sabotaged the document must still be produced.
    expect(() => fresh.default()).not.toThrow();
    expect(fresh.default()).toHaveLength(4);
    jest.dontMock("@/lib/errorReporter");
  });

  it("stays silent in production when the reporter throws (no console note, intact document)", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = buildSitemap({
        siteUrl: "ftp://talenttrust.app", // rejection → report fires into a broken sink
        report: () => {
          throw new Error("sink down");
        },
      });

      expect(result).toHaveLength(SITEMAP_ROUTES.length);
      expectSerialisableDocument(result);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("contains a broken console inside the reporter guard itself", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {
      throw new Error("console down too");
    });

    const result = buildSitemap({
      siteUrl: "ftp://talenttrust.app",
      report: () => {
        throw new Error("sink down");
      },
    });

    // Sink threw, the containment note threw too — the document still ships.
    expect(result).toHaveLength(SITEMAP_ROUTES.length);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("reports and recovers when the clock returns a value that is not a Date", () => {
    const report = createReportSpy();
    const result = buildSitemap({
      siteUrl: "https://talenttrust.app",
      now: (() => "not-a-date") as unknown as SitemapBuildOptions["now"],
      report: report.fn,
    });

    expect(result).toHaveLength(SITEMAP_ROUTES.length);
    expectSerialisableDocument(result);
    expect(
      (
        report.callsFor(SITEMAP_INVALID_TIMESTAMP_CODE)[0][3] as {
          source: string;
        }
      ).source,
    ).toBe("clock");
  });
});

describe("sitemap timing boundaries", () => {
  it("accepts SOURCE_DATE_EPOCH exactly at the Date range boundary and rejects one step past it", () => {
    const maxSeconds = 8.64e15 / 1000; // largest representable Date, in seconds

    const atBoundary = buildSitemap({
      siteUrl: "https://talenttrust.app",
      sourceDateEpoch: String(maxSeconds),
      now: () => FIXED_NOW,
      report: jest.fn(),
    });
    expect((atBoundary[0].lastModified as Date).getTime()).toBe(8.64e15);

    const report = createReportSpy();
    const pastBoundary = buildSitemap({
      siteUrl: "https://talenttrust.app",
      sourceDateEpoch: String(maxSeconds + 0.001),
      now: () => FIXED_NOW,
      report: report.fn,
    });
    expect((pastBoundary[0].lastModified as Date).getTime()).toBe(
      FIXED_NOW.getTime(),
    );
    expect(report.callsFor(SITEMAP_INVALID_TIMESTAMP_CODE)).toHaveLength(1);
    expect(
      (
        report.callsFor(SITEMAP_INVALID_TIMESTAMP_CODE)[0][3] as {
          source: string;
        }
      ).source,
    ).toBe("SOURCE_DATE_EPOCH");
  });

  it("treats a zero epoch as valid and a fractional epoch as sub-second precision", () => {
    const zero = buildSitemap({
      siteUrl: "https://talenttrust.app",
      sourceDateEpoch: "0",
      report: jest.fn(),
    });
    expect((zero[0].lastModified as Date).getTime()).toBe(0);
    expectSerialisableDocument(zero);

    const fractional = buildSitemap({
      siteUrl: "https://talenttrust.app",
      sourceDateEpoch: "0.5",
      report: jest.fn(),
    });
    expect((fractional[0].lastModified as Date).getTime()).toBe(500);
  });

  it("resolveLastModifiedMs walks the whole fallback chain to a finite primitive", () => {
    const report = createReportSpy();

    // Rung 1: valid SOURCE_DATE_EPOCH wins, clock untouched.
    expect(
      resolveLastModifiedMs(() => FIXED_NOW, report.fn, "1700000000"),
    ).toBe(1_700_000_000_000);

    // Rung 2: injected clock.
    expect(resolveLastModifiedMs(() => FIXED_NOW, report.fn, undefined)).toBe(
      FIXED_NOW.getTime(),
    );

    // Rung 3: Date.now() when the injected clock is broken.
    jest.useFakeTimers().setSystemTime(1_234_567_890);
    expect(resolveLastModifiedMs(() => new Date(NaN), report.fn, "bad")).toBe(
      1_234_567_890,
    );

    // Rung 4: epoch 0 when even the platform clock is broken.
    jest.useFakeTimers().setSystemTime(new Date(NaN));
    expect(
      resolveLastModifiedMs(() => new Date(NaN), report.fn, undefined),
    ).toBe(0);

    // Every refusal was reported, none swallowed.
    expect(
      report.callsFor(SITEMAP_INVALID_TIMESTAMP_CODE).length,
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("sitemap report memo (S6/S7)", () => {
  it("distinguishes the two INVALID_TIMESTAMP sources so neither is swallowed (regression: dedupe-key collision)", () => {
    // Both timestamp conditions bad inside one process: the previous dedupe
    // key omitted `source`, so the second condition was silently dropped.
    jest.useFakeTimers().setSystemTime(new Date(NaN));
    const reporter = jest.fn();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const fresh = loadFresh({ SOURCE_DATE_EPOCH: "not-a-number" }, reporter);

    fresh.default();

    const tsReports = reporter.mock.calls.filter(
      (call) =>
        (call[3] as { code?: string })?.code === SITEMAP_INVALID_TIMESTAMP_CODE,
    );
    expect(tsReports).toHaveLength(2);
    expect(
      tsReports.map((call) => (call[3] as { source: string }).source).sort(),
    ).toEqual(["SOURCE_DATE_EPOCH", "clock"]);
    jest.dontMock("@/lib/errorReporter");
  });

  it("hard-caps the memo and evicts oldest-first, so a hot route cannot grow it without bound", () => {
    const sink = jest.fn();
    const memo = createSitemapReportMemo(sink, { maxEntries: 2 });
    const fire = (reason: string) =>
      memo.report(new Error("x"), "sitemap", "warn", {
        code: "TEST_CODE",
        reason,
      });

    fire("a");
    fire("b");
    expect(memo.size()).toBe(2);

    fire("a"); // duplicate within capacity → swallowed
    expect(sink).toHaveBeenCalledTimes(2);

    fire("c"); // over capacity → evicts oldest ('a')
    expect(memo.size()).toBe(2);

    fire("a"); // 'a' was evicted, so it is reportable again — the cost of a
    expect(sink).toHaveBeenCalledTimes(4); // keying mistake is a repeat log, not a leak
  });

  it("treats a sub-1 or non-finite memo cap as the documented default", () => {
    for (const maxEntries of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const memo = createSitemapReportMemo(jest.fn(), { maxEntries });
      for (let i = 0; i < SITEMAP_MAX_REPORTED_CONDITIONS + 10; i += 1) {
        memo.report(new Error("x"), "sitemap", "warn", {
          code: "TEST_CODE",
          reason: `r${i}`,
        });
      }
      expect(memo.size()).toBe(SITEMAP_MAX_REPORTED_CONDITIONS);
    }
    expect(SITEMAP_MAX_REPORTED_CONDITIONS).toBe(64);
  });

  it("floors a fractional memo cap", () => {
    const sink = jest.fn();
    const memo = createSitemapReportMemo(sink, { maxEntries: 2.9 });
    for (const reason of ["a", "b", "c"]) {
      memo.report(new Error("x"), "sitemap", "warn", {
        code: "TEST_CODE",
        reason,
      });
    }
    expect(memo.size()).toBe(2); // floor(2.9) === 2, 'a' evicted
    memo.report(new Error("x"), "sitemap", "warn", {
      code: "TEST_CODE",
      reason: "a",
    });
    expect(sink).toHaveBeenCalledTimes(4); // 'a' reportable again after eviction
  });

  it('logs "unknown" in the production note when a rejection report carries a non-string reason', () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const memo = createSitemapReportMemo(jest.fn());

    memo.report(new Error("x"), "sitemap", "warn", {
      code: SITEMAP_SITE_URL_REJECTED_CODE,
      reason: 123, // hostile/buggy meta shape
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("unknown");
    expect(warnSpy.mock.calls[0][0]).not.toContain("123");
  });

  it("marks a condition before delivery so a throwing sink is contained and not retried per request", () => {
    const sink = jest.fn(() => {
      throw new Error("sink down");
    });
    const memo = createSitemapReportMemo(sink);

    expect(() =>
      memo.report(new Error("x"), "sitemap", "warn", {
        code: "TEST_CODE",
        reason: "a",
      }),
    ).not.toThrow();
    memo.report(new Error("x"), "sitemap", "warn", {
      code: "TEST_CODE",
      reason: "a",
    });
    memo.report(new Error("x"), "sitemap", "warn", {
      code: "TEST_CODE",
      reason: "a",
    });

    expect(sink).toHaveBeenCalledTimes(1); // delivered once, retried never
    expect(memo.size()).toBe(1);
  });

  it("exposes a frozen memo object so overlapping callers cannot rewire it", () => {
    const memo = createSitemapReportMemo(jest.fn());
    expect(Object.isFrozen(memo)).toBe(true);
    expect(Object.isFrozen(memo.report)).toBe(true);
    expect(typeof memo.size).toBe("function");
    expect(typeof memo.reset).toBe("function");
  });

  it("handles reports with no meta and no level without throwing or colliding", () => {
    const sink = jest.fn();
    const memo = createSitemapReportMemo(sink);

    // No meta at all → the signature degrades to a stable 'unknown' code and
    // the level defaults to 'error'; repeated identical calls still dedupe.
    expect(() => memo.report(new Error("bare"), "sitemap")).not.toThrow();
    memo.report(new Error("bare"), "sitemap");
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][2]).toBe("error");

    // A distinct string code is its own condition.
    memo.report(new Error("odd"), "sitemap", "warn", { code: "ODD_CODE" });
    expect(sink).toHaveBeenCalledTimes(2);
    expect(memo.size()).toBe(2);

    // A non-string code must not crash the signature builder; it degrades to
    // the same 'unknown' bucket as the bare report and is therefore deduped.
    memo.report(new Error("odd"), "sitemap", "warn", {
      code: 42,
      reason: null,
      sanitised: "nope",
    });
    expect(sink).toHaveBeenCalledTimes(2);
    expect(memo.size()).toBe(2);
  });

  it("reset() empties the memo (test seam) without touching delivery", () => {
    const sink = jest.fn();
    const memo = createSitemapReportMemo(sink);
    memo.report(new Error("x"), "sitemap", "warn", {
      code: "TEST_CODE",
      reason: "a",
    });
    memo.report(new Error("x"), "sitemap", "warn", {
      code: "TEST_CODE",
      reason: "a",
    });
    expect(sink).toHaveBeenCalledTimes(1);

    memo.reset();
    expect(memo.size()).toBe(0);

    memo.report(new Error("x"), "sitemap", "warn", {
      code: "TEST_CODE",
      reason: "a",
    });
    expect(sink).toHaveBeenCalledTimes(2); // first-refusal observable again
  });
});

describe("sitemap() under concurrent load (#1257)", () => {
  afterEach(() => {
    jest.dontMock("@/lib/errorReporter");
  });

  it("reports a misconfiguration once across a burst of racing requests while every response stays complete", () => {
    const reporter = jest.fn();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const fresh = loadFresh(
      { NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" },
      reporter,
    );

    // A burst of overlapping requests against a misconfigured deployment.
    const docs = Array.from({ length: 25 }, () => fresh.default());

    for (const doc of docs) {
      expect(doc).toHaveLength(4);
      expectOnlyAbsoluteHttpUrls(doc);
      expectSerialisableDocument(doc);
      expect(doc[0].url).toBe(DEFAULT_SITE_URL);
    }

    // Duplicate work: the condition is delivered to the sink exactly once...
    expect(reporter).toHaveBeenCalledTimes(1);
    // ...and each document is independently owned (distinct Date instances).
    const stamps = docs.map((doc) => doc[0].lastModified);
    expect(new Set(stamps).size).toBe(docs.length);
  });

  it("returns identical documents for concurrent calls with identical configuration", () => {
    const fresh = loadFresh(
      {
        NEXT_PUBLIC_SITE_URL: "https://talenttrust.app",
        SOURCE_DATE_EPOCH: "1700000000",
      },
      jest.fn(),
    );

    const docs = Array.from({ length: 10 }, () => fresh.default());
    const reference = JSON.stringify(docs[0]);
    for (const doc of docs) {
      expect(JSON.stringify(doc)).toBe(reference);
    }
    for (let i = 1; i < docs.length; i += 1) {
      expect(docs[i]).not.toBe(docs[0]);
    }
  });

  it("keeps every response consistent with its own snapshot when the environment flips mid-burst", () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    const fresh = loadFresh(
      { NEXT_PUBLIC_SITE_URL: "https://a.example" },
      jest.fn(),
    );

    const goodDoc = fresh.default();
    expect(goodDoc[0].url).toBe("https://a.example");

    // Operator flips the configuration to a broken value mid-flight.
    process.env.NEXT_PUBLIC_SITE_URL = "ftp://b.example";
    const fallbackDoc = fresh.default();

    // The very next response honours the new snapshot: no cached/stale base,
    // no document mixing a.example and the fallback.
    expect(fallbackDoc[0].url).toBe(DEFAULT_SITE_URL);
    for (const entry of fallbackDoc) {
      expect(entry.url.startsWith(DEFAULT_SITE_URL)).toBe(true);
    }
    // The earlier document is untouched by the later call (S8).
    expect(goodDoc[0].url).toBe("https://a.example");
  });

  it("exposes the process-wide memo reset hook used by test suites", () => {
    expect(typeof __resetSitemapReportMemoForTests).toBe("function");
    expect(() => __resetSitemapReportMemoForTests()).not.toThrow();
  });
});
