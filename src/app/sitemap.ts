import type { MetadataRoute } from "next";
import { reportError, type ErrorReporter } from "../lib/errorReporter";

/**
 * Deterministic, concurrency-hardened sitemap generation (#1256, #1257).
 *
 * `/sitemap.xml` is generated per request, so every run must land on the same
 * answer for the same inputs: crawlers re-fetch it constantly, and a sitemap
 * that changes shape between requests (or between processes) makes indexing
 * behaviour impossible to reason about. Next.js invokes the default export
 * concurrently (once per request in dev, once per build worker in production)
 * and repeatedly across a process lifetime, then hands the result to its XML
 * serialiser. Nothing in that pipeline may observe stale, aliased or
 * unserialisable state.
 *
 * Invariants (each asserted in `src/app/__tests__/sitemap.test.ts`):
 *
 *   S1 – Every entry is an absolute `http(s)` URL. Nothing relative, nothing
 *        with credentials, nothing with a foreign scheme ever reaches output.
 *   S2 – The function never throws, and the document it returns is always
 *        serialisable. A rejected route is dropped and reported; a rejected
 *        base URL falls back to {@link DEFAULT_SITE_URL}; a throwing or broken
 *        reporter, clock or console is contained. No failure mode can produce
 *        an `Invalid Date` (Next's serialiser would raise `RangeError: Invalid
 *        time value` and turn the route into a 500).
 *   S3 – Never empty. A sitemap with zero URLs is invalid and makes crawlers
 *        drop the site, so the base entry is always emitted.
 *   S4 – Deterministic order and cardinality. Declaration order is preserved,
 *        duplicates collapse to their first occurrence, and the URL count is
 *        capped at the protocol limit of {@link SITEMAP_MAX_URLS}.
 *   S5 – One logical timestamp per document, captured once as a primitive
 *        millisecond value, so a single response never mixes `lastModified`
 *        values. Set `SOURCE_DATE_EPOCH` to make it reproducible across builds.
 *   S6 – No silent degradation. Every rejection is reported with a stable code
 *        and the *reason* only — never the offending value, which can carry
 *        credentials, hostnames or paths. The once-per-condition dedupe key
 *        covers every discriminating field (`code`, `reason`, `source`,
 *        `sanitised`), so two distinct conditions can never collide and
 *        swallow one another.
 *   S7 – Reports are emitted once per distinct condition per process, so a hot
 *        `/sitemap.xml` route cannot flood the logs, and the memo backing that
 *        guarantee is a single frozen instance hard-capped at
 *        {@link SITEMAP_MAX_REPORTED_CONDITIONS} entries with oldest-first
 *        eviction — bounded by construction, not by convention.
 *   S8 – Isolation across invocations. Every call returns a fresh array of
 *        fresh entry objects, each holding its own `Date` minted from the
 *        shared primitive timestamp. Nothing aliases the injected clock, the
 *        frozen route list, or another document, so a consumer (or a
 *        concurrent request's handler) mutating one result cannot inject a
 *        value into another request's output. Entry objects are deliberately
 *        NOT frozen: the result is handed to Next's serialiser, which owns it
 *        from there, and freezing output would risk breaking that contract —
 *        isolation is provided by ownership instead.
 *   S9 – One input snapshot per document. `NEXT_PUBLIC_SITE_URL` and
 *        `SOURCE_DATE_EPOCH` are each read exactly once at entry, the clock is
 *        invoked at most once, and the build is fully synchronous, so no
 *        interleaving can mix two configurations inside one document and there
 *        is no cache that could serve a stale environment value: a changed
 *        environment is honoured by the very next call.
 *
 * No user data is read or written here, so generation is side-effect free
 * apart from the deduplicated, bounded reports in S6/S7.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Documented fallback origin. Preserved from the original implementation. */
export const DEFAULT_SITE_URL = "http://localhost:3000";

/**
 * Ordered public routes. `'/'` is the site root and always resolves to the
 * configured base without a trailing slash, which is what the previous
 * implementation emitted.
 */
export const SITEMAP_ROUTES: readonly string[] = Object.freeze([
  "/",
  "/contracts",
  "/milestones",
  "/reputation",
]);

/** Protocol limit for a single sitemap file (per sitemaps.org). */
export const SITEMAP_MAX_URLS = 50_000;

