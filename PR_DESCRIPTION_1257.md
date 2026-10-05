Harden concurrent execution around src/app/sitemap.ts — Closes #1257
Branch: fix/harden-sitemap-concurrent-execution-1257
Files: src/app/sitemap.ts, src/app/__tests__/sitemap.test.ts,

route-failure-recovery.md
 (removed: src/app/sitemap.test.ts)

What this changes
/sitemap.xml is generated per request in development and once per build worker
in production, and Next.js hands the result straight to its XML serialiser. The
module already validated its inputs (S1–S7); what it did not do was survive
repeated or overlapping execution. Six defects were reproduced with a probe
against the previous module before being fixed, and every one of them now has a
regression test that fails against the old code and passes against the new one.

#	Defect (all reproduced)	Fix
1	Timestamp aliasing. Every entry in a document held the clock's own Date instance, so a consumer mutating one result rewrote the clock and every later document (probe: the next document was stamped 1970).	resolveLastModifiedMs() returns a primitive millisecond value; buildEntries() mints a distinct Date per entry (S8).
2	A throwing report sink escaped buildSitemap(), violating the documented "never throws" invariant and turning the route into a 500.	guardReporter() contains it; the fallback note is fixed text that never echoes the payload (S2, S6).
3	A throwing clock escaped the same way.	The clock call is guarded and a throw is treated exactly like an invalid date — reported, replaced, never propagated (S2, S5).
4	Invalid Date reached the XML serialiser. When the process clock was unusable, the "fallback" new Date() was the same broken clock, so entries carried Invalid Date and Next raised RangeError: Invalid time value → unrecoverable 500.	A total fallback chain in finite milliseconds: SOURCE_DATE_EPOCH → injected clock → Date.now() → 0 (S2).
5	Dedupe-key collision. The once-per-condition key omitted source, so the two SITEMAP_INVALID_TIMESTAMP conditions (bad epoch vs. broken clock) collided and the second was silently swallowed (S6 violation).	Key is context + every distinguishing field (code, reason, source, type, sanitised); the memo is exported as a testable factory (S10).
6	Unbounded-by-convention memo and per-request closures. A fresh dedupe closure per request, no hard bound, and a sink that throws was retried on every request.	createSitemapReportMemo() — one frozen instance per process, hard-capped at SITEMAP_MAX_REPORTED_CONDITIONS (64) with oldest-first eviction, mark-before-delivery, injectable bound (S7, S10).
Two further inputs were made deterministic rather than silently wrong:

Non-string routes (null, 42, {}) used to fall through to '' and
therefore became a duplicate home entry, with no report at all. They are
now dropped and reported with the typeof name only — never the value
(SITEMAP_ROUTE_DROPPED / reason: 'not-a-string').
A non-array route list is refused and reported
(SITEMAP_ROUTES_REJECTED / reason: 'not-an-array') instead of being
iterated as whatever it happens to be; the built-in routes are used.
Invariants added
S8 — isolation between invocations. Fresh array, fresh entry objects, a
distinct Date per entry; nothing aliases the clock, the frozen route list or
another document.
S9 — one input snapshot per document. NEXT_PUBLIC_SITE_URL,
SOURCE_DATE_EPOCH and the route list are read exactly once per call and the
clock is invoked at most once, so a concurrent mutation of the environment or
of the caller's array cannot produce a torn document that mixes two
configurations.
S10 — the report memo is hard-bounded and collision-free. Frozen handle,
oldest-first eviction at a fixed cap, marked before delivery, and distinct
conditions always have distinct keys.
S2 strengthened — never throws and always returns a serialisable
document.

route-failure-recovery.md
 documents the model (what shared state could
cross-contaminate calls, and how each source is isolated), the timestamp
fallback chain, the new report codes/reasons and the invalid-input rules.

No document is cached, deliberately. There is no TTL, no module-level
document and no single-flight promise, so a response can never be stale relative
to the inputs that produced it; the expensive work is bounded instead (duplicate
URLs collapse, repeated/racing invocations are byte-identical, logging is once
per condition). The builder is synchronous and side-effect free apart from those
reports, so concurrent requests cannot interleave inside it.

