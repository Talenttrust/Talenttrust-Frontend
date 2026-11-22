import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDisclosure } from '../useDisclosure';

function DisclosureHarness() {
  const { open, toggle, close, triggerRef, panelRef } = useDisclosure();

  return (
    <div>
      <button
        type="button"
        ref={triggerRef}
        aria-expanded={open}
        onClick={toggle}
      >
        Toggle
      </button>

      {open && (
        <div
          ref={panelRef as React.RefObject<HTMLDivElement>}
          data-testid="panel"
        >
          <button type="button">Panel Action 1</button>
          <button type="button">Panel Action 2</button>
          <button type="button" onClick={close}>
            Close
          </button>
        </div>
      )}

      <button type="button">Outside</button>
    </div>
  );
}

describe('useDisclosure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts closed and toggles open and closed', () => {
    render(<DisclosureHarness />);

    const trigger = screen.getByRole('button', { name: 'Toggle' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('panel')).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  it('closes when close() is called', () => {
    render(<DisclosureHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.getByTestId('panel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    render(<DisclosureHarness />);

    const trigger = screen.getByRole('button', { name: 'Toggle' });
    fireEvent.click(trigger);

    const panelAction = screen.getByRole('button', { name: 'Panel Action 1' });
    panelAction.focus();
    expect(panelAction).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('does not close on non-Escape keydown', () => {
    render(<DisclosureHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    fireEvent.keyDown(document, { key: 'Enter' });

    expect(screen.getByTestId('panel')).toBeInTheDocument();
  });

  it('closes on pointerdown outside the panel and trigger', () => {
    render(<DisclosureHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(screen.getByTestId('panel')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  it('does not close on pointerdown inside the panel or on the trigger', () => {
    render(<DisclosureHarness />);

    const trigger = screen.getByRole('button', { name: 'Toggle' });
    fireEvent.click(trigger);

    const panelAction = screen.getByRole('button', { name: 'Panel Action 1' });
    fireEvent.pointerDown(panelAction);
    expect(screen.getByTestId('panel')).toBeInTheDocument();

    fireEvent.pointerDown(trigger);
    expect(screen.getByTestId('panel')).toBeInTheDocument();
  });

  it('closes when focus leaves the panel to an outside element', () => {
    render(<DisclosureHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    const panelAction = screen.getByRole('button', { name: 'Panel Action 1' });
    const outsideButton = screen.getByRole('button', { name: 'Outside' });

    fireEvent.focusOut(panelAction, { relatedTarget: outsideButton });
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  it('does not close when focus moves within the panel or to the trigger', () => {
    render(<DisclosureHarness />);

    const trigger = screen.getByRole('button', { name: 'Toggle' });
    fireEvent.click(trigger);

    const panelAction1 = screen.getByRole('button', { name: 'Panel Action 1' });
    const panelAction2 = screen.getByRole('button', { name: 'Panel Action 2' });

    fireEvent.focusOut(panelAction1, { relatedTarget: panelAction2 });
    expect(screen.getByTestId('panel')).toBeInTheDocument();

    fireEvent.focusOut(panelAction2, { relatedTarget: trigger });
    expect(screen.getByTestId('panel')).toBeInTheDocument();
  });

  it('registers document listeners only while open and removes them on unmount', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const { unmount } = render(<DisclosureHarness />);

    // Closed initially: no keydown or pointerdown listeners registered
    expect(addSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(addSpy).not.toHaveBeenCalledWith('pointerdown', expect.any(Function));

    // Open: listeners are registered
    fireEvent.click(screen.getByRole('button', { name: 'Toggle' }));
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(addSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));

    const panel = screen.getByTestId('panel');
    const panelRemoveSpy = vi.spyOn(panel, 'removeEventListener');

    // Unmount while open: all listeners are cleaned up
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    expect(panelRemoveSpy).toHaveBeenCalledWith('focusout', expect.any(Function));
  });
});
