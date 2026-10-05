import type { MetadataRoute } from "next";
import { reportError, type ErrorReporter } from "../lib/errorReporter";

/**
 * Deterministic sitemap generation with recoverable failures (#1256) and
 * hardened concurrent/repeated execution (#1257).
 *
 * `/sitemap.xml` is generated per request in development and once per build
 * worker in production, and Next.js hands the result straight to its XML
 * serialiser. Every run must land on the same answer for the same inputs:
 * crawlers re-fetch the route constantly, and a sitemap that changes shape
 * between requests (or between processes) makes indexing behaviour impossible
 * to reason about. Three classes of problem used to break that:
 *
 *   1. `NEXT_PUBLIC_SITE_URL` was trusted verbatim. A typo (`https:/app.com`),
 *      a protocol-relative value (`//evil.com`), a non-HTTP scheme
 *      (`javascript:`, `file:`), embedded credentials, or a base with a path
 *      prefix all produced a silently malformed — or unsafe — document, and
 *      nothing was logged.
 *   2. Nothing validated the result, so one bad route took the whole document
 *      down instead of degrading to a smaller correct sitemap.
 *   3. Repeated or concurrent execution shared mutable state: every entry held
 *      the *clock's own* `Date` instance, the caller's route array was read
 *      lazily while the document was being built, and a throwing reporter or a
 *      throwing clock escaped the route. A consumer touching one entry could
 *      therefore poison later documents, one bad input could turn the route
 *      into a 500, and a broken process clock produced `Invalid Date` stamps
 *      that Next.js could not serialise at all.
 *
 * Concurrency model (see S8–S10 below): the builder is *synchronous* and
 * side-effect free apart from the once-per-condition reports in S10, so two
 * concurrent requests cannot interleave inside it. What can cross-contaminate
 * them is shared mutable state — the clock's `Date` instance, the caller's
 * array, and the process-wide report memo — and each of those is isolated
 * explicitly. Deliberately, the document is *not* cached: there is no TTL and
 * nothing survives a call, so a response can never be stale relative to the
 * inputs that produced it.
 *
 * Invariants (each asserted in `src/app/__tests__/sitemap.test.ts`):
 *
 *   S1 – Every entry is an absolute `http(s)` URL. Nothing relative, nothing
 *        with credentials, nothing with a foreign scheme ever reaches output.
 *   S2 – The function never throws and always returns a serialisable document.
 *        A rejected route is dropped and reported; a rejected base URL falls
 *        back to {@link DEFAULT_SITE_URL}; a throwing or invalid clock, and a
 *        throwing report sink, are contained.
 *   S3 – Never empty. A sitemap with zero URLs is invalid and makes crawlers
 *        drop the site, so the base entry is always emitted.
 *   S4 – Deterministic order and cardinality. Declaration order is preserved,
 *        duplicates collapse to their first occurrence, and the URL count is
 *        capped at the protocol limit of {@link SITEMAP_MAX_URLS}.
 *   S5 – One timestamp per document, captured once, so a single response never
 *        mixes `lastModified` values. Set `SOURCE_DATE_EPOCH` to make it
 *        reproducible across builds.
 *   S6 – No silent degradation. Every rejection is reported with a stable code
 *        and the *reason* only — never the offending value, which can carry
 *        credentials, hostnames or paths.
 *   S7 – Reports are emitted once per distinct condition per process, so a hot
 *        `/sitemap.xml` route cannot flood the logs or grow memory. The key
 *        space is the fixed code + reason vocabulary, so the set is bounded.
 *   S8 – Isolation between invocations. Each call returns a fresh array of
 *        fresh entry objects, each entry owns a *distinct* `Date`, and nothing
 *        in the result aliases the clock, the frozen route list or another
 *        document. Mutating a returned entry cannot change a later document.
 *   S9 – One input snapshot per document. `NEXT_PUBLIC_SITE_URL`,
 *        `SOURCE_DATE_EPOCH` and the route list are read exactly once at entry
 *        and the clock is invoked at most once, so a concurrent mutation of
 *        `process.env` (or of the caller's array) cannot produce a torn
 *        document that mixes two configurations.
 *   S10 – The report memo is hard-bounded and collision-free. It is one frozen
 *        instance per process, capped at {@link SITEMAP_MAX_REPORTED_CONDITIONS}
 *        with oldest-first eviction, and a condition is marked *before* it is
 *        delivered, so a throwing sink is attempted once per condition rather
 *        than once per request. Distinct conditions always have distinct keys.
 *
 * No user data is read or written here, so repeated or concurrent generation is
 * side-effect free apart from the deduplicated reports in S10.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Documented fallback origin. Preserved from the original implementation. */
