import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(__dirname, '../../..');
const DOCS_DIR = join(ROOT, 'docs');
const SRC_DIR = join(ROOT, 'src');

function walkMarkdown(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walkMarkdown(full) : entry.endsWith('.md') ? [full] : [];
  });
}

describe('docs/ reconciliation against src/', () => {
  const readmePath = join(DOCS_DIR, 'README.md');
  const readme = readFileSync(readmePath, 'utf8');
  const allDocFiles = walkMarkdown(DOCS_DIR);

  it('indexes every markdown file under docs/ in docs/README.md and has no broken doc links', () => {
    const linkMatches = [...readme.matchAll(/\]\(\.\/([^)#]+)(?:#[^)]*)?\)/g)].map((m) => m[1]);
    expect(linkMatches.length).toBeGreaterThan(0);

    for (const rel of linkMatches) {
      const target = join(DOCS_DIR, rel);
      expect(existsSync(target), `docs/README.md links to missing file: docs/${rel}`).toBe(true);
    }

    for (const file of allDocFiles) {
      if (file === readmePath) continue;
      const rel = file.slice(DOCS_DIR.length + 1).replace(/\\/g, '/');
      expect(linkMatches, `Unindexed doc file: docs/${rel}`).toContain(rel);
    }
  });

  it('groups docs/README.md into Components, Hooks, Library, and Guides sections', () => {
    expect(readme).toMatch(/^## Components$/m);
    expect(readme).toMatch(/^## Hooks$/m);
    expect(readme).toMatch(/^## Library$/m);
    expect(readme).toMatch(/^## Guides$/m);
  });

  it('documents NotificationBell and ExportMenu', () => {
    expect(existsSync(join(DOCS_DIR, 'components/NotificationBell.md'))).toBe(true);
    expect(existsSync(join(DOCS_DIR, 'components/ExportMenu.md'))).toBe(true);
    expect(readme).toContain('./components/NotificationBell.md');
    expect(readme).toContain('./components/ExportMenu.md');
    expect(existsSync(join(SRC_DIR, 'components/NotificationBell.tsx'))).toBe(true);
    expect(existsSync(join(SRC_DIR, 'components/escrow/ExportMenu.tsx'))).toBe(true);
  });

  it('every src/ file path referenced in any docs/*.md file exists in src/', () => {
    const pathPattern = /\bsrc\/[A-Za-z0-9_\-./[\]]+\.(?:tsx?|json|css)\b/g;

    for (const docFile of allDocFiles) {
      const content = readFileSync(docFile, 'utf8');
      const matches = content.match(pathPattern) ?? [];
      const relDoc = docFile.slice(ROOT.length + 1).replace(/\\/g, '/');

      for (const refPath of matches) {
        const abs = join(ROOT, refPath);
        expect(existsSync(abs), `${relDoc} references non-existent path: ${refPath}`).toBe(true);
      }
    }
  });
});
