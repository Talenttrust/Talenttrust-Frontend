'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { ContractQuery } from '@/lib/contractQuery';
import type { ViewFilter } from '@/lib/api';
import {
  addPreset,
  deletePreset,
  loadPresets,
  presetToSearch,
  renamePreset,
  searchToPreset,
  type FilterPreset,
} from '@/lib/filterPresets';

interface FilterPresetsProps {
  query: ContractQuery;
  view: ViewFilter;
  onApply: (query: ContractQuery, view: ViewFilter) => void;
}

export function FilterPresets({ query, view, onApply }: FilterPresetsProps) {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const saveInputId = useId();
  const renameInputId = useId();

  useEffect(() => {
    setPresets(loadPresets().presets);
  }, []);

  useEffect(() => {
    if (open) {
      const firstAction = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
      (firstAction ?? panelRef.current?.querySelector<HTMLButtonElement>('button'))?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (renaming) renameInputRef.current?.focus();
  }, [renaming]);

  useEffect(() => {
    if (saving) saveInputRef.current?.focus();
  }, [saving]);

  const apply = (preset: FilterPreset) => {
    onApply(preset.query, preset.view);
    setOpen(false);
    triggerRef.current?.focus();
    setAnnouncement(`Applied filter preset ${preset.name}.`);
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const currentSearch = presetToSearch({ query: { ...query, page: 1 }, view });
    const preset = searchToPreset(currentSearch, presetName);
    const result = addPreset(preset);
    if (result.error) {
      setError(result.error);
      setAnnouncement(result.error);
      return;
    }

    setPresets(result.presets);
    setPresetName('');
    setSaving(false);
    setError('');
    setAnnouncement(`Saved filter preset ${preset.name}.`);
  };

  const rename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renaming) return;
    const result = renamePreset(renaming, renameValue);
    if (result.error) {
      setError(result.error);
      setAnnouncement(result.error);
      return;
    }

    const renamed = result.presets.find((preset) => preset.name === renameValue.trim());
    setPresets(result.presets);
    setRenaming(null);
    setRenameValue('');
    setError('');
    setAnnouncement(`Renamed preset to ${renamed?.name ?? renameValue.trim()}.`);
  };

  const remove = (name: string) => {
    const result = deletePreset(name);
    if (result.error) {
      setError(result.error);
      setAnnouncement(result.error);
      return;
    }
    setPresets(result.presets);
    setRenaming(null);
    setError('');
    setAnnouncement(`Deleted filter preset ${name}.`);
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  const closeOnEscape = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="filter-presets">
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-secondary btn-sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        Saved filters ({presets.length})
      </button>

      <div
        ref={panelRef}
        id={menuId}
        className="filter-presets-panel"
        role="dialog"
        aria-label="Saved filters"
        hidden={!open}
        onKeyDown={closeOnEscape}
      >
        {error && <p className="alert alert-error" role="alert">{error}</p>}

        {saving ? (
          <form onSubmit={save} aria-label="Save current filters as preset">
            <div className="field">
              <label htmlFor={saveInputId}>Preset name</label>
              <input
                ref={saveInputRef}
                id={saveInputId}
                className="input"
                value={presetName}
                maxLength={40}
                onChange={(event) => setPresetName(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="row">
              <button type="submit" className="btn btn-primary btn-sm">Save preset</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSaving(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setSaving(true)}>
            Save current filters
          </button>
        )}

        {presets.length > 0 ? (
          <ul ref={menuRef} role="menu" aria-label="Saved filter presets" onKeyDown={handleMenuKeyDown}>
            {presets.map((preset) => (
              <li key={preset.name} role="none">
                <div role="group" aria-label={`${preset.name} preset`}>
                  <button type="button" role="menuitem" onClick={() => apply(preset)}>
                    Apply {preset.name}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={`Rename ${preset.name}`}
                    onClick={() => {
                      setRenaming(preset.name);
                      setRenameValue(preset.name);
                      setError('');
                    }}
                  >
                    Rename
                  </button>
                  <button type="button" role="menuitem" aria-label={`Delete ${preset.name}`} onClick={() => remove(preset.name)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">No saved filters yet.</p>
        )}

        {renaming && (
          <form onSubmit={rename} aria-label={`Rename ${renaming} preset`}>
            <div className="field">
              <label htmlFor={renameInputId}>New preset name</label>
              <input
                ref={renameInputRef}
                id={renameInputId}
                className="input"
                value={renameValue}
                maxLength={40}
                onChange={(event) => setRenameValue(event.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="row">
              <button type="submit" className="btn btn-primary btn-sm">Rename preset</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRenaming(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
    </div>
  );
}
