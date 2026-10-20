import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from '../useOnlineStatus';

describe('useOnlineStatus', () => {
  beforeEach(() => {
    // Restore navigator.onLine to true between tests.
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    // Clean up any event listeners left by the hook (wrapped in act to
    // avoid "not wrapped in act" warnings from lingering state updates).
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
  });

  it('returns true on initial render (SSR-safe default)', () => {
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it('syncs to navigator.onLine after mount', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    const { result } = renderHook(() => useOnlineStatus());

    // After the effect runs, the state should reflect navigator.onLine.
    expect(result.current).toBe(false);
  });

  it('updates to false when offline event fires', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });

    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current).toBe(true);

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe(false);
  });

  it('updates to true when online event fires', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current).toBe(false);

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current).toBe(true);
  });

  it('removes event listeners on unmount', () => {
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useOnlineStatus());

    // Verify listeners were added
    expect(addEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

    unmount();

    // Verify listeners were removed
    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it('does not add duplicate listeners on re-render', () => {
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');

    const { rerender } = renderHook(() => useOnlineStatus());

    const callsAfterFirstRender = addEventListenerSpy.mock.calls.length;

    rerender();

    // The effect has [] deps, so no new listeners should be added.
    expect(addEventListenerSpy.mock.calls.length).toBe(callsAfterFirstRender);

    addEventListenerSpy.mockRestore();
  });
});
