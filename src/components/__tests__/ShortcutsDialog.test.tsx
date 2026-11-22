import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ShortcutsDialog } from '../ShortcutsDialog';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Show shortcuts
      </button>
      <ShortcutsDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

describe('ShortcutsDialog', () => {
  it('lists every dashboard and global shortcut when open', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Show shortcuts' }));
    const dialog = await screen.findByRole('dialog', { name: /keyboard shortcuts/i });

    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Focus next escrow card')).toBeInTheDocument();
    expect(screen.getByText('Focus previous escrow card')).toBeInTheDocument();
    expect(screen.getByText('Focus search input')).toBeInTheDocument();
    expect(screen.getByText('Open keyboard shortcuts dialog')).toBeInTheDocument();
    expect(screen.getByText('Open command palette')).toBeInTheDocument();
    expect(screen.getByText('Clear search or close open dialog')).toBeInTheDocument();
  });

  it('focuses the Close button on open and restores focus to the trigger on close', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Show shortcuts' });
    await user.click(trigger);

    const closeBtn = await screen.findByRole('button', { name: /close keyboard shortcuts/i });
    expect(closeBtn).toHaveFocus();

    await user.click(closeBtn);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes on Escape and restores focus', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Show shortcuts' });
    await user.click(trigger);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('closes on backdrop click', async () => {
    const onClose = vi.fn();
    render(<ShortcutsDialog open={true} onClose={onClose} />);

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(dialog);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
