/**
 * reputationExport.test.ts
 *
 * Tests for src/lib/reputationExport.ts.
 * Covers: CSV escaping edge cases, exporting the current visible/filtered
 * data (not the whole dataset), empty-view behavior, JSON export, and the
 * client-side download trigger.
 */

import { exportReputationHistory } from '../reputationExport';
import type { ReputationEvent } from '@/components/ReputationProfile';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeEvent = (overrides: Partial<ReputationEvent> = {}): ReputationEvent => ({
  id: 'rep-001',
  type: 'endorsement',
  summary: 'Delivered milestone on time',
  date: '2026-05-15',
  version: 1,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Download-trigger harness (mirrors icsExport.test.ts)
// ---------------------------------------------------------------------------

describe('exportReputationHistory', () => {
  let createObjectURLMock: jest.Mock;
  let revokeObjectURLMock: jest.Mock;
  let appendChildSpy: jest.SpyInstance;
  let removeChildSpy: jest.SpyInstance;
  let clickSpy: jest.Mock;
  // Captured string content of each Blob created during a test. jsdom's Blob
  // does not implement async .text(), so we capture the parts synchronously.
  let blobContents: string[];

  beforeEach(() => {
    createObjectURLMock = jest.fn().mockReturnValue('blob:fake-rep-url');
    revokeObjectURLMock = jest.fn();
    clickSpy = jest.fn();
    blobContents = [];

    const OriginalBlob = global.Blob;
    jest
      .spyOn(global, 'Blob')
      .mockImplementation(
        (...args: ConstructorParameters<typeof Blob>) => {
          const [parts, options] = args;
          blobContents.push((parts ?? []).map(String).join(''));
          return new OriginalBlob(parts, options);
        }
      );

    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: clickSpy, writable: true });
      }
      return el;
    });

    appendChildSpy = jest.spyOn(document.body, 'appendChild');
    removeChildSpy = jest.spyOn(document.body, 'removeChild');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Helper: read back the string content written into the first Blob.
  const readBlobText = (): string => blobContents[0];

  // -------------------------------------------------------------------------
  // CSV escaping edge cases
  // -------------------------------------------------------------------------

  describe('CSV escaping', () => {
    it('quotes and escapes commas, quotes, and newlines in values', () => {
      const events = [
        makeEvent({
          id: 'rep-esc',
          summary: 'Said "great", then\nmoved on, quickly',
        }),
      ];
      exportReputationHistory(events, 'csv');

      const text = readBlobText();
      // Header row is quoted.
      expect(text).toContain('"id","type","summary","date","version"');
      // Embedded double-quotes are doubled; the whole field stays wrapped in quotes.
      expect(text).toContain('"Said ""great"", then\nmoved on, quickly"');
    });

    it('renders empty/null-ish values as empty quoted fields', () => {
      // version is optional; the adapter maps a missing version to ''.
      const events = [makeEvent({ id: 'rep-empty', summary: '', version: undefined })];
      exportReputationHistory(events, 'csv');

      const text = readBlobText();
      const dataRow = text.split('\n').slice(1).join('\n');
      // Empty summary and empty version both serialize as "".
      expect(dataRow).toContain('""');
      expect(dataRow.startsWith('"rep-empty"')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Respects the provided (filtered/visible) data set
  // -------------------------------------------------------------------------

  it('exports exactly the events passed in, not more', () => {
    const visible = [
      makeEvent({ id: 'rep-a', summary: 'A' }),
      makeEvent({ id: 'rep-b', summary: 'B' }),
    ];
    exportReputationHistory(visible, 'json');

    const text = readBlobText();
    const parsed = JSON.parse(text) as Array<{ id: string }>;
    expect(parsed).toHaveLength(2);
    expect(parsed.map((r) => r.id)).toEqual(['rep-a', 'rep-b']);
  });

  // -------------------------------------------------------------------------
  // Empty view behavior — no download, no throw
  // -------------------------------------------------------------------------

  it('does not trigger a download when there are no events', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => exportReputationHistory([], 'csv')).not.toThrow();
    expect(createObjectURLMock).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // JSON export
  // -------------------------------------------------------------------------

  it('produces pretty-printed JSON with the mapped fields', () => {
    const events = [makeEvent({ id: 'rep-json', version: 3 })];
    exportReputationHistory(events, 'json');

    const blob = createObjectURLMock.mock.calls[0][0] as Blob;
    expect(blob.type).toContain('application/json');

    const text = readBlobText();
    expect(text).toContain('\n'); // pretty-printed (indented)
    const parsed = JSON.parse(text) as Array<Record<string, unknown>>;
    expect(parsed[0]).toEqual({
      id: 'rep-json',
      type: 'endorsement',
      summary: 'Delivered milestone on time',
      date: '2026-05-15',
      version: 3,
    });
  });

  // -------------------------------------------------------------------------
  // Download trigger (CSV activation)
  // -------------------------------------------------------------------------

  describe('download trigger', () => {
    it('creates a CSV Blob and clicks an anchor with a .csv filename', () => {
      exportReputationHistory([makeEvent()], 'csv', 'my-reputation');

      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      const blob = createObjectURLMock.mock.calls[0][0] as Blob;
      expect(blob.type).toContain('text/csv');

      const anchor = appendChildSpy.mock.calls[0][0] as HTMLAnchorElement;
      expect(anchor.download).toBe('my-reputation.csv');
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('creates a JSON Blob and clicks an anchor with a .json filename', () => {
      exportReputationHistory([makeEvent()], 'json', 'my-reputation');

      const anchor = appendChildSpy.mock.calls[0][0] as HTMLAnchorElement;
      expect(anchor.download).toBe('my-reputation.json');
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('revokes the object URL after triggering the download', () => {
      exportReputationHistory([makeEvent()], 'csv');
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:fake-rep-url');
      expect(removeChildSpy).toHaveBeenCalledTimes(1);
    });
  });
});
