Route failure recovery — contracts loading fallback & sitemap
Reference for the two deterministic failure-recovery contracts introduced in
src/app/contracts/loading.tsx (#1166) and src/app/sitemap.ts (#1256).

Both files answer a single question: when something goes wrong on a route,
what does the user (or the operator) see, and is that answer stable?

1. /contracts loading fallback
Code: src/app/contracts/loading.tsx,
src/app/contracts/ContractsLoadingBoundary.tsx
Tests: src/app/contracts/__tests__/loading.test.tsx

State model
text

                    ┌──────────────────────────── retry budget spent ──────────────┐
                    │                                                              ▼
 pending ──(render throws)──▶ failed ──"Try again"──▶ pending ──▶ … ──▶ failed ──▶ failed
    │                          │                        (clean remount)             │
    └──(stall timeout)──▶ pending + "taking longer" notice                  "Reload page"
Phase	Rendered	Reported
pending	shared ContractsSkeleton + one polite live region	—
pending + stalled	skeleton stays mounted, plus a reload affordance	CONTRACTS_LOADING_STALLED at warn
failed	role="alert", "Try again" (or "Reload page"), "Go home"	CONTRACTS_LOADING_FAILED at error
Invariants
#	Invariant	Where
I1	The boundary never reads, writes or clears persisted storage, and never remounts anything above itself — a failure/retry cycle cannot lose contracts, milestones, wallet items or preferences	leaves persisted storage byte-identical…
I2	Retry is re-entrancy safe: concurrent activations yield exactly one transition (retryInFlight latch, counter incremented outside the state updater)	applies at most one transition for two concurrent retry activations
I3	Retries are bounded by MAX_IN_BOUNDARY_RETRIES (3); after that only a hard reload can recover. The counter lives on the instance, not in state, so getDerivedStateFromError cannot reset the budget	bounds retries and falls back to a hard reload
I4	Error messages, stacks and component stacks are never rendered and never enter the report metadata	never leaks the thrown message into the DOM
I5	A stall is a warn, not a failure: the pending render may still succeed, so the skeleton stays and the state never claims an error	keeps the skeleton mounted so the page does not jump
I6	Exactly one polite live region exists; the stall escalates by changing its text	escalates to an actionable notice and re-announces politely
I7	The pending render reads no clock, randomness or environment, so two renders are byte-identical	renders deterministically
Why not a second <main>?
The root layout owns the single <main id="main-content"> landmark. The previous
fallback rendered its own <main>, producing a duplicate landmark (the class of
bug fixed for /milestones in #682). The wrapper is now a <div aria-busy="true">.

Why is the stall budget 30 s?
Long enough that a cold start on a slow connection never trips it, short enough
that a hung request is not an unrecoverable dead end. stallTimeoutMs <= 0 or
NaN disables the watchdog, which degrades to the previous behaviour rather
than escalating immediately.

2. /sitemap.xml
Code: src/app/sitemap.ts
Tests: src/app/__tests__/sitemap.test.ts

Resolution order
NEXT_PUBLIC_SITE_URL, validated: must parse, must be http(s), must not
contain whitespace or control characters. A value the URL parser normalises
(https:/host, https:host) is accepted.
DEFAULT_SITE_URL (http://localhost:3000) — the pre-existing fallback,
emitted byte for byte as before.
Routes come from the frozen SITEMAP_ROUTES and are resolved relatively
against base + '/', so a base path (https://host/docs) is preserved and
no double slash can appear.
Invariants
#	Invariant	Where
S1	Every entry is an absolute http(s) URL with a host and no credentials — enforced on the resolver's output, not assumed	expectOnlyAbsoluteHttpUrls helper, rejects a resolver that leaks credentials…
S2	sitemap() never throws and always returns a serialisable document: a rejected route is dropped, a rejected base falls back, and a throwing/invalid clock or a throwing report sink is contained	never throws for any combination of hostile inputs, contains a throwing report sink…, contains a throwing clock…, never emits an unserialisable stamp…
S3	The document is never empty; the base entry is always emitted	always emits at least the base entry, even for an empty route list
S4	Declaration order preserved, duplicates collapsed to the first occurrence, document capped at SITEMAP_MAX_URLS (50 000)	collapses duplicates…, caps the document at the configured limit…
S5	One timestamp per document, captured once; SOURCE_DATE_EPOCH makes it reproducible, an unusable value falls back and is reported	shares one timestamp…, honours SOURCE_DATE_EPOCH…
S6	Reports carry a stable code and the reason only — never the offending value (which can embed credentials, host or path)	reports a rejected base URL with the reason and never the offending value, drops non-string routes…
S7	Reports are emitted once per distinct condition per process, so a hot route cannot flood logs or grow memory	reports a misconfigured site URL once per process…, the process memo reports a flood of identical failures once
S8	Isolation between invocations. Every call returns a fresh array of fresh entries, each entry owns a distinct Date, and nothing aliases the clock, the frozen route list or another document	gives every entry its own Date…, a consumer mutating a result cannot poison a later document, mutating one racing result cannot corrupt the others
S9	One input snapshot per document. NEXT_PUBLIC_SITE_URL, SOURCE_DATE_EPOCH and the route list are read once per call, and the clock is invoked at most once	snapshots the route list…, reads NEXT_PUBLIC_SITE_URL once…, invokes the clock exactly once per document
S10	The report memo is hard-bounded and collision-free. One frozen instance per process, capped at SITEMAP_MAX_REPORTED_CONDITIONS (64) with oldest-first eviction; a condition is marked before delivery so a throwing sink is attempted once per condition, and the key includes every distinguishing field (reason, source, type, sanitised)	bounds the memo to maxEntries…, keeps conditions distinct when only 'source' differs, marks a condition before delivery…
Concurrent execution model
Next.js calls the default export once per GET /sitemap.xml in development and
once per build worker in production, then hands the result to its XML
serialiser. The builder is synchronous and side-effect free apart from the
memoised reports, so two concurrent requests cannot interleave inside it. What
could cross-contaminate them is shared mutable state, and each source is
handled explicitly:

Shared state	Hazard it used to create	Handling
The clock's Date instance	Every entry shared one mutable Date; a consumer mutating a result rewrote the clock and poisoned later documents (next document stamped 1970)	Timestamps are resolved to a primitive millisecond value and each entry mints its own Date (S5, S8)
The caller's route array	The list was read lazily while the document was being built, so a mutation landing mid-build (e.g. from a report sink) emitted a route that was never in the snapshot	The array is copied once on entry; a non-array input is refused with SITEMAP_ROUTES_REJECTED (S9)
process.env	Base URL and epoch were read at different points of the build, so a concurrent configuration change could mix origins	Both are read exactly once per document (S9)
The process report memo	Unbounded-by-convention dedupe keyed on code + reason, which silently swallowed the second SITEMAP_INVALID_TIMESTAMP condition; a throwing sink was retried on every request	createSitemapReportMemo(): hard cap with oldest-first eviction, source/type in the key, mark-before-delivery, frozen handle (S7, S10)
Deliberately no document is cached: there is no TTL, no module-level
document and no single-flight promise, so a response can never be stale relative
to the inputs that produced it (never serves a stale origin after NEXT_PUBLIC_SITE_URL changes). The expensive work is bounded instead —
duplicate URLs collapse inside a document (S4), repeated and racing invocations
are byte-identical for identical inputs, and logging is once per condition.

Failure containment (and why Invalid Date mattered)
lastModified is handed to Next's XML serialiser, which calls toISOString();
an Invalid Date raises RangeError: Invalid time value and turns the whole
route into a 500 — an unrecoverable response for crawlers. The timestamp chain
is therefore total and ends on a value that cannot be invalid:

text

SOURCE_DATE_EPOCH (validated, finite, |ms| ≤ 8.64e15)
  → injected clock (guarded: may not throw, must be a finite Date)
    → Date.now() (primitive; surfaced only outside production)
      → 0 (the epoch — always serialisable)
Each step that is skipped is reported once per condition with its own reason
(unusable-epoch, clock-threw, clock-invalid, unserialisable-clock), so
an operator can tell a bad SOURCE_DATE_EPOCH from a broken platform clock.

Invalid input
Routes are validated individually; anything that is not a string is dropped and
reported with the typeof name only (SITEMAP_ROUTE_DROPPED /
reason: 'not-a-string'). It previously fell through to '', which silently
emitted a duplicate home entry and reported nothing.

Tests
The authoritative suite is
src/app/__tests__/sitemap.test.ts.
src/app/sitemap.test.ts — a leftover from #1255 that imported vitest, had a
parse error and targeted exports removed in #1256 — was deleted: it failed both
npm run lint and npm test, and duplicated the cases above.

Security notes
Scheme allowlist. javascript:, data:, file: and ftp: bases are
rejected — an unvalidated NEXT_PUBLIC_SITE_URL previously flowed straight
into the served document.
No credential leakage. URL.origin cannot represent userinfo, a query or
a fragment, so the composed base cannot carry them. Their presence in the
configured value is still reported, because embedding credentials in a public
NEXT_PUBLIC_* variable is a configuration fault.
Route allowlist. Routes must match an RFC 3986 pchar allowlist and may
not contain ./../empty segments, so a route can never escape the base
directory or smuggle a query, fragment or encoded control character.
Path traversal. '/../etc/passwd' and '/nested/../escape' are dropped.
Production diagnosability. The default reporter is a no-op under
NODE_ENV=production, so a rejected site URL is additionally logged once via
console.warn — a sitemap silently serving localhost URLs to crawlers is a
real SEO bug that is otherwise invisible. Only the reason and the fallback are
printed.
Related route
src/app/robots.ts composes ${siteUrl}/sitemap.xml
from the same environment variable. It was hardened separately (#1252) with
createSiteUrlResolver, which owns a bounded,
frozen memo of validated origins; src/app/sitemap.ts keeps its own resolution
rules (a sitemap base may carry a path prefix and is sanitised rather than
refused when it embeds credentials), so the two resolvers stay independent.

Report codes
Code	Level	Meaning
CONTRACTS_LOADING_FAILED	error	The /contracts loading fallback subtree threw
CONTRACTS_LOADING_STALLED	warn	The fallback outlived its stall budget; the render may still succeed
SITEMAP_SITE_URL_REJECTED	warn	NEXT_PUBLIC_SITE_URL was unusable; the default origin is in use
SITEMAP_SITE_URL_SANITIZED	warn	The value was usable but carried credentials, a query or a fragment
SITEMAP_ROUTE_DROPPED	warn	A route was invalid (invalid-route), unresolvable (unresolvable-route), not an absolute http(s) URL (not-absolute-http), or not a string at all (not-a-string)
SITEMAP_ROUTES_REJECTED	warn	The route list itself was not an array (not-an-array); the built-in routes were used
SITEMAP_TRUNCATED	warn	The document hit the protocol URL limit
SITEMAP_INVALID_TIMESTAMP	warn	The stamp was unusable — reasons: unusable-epoch, clock-threw, clock-invalid, unserialisable-clock
All of them flow through src/lib/errorReporter.ts,
so a host application can capture them with setErrorReporter. Reports are
best-effort: a sink that throws is contained (S2) and never retried for the same
condition (S10).