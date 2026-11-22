import { describe, expect, it } from 'vitest';
import {
  BUDGET,
  compareToBudget,
  normalizeRoute,
  sumRouteSizes,
} from '../../../scripts/check-bundle-budget.mjs';

describe('bundle budget utilities', () => {
  describe('normalizeRoute', () => {
    it('normalizes App Router and Pages Router keys to URL paths', () => {
      expect(normalizeRoute('/page')).toBe('/');
      expect(normalizeRoute('/index')).toBe('/');
      expect(normalizeRoute('/contracts/page')).toBe('/contracts');
      expect(normalizeRoute('/contracts/[id]/statement/page')).toBe(
        '/contracts/[id]/statement',
      );
      expect(normalizeRoute('/docs')).toBe('/docs');
    });
  });

  describe('sumRouteSizes', () => {
    it('sums gzipped JS chunk sizes per route and de-duplicates shared chunks', () => {
      const appBuildManifestFixture = {
        polyfillFiles: ['static/chunks/polyfills.js'],
        rootMainFiles: ['static/chunks/framework.js', 'static/chunks/main.js'],
        pages: {
          '/page': [
            'static/chunks/framework.js', // duplicate of rootMainFiles
            'static/chunks/home.js',
            'static/chunks/home.js', // duplicate within route
            'static/css/app.css', // non-JS asset, should be ignored
          ],
          '/contracts/page': [
            'static/chunks/main.js', // duplicate of rootMainFiles
            'static/chunks/contracts.js',
          ],
          '/_not-found/page': ['static/chunks/not-found.js'],
        },
      };

      const chunkBytes: Record<string, number> = {
        'static/chunks/polyfills.js': 10 * 1024,
        'static/chunks/framework.js': 40 * 1024,
        'static/chunks/main.js': 20 * 1024,
        'static/chunks/home.js': 30 * 1024,
        'static/chunks/contracts.js': 55 * 1024,
        'static/css/app.css': 999 * 1024,
      };

      const sizes = sumRouteSizes(
        appBuildManifestFixture,
        '.next',
        (chunk) => chunkBytes[chunk] ?? 0,
      );

      // 10 + 40 + 20 + 30 = 100 KB (duplicates and CSS excluded)
      expect(sizes['/']).toBe(100);
      // 10 + 40 + 20 + 55 = 125 KB
      expect(sizes['/contracts']).toBe(125);
      // Internal routes starting with /_ are omitted
      expect(sizes['/_not-found']).toBeUndefined();
    });

    it('handles fallback build-manifest.json shape without rootMainFiles', () => {
      const buildManifestFixture = {
        pages: {
          '/_app': ['static/chunks/app.js'],
          '/': ['static/chunks/index.js'],
          '/status': ['static/chunks/status.js'],
        },
      };

      const sizes = sumRouteSizes(buildManifestFixture, '.next', (chunk) =>
        chunk.includes('index') ? 1536 : 2048,
      );

      expect(sizes['/']).toBe(1.5);
      expect(sizes['/status']).toBe(2);
      expect(sizes['/_app']).toBeUndefined();
    });
  });

  describe('compareToBudget', () => {
    it('passes when all routes are within budget', () => {
      const { ok, results } = compareToBudget(
        { '/': 180, '/contracts': 200 },
        { '/': 200, '/contracts': 200 },
      );

      expect(ok).toBe(true);
      expect(results).toEqual([
        { route: '/', sizeKb: 180, budgetKb: 200, overByKb: -20, status: 'PASS' },
        {
          route: '/contracts',
          sizeKb: 200,
          budgetKb: 200,
          overByKb: 0,
          status: 'PASS',
        },
      ]);
    });

    it('fails when any route exceeds its budget', () => {
      const { ok, results } = compareToBudget(
        { '/': 215.5, '/docs': 150 },
        { '/': 200, '/docs': 200 },
      );

      expect(ok).toBe(false);
      expect(results[0]).toEqual({
        route: '/',
        sizeKb: 215.5,
        budgetKb: 200,
        overByKb: 15.5,
        status: 'FAIL',
      });
      expect(results[1].status).toBe('PASS');
    });

    it('fails with MISSING when a budgeted route is absent from the manifest', () => {
      const { ok, results } = compareToBudget(
        { '/': 100 },
        { '/': 200, '/offline': 200 },
      );

      expect(ok).toBe(false);
      expect(results[1]).toEqual({
        route: '/offline',
        sizeKb: null,
        budgetKb: 200,
        overByKb: 0,
        status: 'MISSING',
      });
    });
  });

  describe('BUDGET map', () => {
    it('covers all real application routes', () => {
      expect(Object.keys(BUDGET).sort()).toEqual(
        [
          '/',
          '/contracts',
          '/contracts/[id]/statement',
          '/contracts/onchain/[id]',
          '/docs',
          '/offline',
          '/reputation',
          '/status',
        ].sort(),
      );
    });
  });
});
