// Fast smoke test: every internal link in the nav and in page sources must map to an app route.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('../src/app/', import.meta.url));
const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
const nav = JSON.parse(readFileSync(join(srcDir, 'lib/nav.json'), 'utf8'));

// Returns true if a concrete path maps to an app route. Dynamic segments like [id] are
// matched by any non-empty segment at that position, but the number of segments must match
// exactly so the checker is not weakened.
const segmentMatches = (fileSeg, requestSeg) => {
  if (fileSeg.startsWith('[') && fileSeg.endsWith(']')) return requestSeg.length > 0;
  return fileSeg === requestSeg;
};

// A request segment containing a template interpolation (e.g. `${c.id}`) is a dynamic value
// that will be filled in at runtime, so it is treated as matching any dynamic folder.
const isInterpolated = (seg) => /\$\{[^}]*\}/.test(seg);

const routeExists = (href) => {
  const path = href.split('#')[0].split('?')[0];
  const requestSegs = path.split('/').filter(Boolean);
  if (requestSegs.length === 0) return existsSync(join(appDir, 'page.tsx'));
  // Walk the app directory matching each request segment against concrete or dynamic folders.
  const walk = (dir, idx) => {
    if (idx === requestSegs.length) return existsSync(join(dir, 'page.tsx'));
    const entries = readdirSync(dir);
    const reqSeg = requestSegs[idx];
    for (const entry of entries) {
      const p = join(dir, entry);
      if (!statSync(p).isDirectory()) continue;
      const isDynamicFolder = entry.startsWith('[') && entry.endsWith(']');
      if (isInterpolated(reqSeg)) {
        if (!isDynamicFolder) continue;
      } else if (!segmentMatches(entry, reqSeg)) {
        continue;
      }
      if (walk(p, idx + 1)) return true;
    }
    return false;
  };
  return walk(appDir, 0);
};

const walkFiles = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walkFiles(p) : /\.tsx?$/.test(f) ? [p] : [];
  });

const links = new Set(nav.map((n) => n.href));
for (const file of walkFiles(srcDir)) {
  for (const m of readFileSync(file, 'utf8').matchAll(/href=["{`]+(\/[^"`#?]*)/g)) links.add(m[1]);
}

const brokenLinks = [...links].filter((l) => !routeExists(l));
if (brokenLinks.length) {
  console.error('Broken internal links:', brokenLinks);
  process.exit(1);
}
console.log(`OK: ${links.size} internal links resolve (${[...links].join(', ')})`);