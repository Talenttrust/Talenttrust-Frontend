import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useHotkeys } from '../useHotkeys';

describe('useHotkeys', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('calls the registered handler for matching key presses and prevents default', () => {
    const onJ = vi.fn();
    const onK = vi.fn();
    renderHook(() => useHotkeys({ j: onJ, k: onK }));

    const event = new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true });
    window.dispatchEvent(event);

    expect(onJ).toHaveBeenCalledTimes(1);
    expect(onJ).toHaveBeenCalledWith(event);
    expect(onK).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not prevent default or call handlers for unregistered keys', () => {
    const onJ = vi.fn();
    renderHook(() => useHotkeys({ j: onJ }));

    const event = new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true });
    window.dispatchEvent(event);

    expect(onJ).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores events from input, textarea, select and contenteditable elements', () => {
    const onJ = vi.fn();
    const onSlash = vi.fn();
    render(
      <div>
        <input data-testid="input" />
        <textarea data-testid="textarea" />
        <select data-testid="select">
          <option value="a">A</option>
        </select>
        <div data-testid="editable" contentEditable="true" />
      </div>,
    );
    renderHook(() => useHotkeys({ j: onJ, '/': onSlash }));

    fireEvent.keyDown(screen.getByTestId('input'), { key: 'j' });
    fireEvent.keyDown(screen.getByTestId('textarea'), { key: 'j' });
    fireEvent.keyDown(screen.getByTestId('select'), { key: '/' });
    fireEvent.keyDown(screen.getByTestId('editable'), { key: 'j' });

    expect(onJ).not.toHaveBeenCalled();
    expect(onSlash).not.toHaveBeenCalled();
  });

  it('ignores events when a modifier key (Ctrl, Meta, Alt) is held', () => {
    const onJ = vi.fn();
    const onQuestion = vi.fn();
    renderHook(() => useHotkeys({ j: onJ, '?': onQuestion }));

    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'j', metaKey: true });
    fireEvent.keyDown(window, { key: 'j', altKey: true });

    expect(onJ).not.toHaveBeenCalled();

    // Shift is allowed when producing shifted characters like '?'
    fireEvent.keyDown(window, { key: '?', shiftKey: true });
    expect(onQuestion).toHaveBeenCalledTimes(1);
  });

  it('ignores events while any <dialog> is open', () => {
    const onJ = vi.fn();
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.appendChild(dialog);

    renderHook(() => useHotkeys({ j: onJ }));

    fireEvent.keyDown(window, { key: 'j' });
    expect(onJ).not.toHaveBeenCalled();

    dialog.removeAttribute('open');
    fireEvent.keyDown(window, { key: 'j' });
    expect(onJ).toHaveBeenCalledTimes(1);
  });

  it('does not trigger when enabled is false', () => {
    const onJ = vi.fn();
    renderHook(() => useHotkeys({ j: onJ }, { enabled: false }));

    fireEvent.keyDown(window, { key: 'j' });
    expect(onJ).not.toHaveBeenCalled();
  });

  it('cleans up the keydown listener on unmount', () => {
    const onJ = vi.fn();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useHotkeys({ j: onJ }));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

    fireEvent.keyDown(window, { key: 'j' });
    expect(onJ).not.toHaveBeenCalled();
  });
});
