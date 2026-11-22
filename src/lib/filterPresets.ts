import type { ViewFilter } from './api';
import {
  parseQuery,
  SORTS,
  STATUSES,
  toSearchParams,
} from './contractQuery';
import type { ContractQuery } from './contractQuery';

export const FILTER_PRESETS_KEY = 'tt.filter-presets.v1';
export const FILTER_PRESETS_VERSION = 1;
export const FILTER_PRESETS_MAX = 10;

export interface FilterPreset {
  name: string;
  query: ContractQuery;
  view: ViewFilter;
}

export interface FilterPresetStore {
  version: number;
  presets: FilterPreset[];
}

export interface PresetResult {
  presets: FilterPreset[];
  error?: string;
}

const emptyStore = (): FilterPresetStore => ({ version: FILTER_PRESETS_VERSION, presets: [] });
const normalizedName = (name: string) => name.trim();
const nameKey = (name: string) => normalizedName(name).toLowerCase();
const validViews: ViewFilter[] = ['all', 'client', 'freelancer'];

function isContractQuery(value: unknown): value is ContractQuery {
  if (!value || typeof value !== 'object') return false;
  const query = value as Record<string, unknown>;
  return (
    (query.status === '' || (typeof query.status === 'string' && (STATUSES as string[]).includes(query.status))) &&
    typeof query.q === 'string' &&
    query.q === query.q.trim() &&
    typeof query.sort === 'string' &&
    Object.prototype.hasOwnProperty.call(SORTS, query.sort) &&
    typeof query.page === 'number' &&
    Number.isSafeInteger(query.page) &&
    query.page > 0
  );
}

function isPreset(value: unknown): value is FilterPreset {
  if (!value || typeof value !== 'object') return false;
  const preset = value as Record<string, unknown>;
  return (
    typeof preset.name === 'string' &&
    preset.name === normalizedName(preset.name) &&
    preset.name.length >= 1 &&
    preset.name.length <= 40 &&
    isContractQuery(preset.query) &&
    typeof preset.view === 'string' &&
    validViews.includes(preset.view as ViewFilter)
  );
}

function isPresetList(value: unknown): value is FilterPreset[] {
  if (!Array.isArray(value) || !value.every(isPreset)) return false;
  return new Set(value.map((preset) => nameKey(preset.name))).size === value.length;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadPresets(): FilterPresetStore {
  const store = storage();
  if (!store) return emptyStore();

  let raw: string | null;
  try {
    raw = store.getItem(FILTER_PRESETS_KEY);
  } catch {
    return emptyStore();
  }
  if (!raw) return emptyStore();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid preset store');
    const value = parsed as Record<string, unknown>;
    if (value.version !== FILTER_PRESETS_VERSION || !isPresetList(value.presets)) {
      throw new Error('Invalid preset store');
    }

    const presets = value.presets.slice(0, FILTER_PRESETS_MAX);
    if (value.presets.length > FILTER_PRESETS_MAX) {
      console.warn('Too many saved filter presets; extra presets have been removed.');
      savePresets({ version: FILTER_PRESETS_VERSION, presets });
    }
    return { version: FILTER_PRESETS_VERSION, presets };
  } catch {
    console.warn('Saved filter presets were corrupt or in an unknown format and have been reset.');
    const empty = emptyStore();
    savePresets(empty);
    return empty;
  }
}

export function savePresets(store: FilterPresetStore): boolean {
  const target = storage();
  if (!target) return false;
  if (
    store.version !== FILTER_PRESETS_VERSION ||
    store.presets.length > FILTER_PRESETS_MAX ||
    !isPresetList(store.presets)
  ) {
    console.warn('Could not persist invalid saved filter presets.');
    return false;
  }

  try {
    target.setItem(FILTER_PRESETS_KEY, JSON.stringify(store));
    return true;
  } catch {
    console.warn('Could not save filter presets (storage full or unavailable).');
    return false;
  }
}

function validateName(name: string, existing: FilterPreset[], except?: string): string | undefined {
  const trimmed = normalizedName(name);
  if (!trimmed) return 'Enter a name for this preset.';
  if (trimmed.length > 40) return 'Preset names must be 40 characters or fewer.';
  if (
    existing.some(
      (preset) => nameKey(preset.name) === nameKey(trimmed) && nameKey(preset.name) !== nameKey(except ?? ''),
    )
  ) {
    return 'A preset with that name already exists.';
  }
  return undefined;
}

export function addPreset(preset: FilterPreset): PresetResult {
  const { presets } = loadPresets();
  const name = normalizedName(preset.name);
  const nameError = validateName(name, presets);
  if (nameError) return { presets, error: nameError };
  if (!isPreset({ ...preset, name })) {
    return { presets, error: 'The current filters are invalid and could not be saved.' };
  }
  if (presets.length >= FILTER_PRESETS_MAX) {
    return { presets, error: `You can save up to ${FILTER_PRESETS_MAX} presets.` };
  }

  const next = [...presets, { ...preset, name }];
  if (!savePresets({ version: FILTER_PRESETS_VERSION, presets: next })) {
    return { presets, error: 'Could not save the preset. Check your browser storage and try again.' };
  }
  return { presets: next };
}

export function renamePreset(currentName: string, nextName: string): PresetResult {
  const { presets } = loadPresets();
  const index = presets.findIndex((preset) => nameKey(preset.name) === nameKey(currentName));
  if (index < 0) return { presets, error: 'That preset no longer exists.' };
  const name = normalizedName(nextName);
  const nameError = validateName(name, presets, currentName);
  if (nameError) return { presets, error: nameError };

  const next = presets.map((preset, i) => (i === index ? { ...preset, name } : preset));
  if (!savePresets({ version: FILTER_PRESETS_VERSION, presets: next })) {
    return { presets, error: 'Could not rename the preset. Check your browser storage and try again.' };
  }
  return { presets: next };
}

export function deletePreset(name: string): PresetResult {
  const { presets } = loadPresets();
  const next = presets.filter((preset) => nameKey(preset.name) !== nameKey(name));
  if (next.length === presets.length) return { presets, error: 'That preset no longer exists.' };
  if (!savePresets({ version: FILTER_PRESETS_VERSION, presets: next })) {
    return { presets, error: 'Could not delete the preset. Check your browser storage and try again.' };
  }
  return { presets: next };
}

export function presetToSearch(preset: Pick<FilterPreset, 'query' | 'view'>): URLSearchParams {
  const params = toSearchParams(preset.query);
  if (preset.view !== 'all') params.set('view', preset.view);
  return params;
}

export function searchToPreset(search: string | URLSearchParams, name: string): FilterPreset {
  const params =
    typeof search === 'string'
      ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
      : new URLSearchParams(search);
  const view = params.get('view');
  return {
    name: normalizedName(name),
    query: parseQuery(params),
    view: validViews.includes(view as ViewFilter) ? (view as ViewFilter) : 'all',
  };
}
