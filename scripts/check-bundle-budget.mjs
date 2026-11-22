import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/**
 * First-load JS gzipped budget per route, in kilobytes (KB, 1 KB = 1024 bytes).
 * Update these values intentionally when adding dependencies or restructuring routes.
 */
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

const JS_CHUNK_RE = /\.m?js$/i;
const CLIENT_REF_CHUNK_RE = /static\/chunks\/[^\s"'\\]+\.js/g;

/**
 * Normalize an App Router or Pages Router manifest key to a URL route path.
 * E.g. "/page" -> "/", "/contracts/page" -> "/contracts", "/contracts/[id]/statement/page" -> "/contracts/[id]/statement".
 */
export function normalizeRoute(rawKey) {
  if (rawKey === '/page' || rawKey === '/index') return '/';
  if (rawKey.endsWith('/page')) return rawKey.slice(0, -'/page'.length) || '/';
  return rawKey;
}

/**
 * Compute the gzipped byte size of a file on disk, with optional caching.
 */
function getGzipSizeBytes(filePath, sizeCache) {
  if (sizeCache.has(filePath)) return sizeCache.get(filePath);
  if (!existsSync(filePath)) {
    sizeCache.set(filePath, 0);
    return 0;
  }
  const content = readFileSync(filePath);
  const size = gzipSync(content).length;
  sizeCache.set(filePath, size);
  return size;
}

/**
 * Sum gzipped JS chunk sizes (in KB, rounded to 2 decimal places) per route from a manifest object.
 * De-duplicates shared chunks within each route and ignores non-JS assets (e.g. CSS).
 *
 * @param {object} manifest - Parsed Next.js manifest (`app-build-manifest.json` or `build-manifest.json`).
 * @param {string} [nextDir='.next'] - Path to the `.next` build directory used to resolve chunk paths.
 * @param {(chunkPath: string) => number} [measureBytes] - Optional pure size resolver (bytes) for testing.
 * @returns {Record<string, number>} Map of normalized route -> total gzipped JS size in KB.
 */
export function sumRouteSizes(manifest, nextDir = '.next', measureBytes) {
  const pages = manifest?.pages ?? {};
  const shared = [
    ...(Array.isArray(manifest?.polyfillFiles) ? manifest.polyfillFiles : []),
    ...(Array.isArray(manifest?.rootMainFiles) ? manifest.rootMainFiles : []),
  ];

  const sizeCache = new Map();
  const resolveSize = (chunk) => {
    if (typeof measureBytes === 'function') {
      if (sizeCache.has(chunk)) return sizeCache.get(chunk);
      const bytes = measureBytes(chunk);
      sizeCache.set(chunk, bytes);
      return bytes;
    }
    return getGzipSizeBytes(join(nextDir, chunk), sizeCache);
  };

  const totals = {};
  for (const [rawRoute, files] of Object.entries(pages)) {
    const route = normalizeRoute(rawRoute);
    if (route.startsWith('/_')) continue;

    const uniqueJsChunks = new Set();
    for (const file of [...shared, ...(Array.isArray(files) ? files : [])]) {
      if (typeof file === 'string' && JS_CHUNK_RE.test(file)) {
        uniqueJsChunks.add(file);
      }
    }

    let totalBytes = 0;
    for (const chunk of uniqueJsChunks) {
      totalBytes += resolveSize(chunk);
    }

    totals[route] = Number((totalBytes / 1024).toFixed(2));
  }

  return totals;
}

/**
 * Compare measured route sizes (in KB) against a budget map (in KB).
 *
 * @param {Record<string, number>} routeSizes - Map of route -> measured gzipped KB.
 * @param {Record<string, number>} budget - Map of route -> allowed budget KB.
 * @returns {{ ok: boolean, results: Array<{ route: string, sizeKb: number | null, budgetKb: number, overByKb: number, status: 'PASS' | 'FAIL' | 'MISSING' }> }}
 */
export function compareToBudget(routeSizes, budget) {
  const results = [];
  let ok = true;

  for (const [route, budgetKb] of Object.entries(budget)) {
    const sizeKb = Object.prototype.hasOwnProperty.call(routeSizes, route)
      ? routeSizes[route]
      : null;

    if (sizeKb === null) {
      ok = false;
      results.push({ route, sizeKb: null, budgetKb, overByKb: 0, status: 'MISSING' });
      continue;
    }

    const overByKb = Number((sizeKb - budgetKb).toFixed(2));
    const status = sizeKb > budgetKb ? 'FAIL' : 'PASS';
    if (status === 'FAIL') ok = false;

    results.push({ route, sizeKb, budgetKb, overByKb, status });
  }

  return { ok, results };
}

/**
 * Load the Next.js build manifest from `.next/`.
 * Prefers `app-build-manifest.json`, falls back to `build-manifest.json`,
 * and augments Turbopack builds (where `pages` only lists `/_app`) with
 * per-route chunks from `.next/app-path-routes-manifest.json` and
 * `.next/server/app/<route>/page_client-reference-manifest.js`.
 */
export function loadBuildManifest(nextDir = '.next') {
  const appManifestPath = join(nextDir, 'app-build-manifest.json');
  const buildManifestPath = join(nextDir, 'build-manifest.json');

  if (existsSync(appManifestPath)) {
    const appManifest = JSON.parse(readFileSync(appManifestPath, 'utf8'));
    if (existsSync(buildManifestPath)) {
      const buildManifest = JSON.parse(readFileSync(buildManifestPath, 'utf8'));
      return {
        ...appManifest,
        polyfillFiles: buildManifest.polyfillFiles ?? [],
        rootMainFiles: buildManifest.rootMainFiles ?? [],
      };
    }
    return appManifest;
  }

  if (!existsSync(buildManifestPath)) {
    throw new Error(
      `No Next.js build manifest found in ${nextDir}. Run "npm run build" before "npm run analyze".`,
    );
  }

  const buildManifest = JSON.parse(readFileSync(buildManifestPath, 'utf8'));
  const nonInternalPages = Object.keys(buildManifest.pages ?? {}).filter(
    (k) => !k.startsWith('/_'),
  );

  // Next.js 16 (Turbopack) omits app-build-manifest.json and stores per-route
  // client chunks in .next/server/app/<appPath>_client-reference-manifest.js.
  const appPathRoutesPath = join(nextDir, 'app-path-routes-manifest.json');
  if (nonInternalPages.length === 0 && existsSync(appPathRoutesPath)) {
    const appPathRoutes = JSON.parse(readFileSync(appPathRoutesPath, 'utf8'));
    const pages = {};
    for (const [appPath, route] of Object.entries(appPathRoutes)) {
      if (!appPath.endsWith('/page') || route.startsWith('/_')) continue;
      const clientRefPath = join(
        nextDir,
        'server',
        'app',
        `${appPath.replace(/^\//, '')}_client-reference-manifest.js`,
      );
      const chunks = new Set();
      if (existsSync(clientRefPath)) {
        const raw = readFileSync(clientRefPath, 'utf8');
        for (const match of raw.matchAll(CLIENT_REF_CHUNK_RE)) {
          chunks.add(match[0]);
        }
      }
      pages[route] = [...chunks];
    }
    return {
      ...buildManifest,
      pages,
    };
  }

  return buildManifest;
}

function printReport(results) {
  const routeWidth = Math.max(
    'Route'.length,
    ...results.map((r) => r.route.length),
  );
  const header = `${'Route'.padEnd(routeWidth)} | ${'Size (KB)'.padStart(10)} | ${'Budget (KB)'.padStart(11)} | Status`;
  const divider = '-'.repeat(header.length);

  console.log('\nBundle Budget Report (gzipped first-load JS)');
  console.log(divider);
  console.log(header);
  console.log(divider);

  for (const row of results) {
    const sizeStr = row.sizeKb === null ? 'N/A' : row.sizeKb.toFixed(2);
    const budgetStr = row.budgetKb.toFixed(2);
    const statusStr =
      row.status === 'FAIL'
        ? `FAIL (+${row.overByKb.toFixed(2)} KB)`
        : row.status;
    console.log(
      `${row.route.padEnd(routeWidth)} | ${sizeStr.padStart(10)} | ${budgetStr.padStart(11)} | ${statusStr}`,
    );
  }
  console.log(divider);
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const nextDir = resolve(process.cwd(), '.next');
  const manifest = loadBuildManifest(nextDir);
  const sizes = sumRouteSizes(manifest, nextDir);
  const { ok, results } = compareToBudget(sizes, BUDGET);

  printReport(results);

  if (!ok) {
    console.error('\nBundle budget check failed.');
    process.exit(1);
  }
  console.log('\nAll routes are within bundle budget.');
}
