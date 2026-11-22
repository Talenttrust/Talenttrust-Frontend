# Bundle Budget

## Overview

The bundle budget check runs after a production build to ensure no route's
first-load JavaScript exceeds its declared gzipped ceiling. Regressions are
caught before they reach production.

## Running the check

```bash
# After a successful `next build`:
npm run analyze
```

Or invoke the script directly:

```bash
node scripts/check-bundle-budget.mjs
```

The script reads `.next/app-build-manifest.json` (or `.next/build-manifest.json`
as fallback, augmented with per-route client reference manifests on Turbopack
builds), sums the gzipped sizes of each route's JS chunks (de-duplicating
shared chunks per route), prints a table, and exits non-zero when any route
exceeds its budget in `BUDGET`.

## Updating budgets

The budget map lives at the top of `scripts/check-bundle-budget.mjs` (values in
gzipped KB, where 1 KB = 1024 bytes):

```js
export const BUDGET = {
  '/': 410,
  '/contracts': 430,
  '/reputation': 410,
  '/docs': 410,
  '/status': 410,
  '/offline': 410,
  '/contracts/[id]/statement': 410,
  '/contracts/onchain/[id]': 420,
};
```

When a route's JS footprint changes (new dependency, restructure, etc.):

1. Run `npm run build && npm run analyze`
2. Note the reported gzipped size for the affected route
3. Update the number in `BUDGET`
4. Commit with a reasoning comment (e.g. `// +50 KB after adding chart library`)

## CI integration

To enforce budgets in CI, run the budget check after `npm run build`:

```yaml
- run: npm run build
- run: npm run analyze
```

If the check exits non-zero the pipeline fails, preventing accidental bundle
bloat from reaching production.

## Current baseline

Measured from a production `next build` (Next.js 16.3.8, Turbopack), with ~15%
headroom applied for initial budgets:

| Route | Baseline (gzipped KB) | Budget (gzipped KB) |
| :--- | ---: | ---: |
| `/` | 354.45 | 410.00 |
| `/contracts` | 370.96 | 430.00 |
| `/reputation` | 354.49 | 410.00 |
| `/docs` | 353.88 | 410.00 |
| `/status` | 355.22 | 410.00 |
| `/offline` | 353.15 | 410.00 |
| `/contracts/[id]/statement` | 353.23 | 410.00 |
| `/contracts/onchain/[id]` | 364.93 | 420.00 |
