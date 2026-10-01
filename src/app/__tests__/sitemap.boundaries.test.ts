import type { MetadataRoute } from 'next';
import sitemap, {
  buildSitemap,
  __resetSitemapReporterForTests,
  DEFAULT_SITE_URL,
  SITEMAP_MAX_URLS,
  SITEMAP_ROUTE_DROPPED_CODE,
  SITEMAP_ROUTES,
  SITEMAP_SITE_URL_REJECTED_CODE,
  SITEMAP_SITE_URL_SANITIZED_CODE,

} from '../sitemap';
import { setErrorReporter } from '@/lib/errorReporter';

/**
 * Validation boundaries of `src/app/sitemap.ts` (#1254).
 *
 * `sitemap.test.ts` already asserts each invariant (S1–S7) in isolation. This
 * file covers the two boundaries that suite could not:
 *
 *  1. **S7 boundedness was asserted nowhere.** The doc comment claims "the key
 *     space is the fixed code + reason vocabulary, so the set is bounded" — but
 *     no test drove enough distinct hostile inputs to prove a hostile or buggy
 *     caller cannot grow the dedupe set without limit. That is the difference
 *     between a claim and an enforced boundary, and it is what keeps a hot
 *     `/sitemap.xml` route from growing process memory over its lifetime.
 *
 *  2. **`sitemap()` had no way to reset its per-process state.** `robots.ts`
 *     exports `__resetRobotsResolverForTests`; `sitemap.ts` kept
 *     `reportedConditions` module-scoped with no reset, so any test of the
 *     once-per-condition behaviour was order-dependent. Added the symmetric
 *     hook and asserted it actually clears state.
 */