export const DEFAULT_SITE_URL = "http://localhost:3000";

/**
 * Ordered public routes. `'/'` is the site root and always resolves to the
 * configured base without a trailing slash, which is what the previous
 * implementation emitted. Frozen: it is shared by every invocation and must
 * never be mutated by a caller.
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
 * Upper bound on distinct report conditions memoised per process (S10).
 *
 * Far above the fixed code/reason vocabulary the module can produce, so in
 * normal operation nothing is ever evicted; the cap exists so a future
 * misconfigured meta field cannot turn the memo into an unbounded leak in a
 * long-lived server.
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
export const SITEMAP_ROUTES_REJECTED_CODE = "SITEMAP_ROUTES_REJECTED" as const;
export const SITEMAP_TRUNCATED_CODE = "SITEMAP_TRUNCATED" as const;
export const SITEMAP_INVALID_TIMESTAMP_CODE =
  "SITEMAP_INVALID_TIMESTAMP" as const;

/** Largest absolute date `Date` can represent (ms since epoch). */
const MAX_DATE_MS = 8.64e15;

/**
 * Meta fields that may distinguish two otherwise identical conditions (S10).
 *
 * The list is deliberately a fixed vocabulary rather than "every field", for
 * two reasons: every value here is drawn from a small closed set (`typeof`
 * names, reason codes, constant flags), which keeps the memo's key space — and
 * therefore its memory — bounded even if the FIFO cap were ever removed; and a
 * future value-bearing field (a count, for instance) cannot silently multiply
 * the key space. A new report that needs its own dedupe bucket must add its
 * field here and be documented in `docs/route-failure-recovery.md`.
 */
const REPORT_KEY_FIELDS: readonly string[] = Object.freeze([
  "code",
  "reason",
  "source",
  "type",
  "sanitised",
]);

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
   * Route list. Defaults to {@link SITEMAP_ROUTES}. Snapshotted on entry (S9);
   * a non-array value is refused and reported rather than iterated.
   */
  routes?: readonly string[];
  /** Clock seam. Defaults to `() => new Date()`. Invoked at most once per document (S9). */
  now?: () => Date;
  /**
   * Report seam. Defaults to the central `reportError`. Never deduplicated, but
   * a reporter that throws is contained so it cannot break the document (S2).
   */
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

/** Options for {@link createSitemapReportMemo}. */
export interface SitemapReportMemoOptions {
  /**
   * Maximum number of distinct conditions memoised. Non-finite or sub-1 values
   * fall back to {@link SITEMAP_MAX_REPORTED_CONDITIONS}, so the bound can
   * never be disabled by a bad input. Injectable so the eviction boundary is
   * testable without producing 64 distinct conditions.
   */
  maxEntries?: number;
}

/**
 * Bounded, process-wide dedupe memo for sitemap reports (S7, S10).
 *
 * Shaped like `createSiteUrlResolver` from `src/lib/siteUrl.ts` so the two
 * metadata routes have one mental model: a frozen handle exposing the wrapped
 * reporter plus `size()`/`reset()` for bounds assertions.
 */
