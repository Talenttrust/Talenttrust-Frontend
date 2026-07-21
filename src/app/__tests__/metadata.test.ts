import fs from 'fs';
import path from 'path';
import { metadata } from '../layout';

describe('root metadata', () => {
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  afterEach(() => {
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
      return;
    }

    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  it('exports the expected root metadata shape', () => {
    expect(metadata.title).toBe('TalentTrust - Safe Freelance Payments');
    expect(metadata.description).toBe(
      'Safe, secure payments that protect both freelancers and clients throughout your project.',
    );
    expect(metadata.metadataBase?.toString()).toBe('http://localhost:3000/');
  });

  it('includes open graph metadata with a non-empty preview image array', () => {
    expect(metadata.openGraph).toMatchObject({
      title: 'TalentTrust - Safe Freelance Payments',
      description:
        'Safe, secure payments that protect both freelancers and clients throughout your project.',
      type: 'website',
      siteName: 'TalentTrust',
      url: 'http://localhost:3000',
    });

    expect(metadata.openGraph?.images).toHaveLength(1);
    expect((metadata.openGraph?.images as any)?.[0]).toMatchObject({
      url: '/og-preview.svg',
      width: 1200,
      height: 630,
      alt: 'TalentTrust social preview showing safe freelance payments',
    });
  });

  it('includes twitter metadata using the large preview card', () => {
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'TalentTrust - Safe Freelance Payments',
      description:
        'Safe, secure payments that protect both freelancers and clients throughout your project.',
    });

    expect(metadata.twitter?.images).toEqual(['/og-preview.svg']);
  });

  it('keeps manifest and social image paths relative so metadataBase can resolve them', () => {
    expect(metadata.manifest).toBe('/manifest.webmanifest');
    expect(((metadata.icons as any)?.icon as any[] | undefined)?.every((icon: any) => icon.url.startsWith('/'))).toBe(true);
    expect((metadata.openGraph?.images as any[] | undefined)?.every((image: any) => image.url.startsWith('/'))).toBe(true);
    expect((metadata.twitter?.images as any[] | undefined)?.every((image: any) => image.startsWith('/'))).toBe(true);
  });
});

describe('Repository Hygiene - Build Logs and Documentation', () => {
  const repoRoot = path.join(__dirname, '../../..');

  const buildLogFiles = [
    'build-out.txt',
    'build_check.txt',
    'build_output.txt',
    'jest-full-output.txt',
    'jest-run-output.txt',
    'jest-run.txt',
    'lint-out.txt',
    'lint-output.txt',
    'next-build.txt',
    'single-jest.txt',
    'test-out.txt',
    'test-shell-output.txt',
    'test_check.txt',
    'IMPLEMENTATION_SUMMARY.txt',
  ];

  const staleRootDocs = [
    'CI_BUILD_FIXES.md',
    'COMBINED_PR.md',
    'COPYWRITING_CHANGES.md',
    'DELIVERY_CHECKLIST.md',
    'implementation.md',
    'IMPLEMENTATION_CODE_REFERENCE.md',
    'IMPLEMENTATION_COMPLETE_383.md',
    'ISSUE_383_IMPLEMENTATION.md',
    'PR_DESCRIPTION.md',
    'README_IMPLEMENTATION.md',
    'REPUTATION_COMPLETION_SUMMARY.md',
    'REPUTATION_IMPLEMENTATION.md',
    'REPUTATION_PAGE_PR.md',
    'TEST_FIX_SUMMARY.md',
    'CONTRACT_CREATION_IMPLEMENTATION.md',
    'QUICK_REFERENCE.md',
    'REPUTATION_SCORE_METER.md',
    'SECURITY_FIX_PR.md',
  ];

  it('does not contain generated build log files in the repository root', () => {
    buildLogFiles.forEach((fileName) => {
      const filePath = path.join(repoRoot, fileName);
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });

  it('ensures .gitignore contains build and test output ignore patterns', () => {
    const gitignorePath = path.join(repoRoot, '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);

    const content = fs.readFileSync(gitignorePath, 'utf-8');
    ['*.txt', 'build-out.txt', 'jest-full-output.txt', 'lint-output.txt', 'next-build.txt', 'test-out.txt'].forEach((pattern) => {
      expect(content).toContain(pattern);
    });
  });

  it('only keeps CONTRIBUTING.md and README.md as root-level markdown files', () => {
    const mdFiles = fs.readdirSync(repoRoot).filter((file) => file.endsWith('.md'));
    expect(mdFiles).toEqual(expect.arrayContaining(['CONTRIBUTING.md', 'README.md']));
    mdFiles.forEach((file) => {
      expect(['CONTRIBUTING.md', 'README.md']).toContain(file);
    });
  });

  it('does not have stale one-off implementation markdown files in root', () => {
    staleRootDocs.forEach((fileName) => {
      const filePath = path.join(repoRoot, fileName);
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });

  it('moves root-level Toast.md documentation into docs/Toast.md', () => {
    const rootToastPath = path.join(repoRoot, 'Toast.md');
    expect(fs.existsSync(rootToastPath)).toBe(false);

    const docsToastPath = path.join(repoRoot, 'docs', 'Toast.md');
    expect(fs.existsSync(docsToastPath)).toBe(true);
  });

  it('ensures docs directory contains consolidated guides', () => {
    const docsPath = path.join(repoRoot, 'docs');
    expect(fs.existsSync(docsPath)).toBe(true);

    ['IMPLEMENTATION_GUIDES.md', 'SECURITY_AND_DEPENDENCIES.md', 'Toast.md'].forEach((fileName) => {
      expect(fs.existsSync(path.join(docsPath, fileName))).toBe(true);
    });
  });

  it('checks README.md references the documentation index and key docs', () => {
    const readmePath = path.join(repoRoot, 'README.md');
    expect(fs.existsSync(readmePath)).toBe(true);

    const content = fs.readFileSync(readmePath, 'utf-8');
    expect(content).toContain('## Documentation Index');
    expect(content).toContain('docs/IMPLEMENTATION_GUIDES.md');
    expect(content).toContain('docs/SECURITY_AND_DEPENDENCIES.md');
    expect(content).toContain('docs/Toast.md');
  });
});