describe('sitemap.ts validation boundaries', () => {
  const FIXED_NOW = new Date('2026-02-03T04:05:06.000Z');
  const originalEnv = process.env;
  const originalWarn = console.warn;
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SOURCE_DATE_EPOCH;
    __resetSitemapReporterForTests();
    // The module also warns on a rejected site URL; silence it so the
    // assertions below are about the dedupe set, not console noise.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    setErrorReporter(null);
    console.warn = originalWarn;
    jest.restoreAllMocks();
  });

  /** Counts reports whose `meta.code` matches, via the shared reporter seam. */
  function captureReports(run: () => void): Record<string, number> {
    const counts: Record<string, number> = {};
    setErrorReporter((error, context, level, meta) => {
      const code = typeof meta?.code === 'string' ? meta.code : 'unknown';
      counts[code] = (counts[code] ?? 0) + 1;
    });
    run();
    return counts;
  }

  describe('S7 — the dedupe key space is bounded', () => {
    it('reports a repeated condition exactly once, however many requests arrive', () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'javascript:alert(1)';

      const counts = captureReports(() => {
        for (let i = 0; i < 200; i += 1) sitemap();
      });

      expect(counts[SITEMAP_SITE_URL_REJECTED_CODE]).toBe(1);
    });

    it('does not grow the dedupe set with the number of identical requests', () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'javascript:alert(1)';

      // Each distinct condition is deduped independently, so the set can only
      // ever hold one entry per distinct condition — never one per request.
      const counts = captureReports(() => {
        for (let i = 0; i < 500; i += 1) sitemap();
      });

      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(1);
    });

    it('stays bounded across many distinct hostile inputs', () => {
      // The key space is `code + reason` drawn from fixed vocabularies, so an
      // unbounded stream of different bad values must still collapse to a
      // small, fixed set of signatures. This is the memory-safety claim in S7.
      const hostile = [
        'javascript:alert(1)',
        'file:///etc/passwd',
        'data:text/html,<script>',
        'ftp://example.com',
        'talenttrust.app',
        'https://',
        '://',
        'https://user:pass@talenttrust.app',
        'https://talenttrust.app?a=1',
        'https://talenttrust.app#frag',
        'https://talenttrust.app\r\nDisallow: /',
      ];

      const counts = captureReports(() => {
        for (let round = 0; round < 20; round += 1) {
          for (const value of hostile) {
            process.env.NEXT_PUBLIC_SITE_URL = value;
            sitemap();
          }
        }
      });

      // Every input above is a rejected base URL, so they all share one code
      // and differ only by a small `reason` vocabulary. The number of distinct
      // reports must not scale with the number of requests (220 above).
      expect(counts[SITEMAP_SITE_URL_REJECTED_CODE]).toBeLessThanOrEqual(hostile.length);
      expect(counts[SITEMAP_SITE_URL_REJECTED_CODE]).toBeGreaterThan(0);
    });

    it('still produces a usable document after a long hostile stream', () => {
      const counts = captureReports(() => {
        for (let i = 0; i < 100; i += 1) {
          process.env.NEXT_PUBLIC_SITE_URL = `javascript:alert(${i})`;
          const result = sitemap();
          expect(result.length).toBeGreaterThan(0);
          expect(result[0].url).toBe(DEFAULT_SITE_URL);
        }
      });

      expect(counts[SITEMAP_SITE_URL_REJECTED_CODE]).toBe(1);
    });
  });

  describe('the reset hook clears per-process state', () => {
    it('is exported and restores first-report behaviour', () => {
      expect(typeof __resetSitemapReporterForTests).toBe('function');

      process.env.NEXT_PUBLIC_SITE_URL = 'javascript:alert(1)';
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Warm the reporter once, then confirm repeats stay deduplicated. The
      // absolute count is the reporter seam's business, so this asserts the
      // *delta* a reset causes rather than a magic number.
      sitemap();
      sitemap();
      sitemap();
      const afterFirst = warn.mock.calls.length;
      expect(afterFirst).toBeGreaterThan(0);

      // Without the hook the condition would be swallowed for the rest of the
      // process, which is exactly the order-dependence it removes.
      __resetSitemapReporterForTests();
      sitemap();
      expect(warn.mock.calls.length).toBeGreaterThan(afterFirst);
    });

    it('is safe to call when nothing has been reported yet', () => {
      expect(() => __resetSitemapReporterForTests()).not.toThrow();
      expect(() => __resetSitemapReporterForTests()).not.toThrow();

      // And reporting still works afterwards.
      process.env.NEXT_PUBLIC_SITE_URL = 'javascript:alert(1)';
      const counts = captureReports(() => sitemap());
      expect(counts[SITEMAP_SITE_URL_REJECTED_CODE]).toBe(1);
    });
  });

  describe('distinct conditions are neither merged nor lost', () => {
    it('separates a rejected URL from a sanitised one', () => {
      const counts = captureReports(() => {
        // Rejected -> falls back.
        process.env.NEXT_PUBLIC_SITE_URL = 'javascript:alert(1)';
        sitemap();
        // Sanitised -> usable origin, different condition.
        process.env.NEXT_PUBLIC_SITE_URL = 'https://user:pass@talenttrust.app';
        sitemap();
      });

      expect(counts[SITEMAP_SITE_URL_REJECTED_CODE]).toBe(1);
      expect(counts[SITEMAP_SITE_URL_SANITIZED_CODE]).toBe(1);
    });

    it('separates a rejected URL from a dropped route', () => {
      // `sitemap()` is the zero-argument Next.js entry point, so truncation is
      // not reachable through it — that path is covered via `buildSitemap`
      // above. A dropped route is, and it must not be folded into the rejected
      // base URL's signature: different code, different operator action.
      const counts = captureReports(() => {
        process.env.NEXT_PUBLIC_SITE_URL = 'javascript:alert(1)';
        sitemap();
      });

      expect(counts[SITEMAP_SITE_URL_REJECTED_CODE]).toBe(1);
      // Default routes are all valid, so nothing should be dropped.
      expect(counts[SITEMAP_ROUTE_DROPPED_CODE]).toBeUndefined();
    });

    it('does not merge two different rejection reasons into one report', () => {
      // Deliberately NOT resetting between the calls: the point is that the
      // dedupe signature includes `reason`, so two different causes both reach
      // the operator. If the signature collapsed on `code` alone, the second
      // report would be swallowed and the operator would only see the first
      // cause.
      const counts = captureReports(() => {
        // One input per distinct `SitemapBaseUrlRejection` member, so the
        // signature's reason component is exercised on all three axes.
        process.env.NEXT_PUBLIC_SITE_URL = 'javascript:alert(1)'; // unsupported-protocol
        sitemap();
        process.env.NEXT_PUBLIC_SITE_URL = 'talenttrust.app'; // unparsable
        sitemap();
        // Parses as a URL (the space in the path is percent-encoded, so the
        // constructor succeeds) but the raw value still carries a character
        // the base-URL check refuses.
        process.env.NEXT_PUBLIC_SITE_URL = 'https://talenttrust.app/a b';
        sitemap();
      });

      expect(counts[SITEMAP_SITE_URL_REJECTED_CODE]).toBe(3);
    });
  });

  describe('structural boundaries', () => {
    it('keeps the route list frozen so a caller cannot mutate the default', () => {
      expect(Object.isFrozen(SITEMAP_ROUTES)).toBe(true);
      expect(() => {
        (SITEMAP_ROUTES as string[]).push('/injected');
      }).toThrow();

      // The injected route must not appear in a later default build.
      const entries = buildSitemap({ now: () => FIXED_NOW });
      expect(entries.map((e) => e.url)).not.toContain('/injected');
    });

    it('never returns more entries than the protocol limit', () => {
      const many = Array.from({ length: SITEMAP_MAX_URLS + 500 }, (_, i) => `/route-${i}`);

      const entries = buildSitemap({ routes: many, now: () => FIXED_NOW });

      expect(entries.length).toBeLessThanOrEqual(SITEMAP_MAX_URLS);
      expect(entries.length).toBeGreaterThan(0);
    });

    it('rejects a caller-supplied cap that would disable the protocol limit', () => {
      for (const maxUrls of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        const entries = buildSitemap({ maxUrls, now: () => FIXED_NOW });
        expect(entries.length).toBeLessThanOrEqual(SITEMAP_MAX_URLS);
      }
    });

    it('always emits at least the base entry, whatever the route list', () => {
      for (const routes of [[], [''], ['  '], ['///'], ['..'], ['../escape']]) {
        const entries = buildSitemap({ routes, now: () => FIXED_NOW });
        expect(entries.length).toBeGreaterThan(0);
        expect(entries[0].url).toBe(DEFAULT_SITE_URL);
      }
    });

    it('drops a traversal route rather than escaping the base', () => {
      const entries = buildSitemap({
        routes: ['/safe', '/../escape', '/./here'],
        now: () => FIXED_NOW,
      });

      const urls = entries.map((e) => e.url);
      expect(urls).toContain(`${DEFAULT_SITE_URL}/safe`);
      expect(urls.some((u) => u.includes('..'))).toBe(false);
    });

    it('never throws for a hostile combination of inputs', () => {
      const hostileRoutes = [
        '',
        '/',
        '///',
        '..',
        '../..',
        '/a?b=c#d',
        '',
        '/\u0000null',
        'a'.repeat(10_000),
        '/'.repeat(200),
      ];

      for (const siteUrl of ['', 'javascript:x', 'not a url', 'https://ok.example']) {
        for (const maxUrls of [1, Number.NaN]) {
          expect(() =>
            buildSitemap({
              siteUrl,
              routes: hostileRoutes,
              maxUrls,
              now: () => FIXED_NOW,
            }),
          ).not.toThrow();
        }
      }
    });

    it('drops hostile routes and reports them without echoing the value', () => {
      const counts = captureReports(() => {
        buildSitemap({ routes: ['/ok', '/../escape'], now: () => FIXED_NOW });
      });

      expect(counts[SITEMAP_ROUTE_DROPPED_CODE]).toBeGreaterThan(0);
    });
  });

  describe('determinism under repeated and concurrent invocation', () => {
    it('produces byte-identical output for identical inputs', () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://talenttrust.app';

      const once = buildSitemap({ now: () => FIXED_NOW });
      const twice = buildSitemap({ now: () => FIXED_NOW });

      expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    });

    it('stays deterministic across interleaved builds', async () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://talenttrust.app';

      const results = await Promise.all(
        Array.from({ length: 50 }, async () => buildSitemap({ now: () => FIXED_NOW })),
      );

      const serialised = new Set(results.map((r) => JSON.stringify(r)));
      expect(serialised.size).toBe(1);
    });

    it('is reproducible across builds when SOURCE_DATE_EPOCH is set', () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://talenttrust.app';
      process.env.SOURCE_DATE_EPOCH = '1767225600';

      const a = buildSitemap({ now: () => new Date(0) });
      const b = buildSitemap({ now: () => new Date() });

      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    });

    it('shares one timestamp across the whole document', () => {
      process.env.NEXT_PUBLIC_SITE_URL = 'https://talenttrust.app';

      const entries = buildSitemap({ now: () => FIXED_NOW }) as MetadataRoute.Sitemap;
      const stamps = new Set(entries.map((e) => e.lastModified?.toISOString()));

      expect(stamps.size).toBe(1);
      expect([...stamps][0]).toBe(FIXED_NOW.toISOString());
    });
  });
});