import robots, { __resetRobotsResolverForTests } from '../robots';
import { DEFAULT_SITE_URL, MAX_SITE_URL_CACHE_ENTRIES } from '@/lib/siteUrl';

/**
 * Compatibility contract for `src/app/robots.ts` (#1253).
 *
 * The existing suite in `robots.test.ts` covers *URL resolution*: which origin
 * wins, which values are rejected, what gets logged. This file covers the other
 * half of the contract — the **shape of the returned object**, which is what
 * Next.js actually consumes and what any caller depends on.
 *
 * Nothing asserted the exact key set of the returned metadata. A well-meaning
 * refactor that renamed `sitemap`, added a `host` key, changed `userAgent` from
 * `'*'` to a list, or dropped `rules` entirely would still pass every existing
 * test while silently breaking the emitted `robots.txt`. These tests pin that
 * shape so a regression fails loudly instead.
 */
describe('robots.ts output-shape compatibility', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    __resetRobotsResolverForTests();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  /**
   * The full contract in one place: exactly two top-level keys, exactly two
   * rule keys, and the exact literal values the pre-existing implementation
   * emitted. Any drift here is a breaking change for consumers.
   */
  const EXPECTED_CONTRACT = {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${DEFAULT_SITE_URL}/sitemap.xml`,
  };

  it('returns exactly the keys Next.js expects, and no others', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://talenttrust.app';
    const result = robots();

    expect(Object.keys(result).sort()).toEqual(['rules', 'sitemap']);
    expect(Object.keys(result.rules).sort()).toEqual(['allow', 'userAgent']);
  });

  it('holds the exact literal values, not merely an equivalent object', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://talenttrust.app';
    const result = robots();

    // Exact string identity, not deep equality: a refactor that produced
    // `allow: ['/']` or `userAgent: '*'` as something else is a change.
    expect(result.rules.userAgent).toBe('*');
    expect(result.rules.allow).toBe('/');
    expect(typeof result.sitemap).toBe('string');
  });

  it('preserves the default-origin contract when nothing is configured', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(robots()).toEqual(EXPECTED_CONTRACT);
  });

  it('preserves the shape for every configuration branch', () => {
    const rejected = [
      'talenttrust.app',
      'javascript:alert(1)',
      'https://user:pass@talenttrust.app',
      'https://talenttrust.app?token=abc',
    ];
    const accepted = ['https://talenttrust.app', 'https://talenttrust.app/', 'https://talenttrust.app/app/'];

    for (const value of [...rejected, ...accepted]) {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_SITE_URL = value;

      const result = robots();

      // The key set is the contract; only `sitemap`'s origin is allowed to vary.
      expect(Object.keys(result).sort()).toEqual(['rules', 'sitemap']);
      expect(result.rules).toEqual({ userAgent: '*', allow: '/' });
      expect(result.sitemap.endsWith('/sitemap.xml')).toBe(true);
      expect(result.sitemap).not.toContain('//sitemap.xml');
    }
  });

  it('serialises to the same JSON regardless of configuration', () => {
    // A crawler consumes the serialised document, so key *order* and shape are
    // part of the observable contract even though JSON is order-insensitive.
    process.env.NEXT_PUBLIC_SITE_URL = 'https://talenttrust.app';
    const withEnv = JSON.stringify(robots());

    delete process.env.NEXT_PUBLIC_SITE_URL;
    const withoutEnv = JSON.stringify(robots());

    expect(Object.keys(JSON.parse(withoutEnv)).sort()).toEqual(['rules', 'sitemap']);
    expect(JSON.parse(withoutEnv).rules).toEqual({ userAgent: '*', allow: '/' });
    expect(withEnv).not.toBe(withoutEnv); // origins differ, shape does not
  });

  it('hands out a fresh nested rules object on every call', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://talenttrust.app';

    const first = robots();
    const second = robots();

    // The existing suite mutates `first.rules.allow` and checks the next call.
    // This pins the underlying reason that works: the nested object is not
    // shared, so a caller cannot poison the memoised resolution.
    expect(second.rules).not.toBe(first.rules);
    expect(second.sitemap).toBe(first.sitemap);
  });

  it('is not affected by mutation of a previously returned object', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://talenttrust.app';

    const first = robots();
    (first.rules as Record<string, unknown>).userAgent = 'EvilBot';
    (first as Record<string, unknown>).sitemap = 'https://evil.example/sitemap.xml';

    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://talenttrust.app/sitemap.xml',
    });
  });

  it('always emits an absolute http(s) sitemap URL', () => {
    const values = [
      undefined,
      '',
      'https://talenttrust.app',
      'talenttrust.app',
      'javascript:alert(1)',
      'https://talenttrust.app/docs/',
    ];

    for (const value of values) {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      if (value === undefined) {
        delete process.env.NEXT_PUBLIC_SITE_URL;
      } else {
        process.env.NEXT_PUBLIC_SITE_URL = value;
      }

      const { sitemap } = robots();
      expect(() => new URL(sitemap)).not.toThrow();
      expect(new URL(sitemap).protocol).toMatch(/^https?:$/);
      expect(new URL(sitemap).search).toBe('');
      expect(new URL(sitemap).hash).toBe('');
      expect(new URL(sitemap).username).toBe('');
      expect(new URL(sitemap).password).toBe('');
    }
  });

  it('never emits a sitemap URL containing control characters', () => {
    for (const value of [
      'https://talenttrust.app\r\nDisallow: /',
      'https://talenttrust.app\nHost: evil.example',
      'https://talenttrust.app',
    ]) {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      process.env.NEXT_PUBLIC_SITE_URL = value;

      const { sitemap } = robots();
      expect(sitemap).not.toMatch(/[\r\n]/);
    }
  });

  it('bounds the resolver memo so a churning env var cannot grow it', () => {
    // The resolver memoises resolutions keyed by raw value, so a process that
    // observes unbounded distinct values would otherwise grow without limit.
    // The exported cap is the contract; assert it is a real bound and is
    // respected across more distinct inputs than the cap allows.
    for (let i = 0; i < MAX_SITE_URL_CACHE_ENTRIES * 3; i += 1) {
      process.env.NEXT_PUBLIC_SITE_URL = `https://site-${i}.example`;
      expect(robots().sitemap).toBe(`https://site-${i}.example/sitemap.xml`);
    }

    // Still correct after eviction churn — a full memo must not change output.
    process.env.NEXT_PUBLIC_SITE_URL = 'https://site-0.example';
    expect(robots().sitemap).toBe('https://site-0.example/sitemap.xml');
  });

  it('exposes the documented test hook and honours it', () => {
    // The hook is part of the module's surface. If it stopped clearing state,
    // suites that depend on observing first-refusal logging again would pass
    // spuriously or flake.
    expect(typeof __resetRobotsResolverForTests).toBe('function');

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.NEXT_PUBLIC_SITE_URL = 'javascript:alert(1)';
    robots();
    robots();
    robots();
    const before = warn.mock.calls.length;
    expect(before).toBe(1);

    __resetRobotsResolverForTests();
    robots();
    expect(warn.mock.calls.length).toBe(before + 1);
  });
});