/**
 * Hard cap on the once-per-condition report memo (S7).
 *
 * The realistic key vocabulary is ~16 signatures (fixed codes × fixed reasons
 * × sources × sanitisation combinations), so 64 leaves ample headroom while
 * guaranteeing that even a future keying mistake costs a repeated log line
 * after eviction rather than unbounded memory growth on a hot route.
 */
export const SITEMAP_MAX_REPORTED_CONDITIONS = 64;

/** Only these schemes may appear in a sitemap. */
const ALLOWED_PROTOCOLS: readonly string[] = Object.freeze(["http:", "https:"]);

/**
 * True when `value` contains a space or a C0/C1 control character.
 *
 * Spelled out as a code-point scan rather than a regular expression so the
 * rule is explicit and so the intent is not mistaken for a character-class
 * range. Hyphens and every other printable character are deliberately allowed
 * (`https://my-site.example` is valid).
 */
function hasUnsafeBaseUrlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/**
 * Allowlist for route path characters (RFC 3986 `pchar` plus `/`). A whitelist
 * is used instead of a blacklist so a future URL syntax cannot smuggle a
 * character past validation into the XML.
 */
const SAFE_ROUTE_CHARS = /^[A-Za-z0-9\-._~!$&'()*+,;=:@/]+$/;

/** Stable report codes, safe to alert on. */
export const SITEMAP_SITE_URL_REJECTED_CODE =
  "SITEMAP_SITE_URL_REJECTED" as const;
export const SITEMAP_SITE_URL_SANITIZED_CODE =
  "SITEMAP_SITE_URL_SANITIZED" as const;
export const SITEMAP_ROUTE_DROPPED_CODE = "SITEMAP_ROUTE_DROPPED" as const;
export const SITEMAP_TRUNCATED_CODE = "SITEMAP_TRUNCATED" as const;
export const SITEMAP_INVALID_TIMESTAMP_CODE =
  "SITEMAP_INVALID_TIMESTAMP" as const;

/** Largest absolute date `Date` can represent (ms since epoch). */
const MAX_DATE_MS = 8.64e15;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Why a configured base URL could not be used as-is. */
export type SitemapBaseUrlRejection =
  | "unparsable"
  | "unsupported-protocol"
  | "invalid-characters";

/** Parts stripped from an otherwise valid base URL. */
export type SitemapSanitisedPart = "credentials" | "query" | "hash";

export interface ResolvedSitemapBaseUrl {
  /**
   * Absolute origin plus optional base path, normalised without a trailing
   * slash — e.g. `https://app.example` or `https://example.com/docs`.
   */
  base: string;
  /** True when {@link DEFAULT_SITE_URL} is in use because `raw` was rejected. */
  usedFallback: boolean;
  /** Present only when `usedFallback` is true. */
  rejection?: SitemapBaseUrlRejection;
  /** Scheme of the rejected value when one could be read. Never host or path. */
  rejectedProtocol?: string;
  /** Parts that were dropped from an otherwise valid value. */
  sanitised: SitemapSanitisedPart[];
}

export interface SitemapBuildOptions {
  /**
   * Configured site URL. Defaults to `NEXT_PUBLIC_SITE_URL`; a blank or absent
   * value is treated as "not configured" and is not reported.
   */
  siteUrl?: string;
  /**
   * Reproducible-build timestamp (seconds since the epoch). Defaults to
   * `SOURCE_DATE_EPOCH`. Injectable so the timing boundaries are testable
   * without mutating process state.
   */
  sourceDateEpoch?: string;
  /** Route list. Defaults to {@link SITEMAP_ROUTES}. */
  routes?: readonly string[];
  /** Clock seam. Defaults to `() => new Date()`. Invoked at most once (S9). */
  now?: () => Date;
  /** Report seam. Defaults to the central `reportError`. Never deduplicated. */
  report?: ErrorReporter;
  /**
   * URL-resolution seam. Defaults to `new URL(path, base)`. Injectable so a
   * platform-level parser failure can be exercised deterministically.
   */
  resolveUrl?: (path: string, base: string) => URL;
  /**
   * Document size cap. Defaults to {@link SITEMAP_MAX_URLS}; a non-finite or
   * sub-1 value falls back to that limit, so the cap can never be disabled by a
   * bad input. Overridable so the boundary is testable without building a
   * 50,000-entry document.
   */
  maxUrls?: number;
}

// ---------------------------------------------------------------------------
// Base URL resolution
// ---------------------------------------------------------------------------

/** Collapses duplicate slashes and removes any trailing slash. */
function normalisePathname(pathname: string): string {
  const collapsed = pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return collapsed;
}

/**
 * Validates a configured site URL and, when it is unusable, returns the
 * documented fallback together with the reason (S1, S2, S6).
 *
 * Pure: it reads no clock, no globals and no mutable state, and the caller
 * decides whether the reason is worth reporting. That purity is what makes
 * concurrent invocation safe — the resolution depends only on `raw`.
 */
export function resolveSitemapBaseUrl(
  raw: string | undefined,
): ResolvedSitemapBaseUrl {
  const trimmed = typeof raw === "string" ? raw.trim() : "";

  // Unset / blank is a legitimate configuration (local development), not a
  // misconfiguration, so it is reported as a fallback without a rejection
  // reason and therefore without a warning.
  if (trimmed === "") {
    return { base: DEFAULT_SITE_URL, usedFallback: true, sanitised: [] };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      base: DEFAULT_SITE_URL,
      usedFallback: true,
      rejection: "unparsable",
      sanitised: [],
    };
  }

  if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
    return {
      base: DEFAULT_SITE_URL,
      usedFallback: true,
      rejection: "unsupported-protocol",
      rejectedProtocol: parsed.protocol.replace(/:$/, ""),
      sanitised: [],
    };
  }

  // `new URL` either throws or yields a non-empty host for http(s), so there is
  // no "parsed but hostless" case to handle here. What can still reach the XML
  // verbatim is a raw value carrying whitespace or a control character, which
  // the parser would silently percent-encode into a URL the operator did not
  // write. Reject it rather than serve something different from what was set.
  if (hasUnsafeBaseUrlChars(trimmed)) {
    return {
      base: DEFAULT_SITE_URL,
      usedFallback: true,
      rejection: "invalid-characters",
      sanitised: [],
    };
  }

  // `URL.origin` is scheme + host + port only: it can never contain userinfo,
  // a query string or a fragment, so the value composed below cannot leak
  // credentials into a document served to every crawler. Their presence is
  // still recorded and reported, because embedding credentials or a token in a
  // public `NEXT_PUBLIC_*` value is a configuration fault worth surfacing.
  const sanitised: SitemapSanitisedPart[] = [];
  if (parsed.username !== "" || parsed.password !== "") {
    sanitised.push("credentials");
  }
  if (parsed.search !== "") {
    sanitised.push("query");
  }
  if (parsed.hash !== "") {
    sanitised.push("hash");
  }

  return {
    base: `${parsed.origin}${normalisePathname(parsed.pathname)}`,
    usedFallback: false,
    sanitised,
  };
}

