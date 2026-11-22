import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_QUERY } from '@/lib/contractQuery';
import {
  addPreset,
  loadPresets,
  presetToSearch,
  searchToPreset,
} from '@/lib/filterPresets';
import { FilterPresets } from '../FilterPresets';

beforeEach(() => {
  localStorage.clear();
});

describe('FilterPresets', () => {
  it('saves the current filters and restores them after remounting', async () => {
    const user = userEvent.setup();
    const query = { ...DEFAULT_QUERY, status: 'Funded' as const, q: 'design', sort: 'oldest' as const };
    const view = 'client';
    const onApply = vi.fn();

    const { unmount } = render(<FilterPresets query={query} view={view} onApply={onApply} />);
    await user.click(screen.getByRole('button', { name: /saved filters/i }));
    await user.click(screen.getByRole('button', { name: 'Save current filters' }));
    await user.type(screen.getByLabelText('Preset name'), 'Funded client work');
    await user.click(screen.getByRole('button', { name: 'Save preset' }));

    expect(screen.getByRole('status')).toHaveTextContent(/saved filter preset funded client work/i);
    expect(loadPresets().presets[0]).toEqual({
      name: 'Funded client work',
      query: { ...query, page: 1 },
      view,
    });
    unmount();

    render(<FilterPresets query={DEFAULT_QUERY} view="all" onApply={onApply} />);
    expect(await screen.findByRole('button', { name: 'Saved filters (1)' })).toBeInTheDocument();
  });

  it('applies, renames, and deletes a saved preset with menu actions', async () => {
    const user = userEvent.setup();
    const preset = searchToPreset('?status=Funded&q=design&sort=oldest&view=client', 'Funding');
    addPreset(preset);
    const onApply = vi.fn();
    render(<FilterPresets query={DEFAULT_QUERY} view="all" onApply={onApply} />);

    const trigger = await screen.findByRole('button', { name: 'Saved filters (1)' });
    await user.click(trigger);
    expect(screen.getByRole('menu', { name: 'Saved filter presets' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Apply Funding' }));
    expect(onApply).toHaveBeenCalledWith(preset.query, preset.view);
    expect(screen.getByRole('status')).toHaveTextContent(/applied filter preset funding/i);

    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Rename Funding' }));
    const renameInput = screen.getByLabelText('New preset name');
    await user.clear(renameInput);
    await user.type(renameInput, 'Client funding');
    await user.click(screen.getByRole('button', { name: 'Rename preset' }));
    expect(loadPresets().presets[0].name).toBe('Client funding');

    await user.click(screen.getByRole('menuitem', { name: 'Delete Client funding' }));
    expect(loadPresets().presets).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent(/deleted filter preset client funding/i);
  });

  it('announces duplicate names and leaves the existing preset unchanged', async () => {
    const user = userEvent.setup();
    addPreset(searchToPreset(presetToSearch({ query: DEFAULT_QUERY, view: 'all' }), 'Weekday'));
    const onApply = vi.fn();
    render(<FilterPresets query={DEFAULT_QUERY} view="all" onApply={onApply} />);

    await user.click(await screen.findByRole('button', { name: 'Saved filters (1)' }));
    await user.click(screen.getByRole('button', { name: 'Save current filters' }));
    await user.type(screen.getByLabelText('Preset name'), ' weekday ');
    await user.click(screen.getByRole('button', { name: 'Save preset' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/already exists/i);
    expect(loadPresets().presets).toHaveLength(1);
  });
});
