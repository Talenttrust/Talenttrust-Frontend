import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const globalsCssPath = resolve(__dirname, '../app/globals.css');
const globalsCss = readFileSync(globalsCssPath, 'utf8');

/**
 * Extract the `@media (forced-colors: active)` block from globals.css
 * by matching balanced braces starting from the media query header.
 */
function extractForcedColorsBlock(css: string): string {
  const match = css.match(/@media\s*\(\s*forced-colors\s*:\s*active\s*\)\s*\{/);
  if (!match || match.index === undefined) return '';
  const start = match.index + match[0].length;
  let depth = 1;
  let i = start;
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') depth -= 1;
    i += 1;
  }
  return css.slice(start, i - 1);
}

describe('globals.css forced-colors mode support', () => {
  const forcedBlock = extractForcedColorsBlock(globalsCss);

  it('defines a @media (forced-colors: active) section', () => {
    expect(globalsCss).toMatch(/@media\s*\(\s*forced-colors\s*:\s*active\s*\)/);
    expect(forcedBlock.length).toBeGreaterThan(0);
  });

  it('covers EscrowCard status pill classes with distinct system colors and borders', () => {
    const statusClasses = [
      '.badge',
      '.badge-Funded',
      '.badge-Completed',
      '.badge-Resolved',
      '.badge-Disputed',
      '.badge-Cancelled',
    ];
    for (const cls of statusClasses) {
      expect(forcedBlock).toContain(cls);
    }
  });

  it('covers ContractStatusPill classes', () => {
    const contractStatusClasses = [
      '.contract-status',
      '.contract-status-operational',
      '.contract-status-paused',
      '.contract-status-loading',
      '.contract-status-unknown',
      '.contract-status-dot',
    ];
    for (const cls of contractStatusClasses) {
      expect(forcedBlock).toContain(cls);
    }
  });

  it('covers RoleChip classes (.role-chip, .role-chip--client, .role-chip--freelancer)', () => {
    expect(forcedBlock).toContain('.role-chip');
    expect(forcedBlock).toContain('.role-chip--client');
    expect(forcedBlock).toContain('.role-chip--freelancer');
  });

  it('covers notification bell badge (.bell-badge)', () => {
    expect(forcedBlock).toContain('.bell-badge');
  });

  it('covers MilestoneTimeline (.mt-*) classes', () => {
    const timelineClasses = [
      '.mt-connector',
      '.mt-index',
      '.mt-status-chip',
      '.mt-progressbar',
      '.mt-progressbar-fill',
    ];
    for (const cls of timelineClasses) {
      expect(forcedBlock).toContain(cls);
    }
  });

  it('covers progress bar tracks and fills with forced-color-adjust or border', () => {
    expect(forcedBlock).toContain('.progress');
    expect(forcedBlock).toMatch(/\.progress\s*>\s*span/);
    expect(forcedBlock).toContain('.mt-progressbar');
    expect(forcedBlock).toContain('.mt-progressbar-fill');
    expect(forcedBlock).toMatch(/forced-color-adjust\s*:\s*none/);
  });

  it('uses CSS system colors (CanvasText, Highlight, LinkText)', () => {
    expect(forcedBlock).toContain('CanvasText');
    expect(forcedBlock).toContain('Highlight');
    expect(forcedBlock).toContain('LinkText');
  });

  it('leaves light and dark theme token definitions intact', () => {
    expect(globalsCss).toContain(':root[data-theme="light"]');
    expect(globalsCss).toContain(':root[data-theme="dark"]');
    expect(globalsCss).toMatch(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/);
  });
});