// ---------------------------------------------------------------------------
// Timestamp resolution
// ---------------------------------------------------------------------------

/**
 * Resolves the single logical `lastModified` value shared by every entry (S5)
 * as a primitive millisecond count.
 *
 * Returning a primitive — never a `Date` — is the isolation guarantee behind
 * S8: a `Date` is mutable, and handing the clock's own instance to a document
 * lets a consumer that mutates one entry rewrite every entry, the clock, and
 * every document built afterwards. `buildEntries` mints a distinct `Date` per
 * entry from this value instead.
 *
 * Fallback chain (each rung must yield a *finite* millisecond value, so the
 * result is always serialisable — S2):
 *
 *   1. `SOURCE_DATE_EPOCH` (seconds, the reproducible-builds convention) when
 *      present, numeric, non-negative and within the `Date` range. Makes
 *      repeated builds emit an identical document.
 *   2. The injected clock, invoked at most once (S9) and guarded: a clock
 *      that throws, returns a non-`Date`, or returns an Invalid Date is
 *      reported, not propagated.
 *   3. `Date.now()` — the wall clock, for the case where the injected clock is
 *      broken but the platform is not.
 *   4. Epoch 0 — always finite and always serialisable. This last rung exists
 *      because the previous implementation fell back to `new Date()` when the
 *      clock was invalid; if the *process* clock itself was broken (a mocked
 *      or damaged platform clock), that fallback was equally invalid and the
 *      entries carried `Invalid Date`, which made Next's serialiser throw and
 *      turned `/sitemap.xml` into a 500.
 *
 * Every refusal is reported with {@link SITEMAP_INVALID_TIMESTAMP_CODE} and a
 * `source` discriminator; the two sources are distinct conditions and the
 * dedupe key in {@link conditionSignature} keeps them from swallowing each
 * other (S6).
 */