Acceptance criteria → code and tests
Criterion	Where it is enforced / covered
Deterministic for valid, invalid, duplicate and boundary inputs	resolveSitemapBaseUrl + buildEntries (S1/S4/S6); pins the stamp at the exact representable boundary and refuses one second past it, collapses duplicate work inside one document (S4), drops non-string routes instead of turning them into the home entry, refuses a non-array route list deterministically…, 100 racing invocations all produce the same document
Validation and state-transition invariants stay enforced	S1–S7 rows in the existing suite are unchanged and still pass (expectOnlyAbsoluteHttpUrls, truncation cap, credential stripping, route allowlist)
Retries, partial failure and concurrency cannot produce an unsafe or inconsistent result	is idempotent across repeated retries…, never serves a stale origin after NEXT_PUBLIC_SITE_URL changes (no document cache), mutating one racing result cannot corrupt the others, contains a throwing report sink, contains a throwing clock, never emits an unserialisable stamp, even when the realm clock is broken
Focused tests cover success, rejection, boundary and regression	26 new cases in src/app/__tests__/sitemap.test.ts; every behavioural one fails against the previous module (evidence below)
Existing callers remain compatible	export default function sitemap(): MetadataRoute.Sitemap is still zero-argument and every previous named export keeps its signature; all 47 pre-existing tests in the suite pass unmodified. New exports are additive (createSitemapReportMemo, SITEMAP_MAX_REPORTED_CONDITIONS, SITEMAP_ROUTES_REJECTED_CODE, two __…ForTests hooks)
Logs/metrics/errors are diagnosable without exposing sensitive data	Stable codes + reasons (SITEMAP_ROUTES_REJECTED, unusable-epoch, clock-threw, clock-invalid, unserialisable-clock, not-a-string); reports never carry the offending value; the production console.warn for a rejected origin is preserved and still prints only the reason and the fallback
Security notes
No weakening of validation. The route allowlist, scheme allowlist,
credential stripping, traversal rejection and the protocol URL cap are
untouched; the only behaviour change on the happy path is that each entry now
carries its own equal-valued Date instead of one shared instance.
No credential leakage. URL.origin still composes the base, and the new
reports carry only reason codes and typeof names — drops non-string routes…, keeps conditions distinct when only 'source' differs and the
existing …never the offending value test assert it.
No amplification. The memo cap bounds memory in a long-lived server even
if a future report adds a value-bearing field (the key vocabulary is fixed and
documented for that reason).
Failure-mode handling
Failure	Before	After
Report sink throws	Exception escapes → 500	Contained; the document is still returned; one fixed note outside production
Clock throws / returns non-Date	Exception escapes → 500	Reported (clock-threw / clock-invalid), replaced by the wall clock
Realm clock is broken	Invalid Date in output → RangeError from the serialiser → 500	Finite stamp (Date.now() or epoch 0); the document always serialises
Bad SOURCE_DATE_EPOCH	Reported, but could collide with the clock condition and vanish	Reported with its own reason, distinct from the clock condition
Sink mutates the route array mid-build	The added route was emitted	The document follows its own snapshot
Compatibility
Public surface: unchanged default export, unchanged named exports, unchanged
option names/types; new options/fields are optional and additive.
Output shape: unchanged ({ url, lastModified } per entry, same order,
same URLs, single shared timestamp). lastModified values are equal to
before; only their object identity differs (one Date per entry).
Deployment: nothing to configure. SOURCE_DATE_EPOCH keeps working for
reproducible builds.
Validation
Reproduction first: a probe suite reproduced all six defects against the
previous module (shared Date between entries and across calls → 1970 stamp;
throwing sink and clock escaping; Invalid Date → RangeError on
toISOString(); the second SITEMAP_INVALID_TIMESTAMP condition swallowed;
non-string routes collapsing to the home entry; a sink-grown route appearing in
the output). All of it is now asserted as permanent regression tests.

Check	Result
npx jest src/app/__tests__/sitemap.test.ts	73 passed / 73 (was 44 passed / 3 failed) — the three failures were a pre-existing ReferenceError: warnings is not defined, now declared
Same suite against the previous module (git stash)	26 failed, i.e. every new regression test genuinely fails without the fix
npx jest (full repo)	failing suites 73 → 71, failing tests 370 → 367, no newly failing suite (the remaining failures are pre-existing corruption in unrelated files, e.g. src/lib/validation.ts, src/app/error.tsx; see Repo state below)
npx eslint .	159 → 156 errors, no file gained an error; src/app/sitemap.ts and src/app/__tests__/sitemap.test.ts are clean
npx tsc --noEmit -p tsconfig.json	no diagnostic in either changed file (the only errors are the pre-existing ones listed below)
Real Next.js 16 production build (isolated harness importing the exact file, md5-verified)	✓ /sitemap.xml prerendered; body parsed as well-formed XML with the 4 expected URLs and one shared lastmod; next start → 200 OK, content-type: application/xml
Reproducible build	SOURCE_DATE_EPOCH=1700000000 → lastmod 2023-11-14T22:13:20.000Z
Adversarial config	NEXT_PUBLIC_SITE_URL=javascript:alert(1) → build still succeeds, well-formed XML, localhost fallback, and exactly one [sitemap] NEXT_PUBLIC_SITE_URL rejected (unsupported-protocol) line
npm run build (repo)	identical failure set before and after this change (see below)
Repo state (pre-existing, not caused by this PR)
main as of b9d3d0b does not compile: 14 files contain merge-corruption
syntax errors (src/lib/validation.ts, src/lib/stellar-address.ts,
src/app/error.tsx, src/app/page.tsx, src/app/milestones/page.tsx,
src/app/wallet/page.tsx, src/app/not-found.tsx,
src/app/contracts/[id]/page.tsx, …), which is why npm run lint,
npx tsc --noEmit and npm run build are red on main. This PR neither
touches nor depends on those files; the failure set produced by
npm run build is byte-identical before and after the change (verified by
stashing the change and re-running), and the end-to-end build above exercises
the changed route in isolation so the sitemap work is verified independently of
that pre-existing breakage. The same reason is why
src/app/sitemap.test.ts is deleted here: it was a leftover from #1255 that
imported vitest (not a dependency), contained a syntax error (toBe[) and
targeted exports removed in #1256, so it failed both npm run lint and
npm test. src/app/__tests__/sitemap.test.ts is the authoritative suite.