export interface SitemapReportMemo {
  /** The deduplicating reporter. Safe to pass as `SitemapBuildOptions.report`. */
  readonly report: ErrorReporter;
  /** Number of memoised conditions. Exposed for bounds assertions. */
  size(): number;
  /** Empties the memo. Test-only; production never resets it. */
  reset(): void;
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
 * Pure: the caller decides whether the reason is worth reporting, and repeated
 * or concurrent calls depend on nothing but `raw`.
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
 * Reads the clock seam, returning `undefined` when it produced nothing usable
 * (S2, S5).
 *
 * A clock that throws is treated exactly like one that returns a non-`Date` or
 * an `Invalid Date`: the failure is reported and the caller moves on. Only the
 * shape of the failure is recorded, never the thrown value.
 */
function readClockMs(
  now: () => Date,
  report: ErrorReporter,
): number | undefined {
  let current: unknown;
  try {
    current = now();
  } catch {
    report(
      new Error("The sitemap clock threw; using the current time."),
      "sitemap",
      "warn",
      {
        code: SITEMAP_INVALID_TIMESTAMP_CODE,
        reason: "clock-threw",
        source: "clock",
      },
    );
    return undefined;
  }

  const ms = current instanceof Date ? current.getTime() : Number.NaN;
  if (Number.isFinite(ms)) {
    return ms;
  }

  report(
    new Error(
      "Sitemap clock returned an invalid date; using the current time.",
    ),
    "sitemap",
    "warn",
    {
      code: SITEMAP_INVALID_TIMESTAMP_CODE,
      reason: "clock-invalid",
      source: "clock",
    },
  );
  return undefined;
}

/**
 * Resolves the single `lastModified` value shared by every entry (S5, S8).
 *
 * Returns a **primitive** millisecond count rather than a `Date`, so no caller
 * can alias the clock's instance: {@link buildEntries} mints a distinct `Date`
 * per entry from this number.
 *
 * `SOURCE_DATE_EPOCH` (seconds, the reproducible-builds convention) wins when
 * present and valid, which makes repeated builds emit an identical document.
 * The fallback chain is total — epoch, then the injected clock, then
 * `Date.now()`, then the epoch — so every stamp is a finite, serialisable
 * number. The last resort matters: an `Invalid Date` reaching Next's XML
 * serialiser raises `RangeError: Invalid time value` and turns the route into a
 * 500, which is the one failure this route must never produce.
 */
function resolveLastModifiedMs(
  epochRaw: string | undefined,
  now: () => Date,
  report: ErrorReporter,
): number {
  if (typeof epochRaw === "string" && epochRaw.trim() !== "") {
    const seconds = Number(epochRaw);
    const ms = seconds * 1000;
    if (
      Number.isFinite(seconds) &&
      seconds >= 0 &&
      Number.isFinite(ms) &&
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
      {
        code: SITEMAP_INVALID_TIMESTAMP_CODE,
        reason: "unusable-epoch",
        source: "SOURCE_DATE_EPOCH",
      },
    );
  }

  const fromClock = readClockMs(now, report);
  if (fromClock !== undefined) {
    return fromClock;
  }

  // `Date.now()` is a primitive read of the platform clock; it cannot carry an
  // invalid `Date` value across, which is what makes this a safe last resort.
  const wallClock = Date.now();
  if (Number.isFinite(wallClock)) {
    return wallClock;
  }

  report(
    new Error("The platform clock is unusable; falling back to the epoch."),
    "sitemap",
    "warn",
    {
      code: SITEMAP_INVALID_TIMESTAMP_CODE,
      reason: "unserialisable-clock",
      source: "system",
    },
  );
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
 * document instead of emptying it.
 *
 * `routes` is expected to be the snapshot taken by {@link buildSitemap} (S9) —
 * this function never reads the caller's array — and `lastModifiedMs` is a
 * primitive, so each entry below owns its own `Date` (S8).
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

    // A non-string route is a programming error, not a route. It used to be
    // coerced to `''` and therefore to the home entry, which silently emitted a
    // duplicate document entry and reported nothing (S6). Only the `typeof`
    // name is recorded — never the value, which is not validated and may be
    // anything at all.
    if (typeof route !== "string") {
      dropped += 1;
      report(
        new Error("Skipped a sitemap route that was not a string."),
        "sitemap",
        "warn",
        {
          code: SITEMAP_ROUTE_DROPPED_CODE,
          reason: "not-a-string",
          type: typeof route,
        },
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
    // S8: a distinct `Date` per entry, built from the primitive stamp, so no
    // two entries (and no two invocations) share a mutable instance.
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
// Report containment and memoisation
// ---------------------------------------------------------------------------

/**
 * Wraps a report sink so a throwing implementation cannot escape (S2).
 *
 * Reporting is best-effort by contract: a broken sink must never take the
 * route down, and it must never cause the report to be retried. The fallback
 * note is fixed text — the payload is deliberately not echoed, because a
 * report can carry host and route information and the sink is the component
 * that already failed once.
 */
function guardReporter(report: ErrorReporter): ErrorReporter {
  return (error, context, level, meta) => {
    try {
      report(error, context, level, meta);
    } catch {
      if (process.env.NODE_ENV !== "production") {
        console.error(
          "[sitemap] the error reporter threw; the report was dropped.",
        );
      }
    }
  };
}

/**
 * Renders the dedupe signature of a condition (S7, S10).
 *
 * Only {@link REPORT_KEY_FIELDS} participate, so two conditions that differ in
 * any distinguishing field (`reason`, `source`, `type`, `sanitised`) can never
 * collide — omitting `source` used to make the two
 * `SITEMAP_INVALID_TIMESTAMP` conditions (unusable `SOURCE_DATE_EPOCH` versus a
 * broken clock) share one signature, so the second was silently swallowed.
 */
function conditionSignature(
  context: string,
  meta?: Record<string, unknown>,
): string {
  const parts = [context];
  for (const field of REPORT_KEY_FIELDS) {
    const value = meta?.[field];
    if (Array.isArray(value)) {
      parts.push(`${field}=${value.map((item) => String(item)).join("+")}`);
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      parts.push(`${field}=${String(value)}`);
    } else {
      parts.push(`${field}=`);
    }
  }
  return parts.join("|");
}

/**
 * Creates the once-per-condition report memo used by the Next.js entry point
 * (S7, S10).
 *
 * `sitemap()` runs on every request to `/sitemap.xml`, so without deduplication
 * a misconfigured deployment would emit an identical warning per request. The
 * memo lives here rather than inside {@link buildSitemap} so the pure builder
 * stays trivially testable and free of process state.
 *
 * Invariants:
 * - At most `maxEntries` conditions are remembered; the oldest is evicted first.
 * - A condition is marked *before* it is delivered, so a sink that throws is
 *   attempted once per condition, not once per request.
 * - The returned handle and its reporter are frozen, so overlapping callers
 *   cannot swap the sink out from under each other.
 * - Deduplication is per process and never resets itself; a *new* invalid value
 *   is still reported because the signature does not depend on request order.
 */
export function createSitemapReportMemo(
  sink: ErrorReporter,
  options: SitemapReportMemoOptions = {},
): SitemapReportMemo {
  const limit =
    Number.isFinite(options.maxEntries) && (options.maxEntries as number) >= 1
      ? Math.floor(options.maxEntries as number)
      : SITEMAP_MAX_REPORTED_CONDITIONS;

  const safeSink = guardReporter(sink);
  const delivered = new Map<string, true>();

  const report: ErrorReporter = (error, context, level, meta) => {
    const signature = conditionSignature(context, meta);
    if (delivered.has(signature)) return;

    // S10: oldest-first eviction bounds memory; marking before delivery bounds
    // repeated work when the sink itself fails.
    if (delivered.size >= limit) {
      const oldest = delivered.keys().next();
      if (!oldest.done) delivered.delete(oldest.value);
    }
    delivered.set(signature, true);

    safeSink(error, context, level, meta);

    // The default reporter is a no-op when NODE_ENV=production, and a sitemap
    // that silently serves `localhost` URLs to crawlers is a real, hard-to-
    // diagnose SEO bug. Surface the misconfiguration in production logs too.
    // Only the reason and the fallback are printed — never the configured
    // value, which may embed credentials, a hostname or a private path.
    if (
      context === "sitemap" &&
      meta?.code === SITEMAP_SITE_URL_REJECTED_CODE
    ) {
      console.warn(
        `[sitemap] NEXT_PUBLIC_SITE_URL rejected (${String(meta?.reason)}); falling back to ${DEFAULT_SITE_URL}.`,
      );
    }
  };

  const memo: SitemapReportMemo = {
    report: Object.freeze(report),
    size: () => delivered.size,
    reset: () => {
      delivered.clear();
    },
  };
  return Object.freeze(memo);
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

/**
 * Pure, dependency-injectable sitemap builder.
 *
 * Never throws and always returns a serialisable document (S2): every failure
 * mode degrades to a smaller valid document plus a report, a throwing sink or
 * clock is contained, and every entry carries a finite `Date`. `sitemap()` is
 * the thin Next.js entry point over this.
 *
 * Safe under repeated and concurrent execution: inputs are snapshotted once
 * (S9), outputs own their state (S8), and the function holds no process state
 * of its own.
 */
export function buildSitemap(
  options: SitemapBuildOptions = {},
): MetadataRoute.Sitemap {
  const {
    siteUrl = process.env.NEXT_PUBLIC_SITE_URL,
    routes = SITEMAP_ROUTES,
    now = () => new Date(),
    report = reportError,
    resolveUrl = (path: string, against: string) => new URL(path, against),
    maxUrls = SITEMAP_MAX_URLS,
  } = options;

  // S9: one input snapshot per document. `NEXT_PUBLIC_SITE_URL` is read by the
  // destructuring above, `SOURCE_DATE_EPOCH` here, and the route list is copied
  // before the first iteration, so a concurrent mutation of the environment or
  // of the caller's array cannot produce a document that mixes configurations
  // (or one describing a different site than the robots.txt next to it).
  const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
  const routeSnapshot: readonly string[] = Array.isArray(routes)
    ? routes.slice()
    : SITEMAP_ROUTES;
  const safeReport = guardReporter(report);

  if (!Array.isArray(routes)) {
    safeReport(
      new Error(
        "The sitemap route list was not an array; using the built-in routes.",
      ),
      "sitemap",
      "warn",
      { code: SITEMAP_ROUTES_REJECTED_CODE, reason: "not-an-array" },
    );
  }

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
    sourceDateEpoch,
    now,
    safeReport,
  );
  const { entries, dropped, truncated } = buildEntries(
    resolved.base,
    routeSnapshot,
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
  // it, so this only triggers for an empty/hostile route list.
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
 * One frozen report memo per process (S10).
 *
 * The memo is module state, not request state: it outlives any single
 * invocation by design, and nothing else in this module does.
 */
const processReportMemo = createSitemapReportMemo(reportError);

/**
 * Generates sitemap.xml for every public static route.
 *
 * @returns Sitemap entries with a single shared lastModified date. A fresh
 *          array of fresh entries per call (S8); no result is ever reused.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap({ report: processReportMemo.report });
}

/**
 * Test-only hook: clears the process report memo so a suite can observe
 * first-refusal logging again. Not part of the Next.js metadata route contract
 * and unused by application code.
 */
export function __resetSitemapReportMemoForTests(): void {
  processReportMemo.reset();
}

/**
 * Test-only hook: number of distinct conditions currently memoised by the
 * process-wide memo, so the bound (S10) can be asserted.
 */
export function __sitemapReportMemoSizeForTests(): number {
  return processReportMemo.size();
}