export function resolveLastModifiedMs(
  now: () => Date,
  report: ErrorReporter,
  sourceDateEpoch: string | undefined,
): number {
  if (sourceDateEpoch !== undefined && sourceDateEpoch.trim() !== "") {
    const seconds = Number(sourceDateEpoch);
    const ms = seconds * 1000;
    if (
      Number.isFinite(seconds) &&
      seconds >= 0 &&
      Math.abs(ms) <= MAX_DATE_MS
    ) {
      return ms;
    }
    report(
      new Error(
        "SOURCE_DATE_EPOCH is not a usable timestamp; using the current time.",
      ),
      "sitemap",
      "warn",
      { code: SITEMAP_INVALID_TIMESTAMP_CODE, source: "SOURCE_DATE_EPOCH" },
    );
  }

  try {
    const current = now();
    if (current instanceof Date) {
      const ms = current.getTime();
      if (Number.isFinite(ms)) return ms;
    }
  } catch {
    // A throwing clock is treated exactly like an invalid one: reported and
    // replaced, never propagated (S2).
  }

  report(
    new Error(
      "Sitemap clock returned an invalid date; using the current time.",
    ),
    "sitemap",
    "warn",
    { code: SITEMAP_INVALID_TIMESTAMP_CODE, source: "clock" },
  );

  const wall = Date.now();
  if (Number.isFinite(wall)) return wall;

  // The platform clock itself is unusable. Epoch 0 keeps the document valid
  // and serialisable; the report above makes the degradation diagnosable.
  return 0;
}

// ---------------------------------------------------------------------------
// Entry construction
// ---------------------------------------------------------------------------

export interface SitemapRouteBuild {
  entries: MetadataRoute.Sitemap;
  /** Number of routes dropped by validation or by a resolver failure. */
  dropped: number;
  /** True when the protocol URL cap forced a truncation. */
  truncated: boolean;
}

/**
 * Builds the sitemap body for a resolved base URL (S1, S3, S4, S8).
 *
 * Every route is built in isolation: a rejected or failing route is counted and
 * reported and the remaining routes still ship, so one bad entry degrades the
 * document instead of emptying it. Each entry receives its own `Date` instance
 * minted from `lastModifiedMs`, so entries never alias each other or the clock
 * (S8) while still sharing one logical timestamp (S5).
 */
