// Fast smoke test: every internal link in the nav and in page sources must map to an app route.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const appDir = new URL('../src/app/', import.meta.url).pathname;
const srcDir = new URL('../src/', import.meta.url).pathname;
const nav = JSON.parse(readFileSync(join(srcDir, 'lib/nav.json'), 'utf8'));

// Resolve a link path to an app route, understanding dynamic [xx] segments.
// Dynamic segments accept any non-empty value, but must match the expected shape
// (e.g. [] for catch-all, [[id]] for optional catch-all, [id] for single).
const isDynamicSegment = (f) => /^\[.+\]$/.test(f);

const matchesDynamic = (dir, segment) => {
  const candidates = readdirSync(dir).filter((f) => isDynamicSegment(f) && statSync(join(dir, f)).isDirectory());
  for (const f of candidates) {
    // Optional catch-all [[...slug]] matches zero or more segments.
    if (/^\[\\[.+\\]\\]$/.test(f)) return f;
    // Catch-all [...slug] matches one or more segments.
    if (/^\\[\\.\\.\\..+\\]$/.test(f)) return f;
    // Single dynamic segment [id] matches exactly one non-empty segment.
    if (segment.length > 0) return f;
  }
  return null;
};

const routeExists = (href) => {
  const path = href.split('#')[0].split('?')[0];
  if (path === '/' || path === '') return existsSync(join(appDir, 'page.tsx'));
  const segments = path.split('/').filter(Boolean);
  let dir = appDir;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    const exact = join(dir, seg);
    if (existsSync(exact) && statSync(exact).isDirectory()) {
      dir = exact;
      continue;
    }
    // Fall back to a dynamic segment like [id].
    const dynamic = matchesDynamic(dir, seg);
    if (!dynamic) {
      // Allow a last-segment file route like foo.tsx.
      if (isLast && existsSync(join(dir, `${seg}.tsx`))) return true;
      return false;
    }
    dir = join(dir, dynamic);
  }
  return existsSync(join(dir, 'page.tsx'));
};

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : [];
  });

const links = new Set(nav.map((n) => n.href));
for (const file of walk(srcDir)) {
  for (const m of readFileSync(file, 'utf8').matchAll(/href=["'{`+](\/[^"'`#]*)/g)) links.add(m[1]);
}

const broken = [...links].filter((l) => !routeExists(l));
if (broken.length) {
  console.error('Broken internal links:', broken);
  process.exit(1);
}
console.log(`OK: ${links.size} internal links resolve (${[...links].join(', ')})`);
