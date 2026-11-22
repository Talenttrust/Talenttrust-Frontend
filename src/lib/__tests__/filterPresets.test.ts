import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addPreset,
  FILTER_PRESETS_KEY,
  FILTER_PRESETS_MAX,
  FILTER_PRESETS_VERSION,
  loadPresets,
  presetToSearch,
  searchToPreset,
} from '@/lib/filterPresets';
import { DEFAULT_QUERY } from '@/lib/contractQuery';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('filter preset store', () => {
  it('trims names, persists filters, and rejects case-insensitive duplicates', () => {
    const saved = addPreset({
      name: '  Funded clients  ',
      query: { ...DEFAULT_QUERY, status: 'Funded', q: 'design', sort: 'oldest' },
      view: 'client',
    });

    expect(saved.error).toBeUndefined();
    expect(saved.presets[0].name).toBe('Funded clients');
    expect(loadPresets().presets).toEqual(saved.presets);
    expect(addPreset({ ...saved.presets[0], name: 'funded clients' }).error).toMatch(/already exists/i);
  });

  it('enforces the ten-preset limit and validates names', () => {
    for (let index = 0; index < FILTER_PRESETS_MAX; index += 1) {
      expect(addPreset({ name: `Preset ${index}`, query: DEFAULT_QUERY, view: 'all' }).error).toBeUndefined();
    }

    expect(addPreset({ name: 'One too many', query: DEFAULT_QUERY, view: 'all' }).error).toMatch(/up to 10/i);
    expect(addPreset({ name: '   ', query: DEFAULT_QUERY, view: 'all' }).error).toMatch(/enter a name/i);
    expect(addPreset({ name: 'x'.repeat(41), query: DEFAULT_QUERY, view: 'all' }).error).toMatch(/40 characters/i);
    expect(loadPresets().presets).toHaveLength(FILTER_PRESETS_MAX);
  });

  it('round-trips the query and role view through URL search parameters', () => {
    const original = {
      name: 'Current filters',
      query: { status: 'Funded' as const, q: 'design work', sort: 'oldest' as const, page: 3 },
      view: 'freelancer' as const,
    };

    const search = presetToSearch(original);
    const restored = searchToPreset(search.toString(), original.name);

    expect(restored).toEqual(original);
  });

  it('warns and resets corrupt local storage without throwing', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(FILTER_PRESETS_KEY, '{bad json');

    expect(() => loadPresets()).not.toThrow();
    expect(loadPresets()).toEqual({ version: FILTER_PRESETS_VERSION, presets: [] });
    expect(warning).toHaveBeenCalledWith(expect.stringMatching(/corrupt|unknown format/i));
    expect(JSON.parse(localStorage.getItem(FILTER_PRESETS_KEY) ?? '{}')).toEqual({
      version: FILTER_PRESETS_VERSION,
      presets: [],
    });
  });
});