function buildEntries(
  base: string,
  routes: readonly string[],
  lastModifiedMs: number,
  report: ErrorReporter,
  resolveUrl: (path: string, base: string) => URL,
  maxUrls: number,
): SitemapRouteBuild {
  const entries: MetadataRoute.Sitemap = [];
  const seen = new Set<string>();
  let dropped = 0;
  let truncated = false;

  for (const route of routes) {
    if (entries.length >= maxUrls) {
      truncated = true;
      dropped += 1;
      continue;
    }

    // A non-string route is junk input, not a spelling of the home route:
    // drop and report it rather than silently emitting the base URL for it.
    // Only the `typeof` name is logged, never a stringification of the value,
    // which could be attacker-controlled or enormous (S6).
    if (typeof route !== "string") {
      dropped += 1;
      report(
        new Error(
          `Skipped a sitemap route that was not a string: <${typeof route}>.`,
        ),
        "sitemap",
        "warn",
        { code: SITEMAP_ROUTE_DROPPED_CODE, reason: "invalid-route" },
      );
      continue;
    }

    const trimmed = route.trim();
    const isHome = trimmed === "" || trimmed === "/";

    let url: string;
    if (isHome) {
      // Home keeps the configured base verbatim so the emitted URL matches the
      // previous implementation byte for byte (no trailing slash).
      url = base;
    } else {
      const relative = trimmed.replace(/^\/+/, "");
      if (!isSafeRoutePath(relative)) {
        dropped += 1;
        report(
          new Error(
            `Skipped an unusable sitemap route: ${describeRoute(trimmed)}.`,
          ),
          "sitemap",
          "warn",
          { code: SITEMAP_ROUTE_DROPPED_CODE, reason: "invalid-route" },
        );
        continue;
      }

      try {
        // Relative resolution keeps a configured base path (`https://x/docs`)
        // in front of every route and cannot produce a double slash.
        url = resolveUrl(relative, `${base}/`).toString();
      } catch {
        dropped += 1;
        report(
          new Error(
            `Skipped a sitemap route whose URL could not be resolved: ${describeRoute(trimmed)}.`,
          ),
          "sitemap",
          "warn",
          { code: SITEMAP_ROUTE_DROPPED_CODE, reason: "unresolvable-route" },
        );
        continue;
      }
    }

    // Re-validate the resolver's output: S1 is enforced, not assumed.
    if (!isAbsoluteHttpUrl(url)) {
      dropped += 1;
      report(
        new Error(
          `Skipped a sitemap route that did not resolve to an absolute http(s) URL: ${describeRoute(trimmed)}.`,
        ),
        "sitemap",
        "warn",
        { code: SITEMAP_ROUTE_DROPPED_CODE, reason: "not-absolute-http" },
      );
      continue;
    }

    if (seen.has(url)) {
      // Duplicate route: collapse to the first occurrence (S4).
      dropped += 1;
      continue;
    }
    seen.add(url);
    entries.push({ url, lastModified: new Date(lastModifiedMs) });
  }

  return { entries, dropped, truncated };
}

/**
 * True when a route can be safely appended to the base as a relative path.
 *
 * Rejects anything outside the `pchar` allowlist (S1) plus `.`, `..` and empty
 * segments, so a route can never escape the configured base directory or smuggle
 * a query, fragment or percent-encoded control character into the output.
 */
function isSafeRoutePath(relative: string): boolean {
  if (relative === "" || !SAFE_ROUTE_CHARS.test(relative)) return false;
  return relative
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/** True when `value` is an absolute `http(s)` URL with no embedded credentials. */
function isAbsoluteHttpUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    ALLOWED_PROTOCOLS.includes(parsed.protocol) &&
    parsed.hostname !== "" &&
    parsed.username === "" &&
    parsed.password === ""
  );
}

/**
 * Describes a route for a log message without echoing attacker-controlled or
 * credential-bearing content: only its length and character classes.
 */
