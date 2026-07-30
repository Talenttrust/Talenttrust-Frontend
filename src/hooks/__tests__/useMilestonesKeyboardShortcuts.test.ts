import { fireEvent, renderHook } from '@testing-library/react';
import { useMilestonesKeyboardShortcuts } from '../useMilestonesKeyboardShortcuts';

describe('useMilestonesKeyboardShortcuts', () => {
  it('Ctrl+Shift+N triggers onAddMilestone', () => {
    const onAddMilestone = jest.fn();
    const onAddToCalendar = jest.fn();
    renderHook(() => useMilestonesKeyboardShortcuts({ onAddMilestone, onAddToCalendar }));

    fireEvent.keyDown(document, { key: 'n', ctrlKey: true, shiftKey: true });

    expect(onAddMilestone).toHaveBeenCalledTimes(1);
    expect(onAddToCalendar).not.toHaveBeenCalled();
  });

  it('Ctrl+Shift+C triggers onAddToCalendar', () => {
    const onAddMilestone = jest.fn();
    const onAddToCalendar = jest.fn();
    renderHook(() => useMilestonesKeyboardShortcuts({ onAddMilestone, onAddToCalendar }));

    fireEvent.keyDown(document, { key: 'c', ctrlKey: true, shiftKey: true });

    expect(onAddToCalendar).toHaveBeenCalledTimes(1);
    expect(onAddMilestone).not.toHaveBeenCalled();
  });

  it('Meta+Shift+N (Mac) also triggers onAddMilestone', () => {
    const onAddMilestone = jest.fn();
    const onAddToCalendar = jest.fn();
    renderHook(() => useMilestonesKeyboardShortcuts({ onAddMilestone, onAddToCalendar }));

    fireEvent.keyDown(document, { key: 'n', metaKey: true, shiftKey: true });

    expect(onAddMilestone).toHaveBeenCalledTimes(1);
  });

  it('plain Ctrl+N (no Shift) is ignored — avoids clashing with the browser', () => {
    const onAddMilestone = jest.fn();
    const onAddToCalendar = jest.fn();
    renderHook(() => useMilestonesKeyboardShortcuts({ onAddMilestone, onAddToCalendar }));

    fireEvent.keyDown(document, { key: 'n', ctrlKey: true, shiftKey: false });

    expect(onAddMilestone).not.toHaveBeenCalled();
  });

  it('plain "n" with no modifier is ignored', () => {
    const onAddMilestone = jest.fn();
    const onAddToCalendar = jest.fn();
    renderHook(() => useMilestonesKeyboardShortcuts({ onAddMilestone, onAddToCalendar }));

    fireEvent.keyDown(document, { key: 'n' });

    expect(onAddMilestone).not.toHaveBeenCalled();
  });

  it('is ignored while an input has focus (respects typing)', () => {
    const onAddMilestone = jest.fn();
    const onAddToCalendar = jest.fn();
    renderHook(() => useMilestonesKeyboardShortcuts({ onAddMilestone, onAddToCalendar }));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(input, { key: 'n', ctrlKey: true, shiftKey: true });

    expect(onAddMilestone).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('is ignored while a textarea has focus', () => {
    const onAddMilestone = jest.fn();
    const onAddToCalendar = jest.fn();
    renderHook(() => useMilestonesKeyboardShortcuts({ onAddMilestone, onAddToCalendar }));

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    fireEvent.keyDown(textarea, { key: 'c', ctrlKey: true, shiftKey: true });

    expect(onAddToCalendar).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it('does nothing when enabled is false', () => {
    const onAddMilestone = jest.fn();
    const onAddToCalendar = jest.fn();
    renderHook(() =>
      useMilestonesKeyboardShortcuts({ onAddMilestone, onAddToCalendar, enabled: false }),
    );

    fireEvent.keyDown(document, { key: 'n', ctrlKey: true, shiftKey: true });

    expect(onAddMilestone).not.toHaveBeenCalled();
  });

  it('removes its listener on unmount', () => {
    const onAddMilestone = jest.fn();
    const onAddToCalendar = jest.fn();
    const { unmount } = renderHook(() =>
      useMilestonesKeyboardShortcuts({ onAddMilestone, onAddToCalendar }),
    );

    unmount();
    fireEvent.keyDown(document, { key: 'n', ctrlKey: true, shiftKey: true });

    expect(onAddMilestone).not.toHaveBeenCalled();
  });
});