function describeRoute(route: string): string {
  const routePath = route.split(/[?#]/)[0];
  return `<${routePath.length} chars, ${/^[a-z0-9/_\-.]*$/i.test(routePath) ? "safe chars" : "unexpected chars"}>`;
}

// ---------------------------------------------------------------------------
// Reporter containment
// ---------------------------------------------------------------------------

/**
 * Wraps a reporter so a broken diagnostic sink can never take the route down
 * (S2). `buildSitemap` reports through the wrapped function exclusively.
 *
 * On failure a single fixed note goes to `console.error` outside production.
 * Neither the report payload nor the sink's exception is echoed: the payload
 * can embed configuration detail and the exception can embed arbitrary
 * sink-internal state.
 */
function guardReporter(report: ErrorReporter): ErrorReporter {
  return (error, context, level, meta) => {
    try {
      report(error, context, level, meta);
    } catch {
      if (process.env.NODE_ENV !== "production") {
        try {
          console.error(
            `[sitemap] the error reporter failed while reporting a '${context}' condition; the report was dropped.`,
          );
        } catch {
          // The console itself is unusable; there is nothing left to do.
        }
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Once-per-condition report memo
// ---------------------------------------------------------------------------

/**
 * Builds the dedupe key for a report (S6, S7).
 *
 * Every field that discriminates one condition from another participates:
 * `code`, `reason`, `source` and the `sanitised` combination. The previous key
 * omitted `source`, so the two distinct `SITEMAP_INVALID_TIMESTAMP` conditions
 * (a bad `SOURCE_DATE_EPOCH` and a broken clock) produced the same signature
 * and the second was silently swallowed — a violation of S6 that made a real
 * misconfiguration undiagnosable.
 *
 * All components come from fixed vocabularies above, so the key space is
 * small; {@link createSitemapReportMemo} additionally hard-caps it (S7).
 */
function conditionSignature(
  context: string,
  meta: Record<string, unknown> | undefined,
): string {
  const code = typeof meta?.code === "string" ? meta.code : "unknown";
  const reason = typeof meta?.reason === "string" ? meta.reason : "";
  const source = typeof meta?.source === "string" ? meta.source : "";
  const sanitised = Array.isArray(meta?.sanitised)
    ? meta.sanitised.join("+")
    : "";
  return `${context}|${code}|${reason}|${source}|${sanitised}`;
}

/** Options for {@link createSitemapReportMemo}. */
export interface SitemapReportMemoOptions {
  /**
   * Memo capacity. Defaults to {@link SITEMAP_MAX_REPORTED_CONDITIONS}; a
   * non-finite or sub-1 value falls back to that default, so the bound can
   * never be disabled by a bad input. Overridable so the eviction behaviour
   * is testable without firing 64 distinct conditions.
   */
  maxEntries?: number;
}

/** A bounded, once-per-condition reporter. */
export interface SitemapReportMemo {
  /** Drop-in `ErrorReporter` that delivers each distinct condition once. */
  readonly report: ErrorReporter;
  /** Number of memoised conditions. Exposed for bounds assertions. */
  size(): number;
  /** Empties the memo. Test seam; unused by application code. */
  reset(): void;
}

/**
 * Creates the once-per-condition report memo (S7).
 *
 * `sitemap()` runs on every request to `/sitemap.xml`, so without deduplication
 * a misconfigured deployment would emit an identical warning per request. The
 * memo:
 *
 * - is a single frozen instance created once per process — overlapping calls
 *   share exactly one bounded structure instead of allocating a fresh closure
 *   per request;
 * - is hard-capped at `maxEntries` with oldest-first eviction (`Set` iterates
 *   in insertion order), so memory is bounded by construction even if the key
 *   vocabulary ever grows;
 * - marks a condition *before* delivery, so a sink that throws is contained
 *   and the same condition is not retried — and re-thrown — on every request;
 * - keeps the production-visibility `console.warn` for a rejected site URL:
 *   the default reporter is a no-op when NODE_ENV=production, and a sitemap
 *   that silently serves `localhost` URLs to crawlers is a real, hard-to-
 *   diagnose SEO bug. Only the reason and the fallback are printed — never
 *   the configured value, which may embed credentials, a hostname or a
 *   private path (S6). A console that throws is contained (S2).
 */
export function createSitemapReportMemo(
  report: ErrorReporter,
  options: SitemapReportMemoOptions = {},
): SitemapReportMemo {
  const maxEntries =
    Number.isFinite(options.maxEntries) && (options.maxEntries as number) >= 1
      ? Math.floor(options.maxEntries as number)
      : SITEMAP_MAX_REPORTED_CONDITIONS;

  const seen = new Set<string>();

  const memoised: ErrorReporter = (error, context, level = "error", meta) => {
    const signature = conditionSignature(context, meta);
    if (seen.has(signature)) return;

    if (seen.size >= maxEntries) {
      const oldest = seen.values().next();
      if (!oldest.done) seen.delete(oldest.value);
    }
    // Mark-before-delivery: a throwing sink must not turn one misconfiguration
    // into an exception on every request (S2) or an unbounded retry loop (S7).
    seen.add(signature);

    try {
      report(error, context, level, meta);
    } catch {
      // Contained: diagnostics are best-effort and never break generation.
    }

    const code = typeof meta?.code === "string" ? meta.code : "unknown";
    if (context === "sitemap" && code === SITEMAP_SITE_URL_REJECTED_CODE) {
      const reason = typeof meta?.reason === "string" ? meta.reason : "unknown";
      try {
        console.warn(
          `[sitemap] NEXT_PUBLIC_SITE_URL rejected (${reason}); falling back to ${DEFAULT_SITE_URL}.`,
        );
      } catch {
        // Contained: an unusable console must not break generation.
      }
    }
  };

  return Object.freeze({
    report: Object.freeze(memoised),
    size: () => seen.size,
    reset: () => {
      seen.clear();
    },
  });
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

/**
 * Pure, dependency-injectable sitemap builder.
 *
 * Never throws (S2): every failure mode — rejected route, rejected base URL,
 * broken clock, broken reporter — degrades to a smaller (or default-based)
 * valid, serialisable document plus a best-effort report. `sitemap()` is the
 * thin Next.js entry point over this.
 *
 * The build is fully synchronous and reads each environment input exactly once
 * on entry (S9), so concurrent invocations cannot interleave mid-document and
 * each document is internally consistent with a single configuration snapshot.
 * There is deliberately no result cache: the computation is cheap, and a cache
 * would be the one place a stale environment value could be served from.
 */
export function buildSitemap(
  options: SitemapBuildOptions = {},
): MetadataRoute.Sitemap {
  // S9: both environment reads happen here, once, before any other work.
  const {
    siteUrl = process.env.NEXT_PUBLIC_SITE_URL,
    sourceDateEpoch = process.env.SOURCE_DATE_EPOCH,
    routes = SITEMAP_ROUTES,
    now = () => new Date(),
    report = reportError,
    resolveUrl = (path: string, against: string) => new URL(path, against),
    maxUrls = SITEMAP_MAX_URLS,
  } = options;

  // A broken diagnostic sink must never break document generation (S2).
  const safeReport = guardReporter(report);

  // A bad cap must never disable the protocol limit (S4).
  const urlLimit =
    Number.isFinite(maxUrls) && maxUrls >= 1
      ? Math.floor(maxUrls)
      : SITEMAP_MAX_URLS;

  const resolved = resolveSitemapBaseUrl(siteUrl);

  if (resolved.rejection) {
    safeReport(
      new Error(
        "NEXT_PUBLIC_SITE_URL was rejected; falling back to the default origin.",
      ),
      "sitemap",
      "warn",
      {
        code: SITEMAP_SITE_URL_REJECTED_CODE,
        reason: resolved.rejection,
        protocol: resolved.rejectedProtocol,
        fallback: DEFAULT_SITE_URL,
      },
    );
  } else if (resolved.sanitised.length > 0) {
    safeReport(
      new Error("NEXT_PUBLIC_SITE_URL was sanitised before use."),
      "sitemap",
      "warn",
      {
        code: SITEMAP_SITE_URL_SANITIZED_CODE,
        sanitised: resolved.sanitised,
      },
    );
  }

  const lastModifiedMs = resolveLastModifiedMs(
    now,
    safeReport,
    sourceDateEpoch,
  );
  const { entries, dropped, truncated } = buildEntries(
    resolved.base,
    routes,
    lastModifiedMs,
    safeReport,
    resolveUrl,
    urlLimit,
  );

  if (truncated) {
    safeReport(
      new Error("Sitemap exceeded the protocol URL limit and was truncated."),
      "sitemap",
      "warn",
      { code: SITEMAP_TRUNCATED_CODE, limit: urlLimit, dropped },
    );
  }

  // S3: the base entry is re-added only if a caller-supplied route list was so
  // broken that the home route never made it. `SITEMAP_ROUTES` always includes
  // it, so this only triggers for an empty/hostile route list. The entry gets
  // its own Date like every other (S8).
  if (entries.length === 0) {
    entries.push({
      url: resolved.base,
      lastModified: new Date(lastModifiedMs),
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Next.js entry point
// ---------------------------------------------------------------------------

/**
 * The process-wide report memo (S7): one frozen instance created at module
 * load, shared by every invocation of `sitemap()`. Mirrors the module-scoped
 * resolver pattern used by `robots.ts` (#1252): bounded, frozen, and owned by
 * the module rather than re-allocated per request.
 */
const sitemapReportMemo = createSitemapReportMemo(reportError);

/**
 * Generates sitemap.xml for every public static route.
 *
 * Safe under concurrent and repeated invocation: the build is synchronous and
 * snapshot-isolated (S9), the result is exclusively owned by the caller (S8),
 * and diagnostics are deduplicated through a single bounded memo (S7).
 *
 * @returns Sitemap entries with a single shared lastModified date.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap({ report: sitemapReportMemo.report });
}

/**
 * Test-only hook: clears the process-wide report memo so a suite can observe
 * first-refusal logging again without reloading the module. Mirrors
 * `__resetRobotsResolverForTests`. Not part of the Next.js metadata route
 * contract and unused by application code.
 */
export function __resetSitemapReportMemoForTests(): void {
  sitemapReportMemo.reset();
}
