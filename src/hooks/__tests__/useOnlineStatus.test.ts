import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

describe('useOnlineStatus', () => {
  const originalOnLine = navigator.onLine;

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: originalOnLine,
    });
    jest.restoreAllMocks();
  });

  it('initializes with navigator.onLine value when true', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });

    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);
  });

  it('initializes with navigator.onLine value when false', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(false);
  });

  it('updates isOnline to false when offline event is dispatched', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });

    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it('updates isOnline to true when online event is dispatched', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });

    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.isOnline).toBe(true);
  });

  it('removes event listeners on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useOnlineStatus());
    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('offline', expect.any(Function));
  });

  it('defaults to true when navigator.onLine is undefined', () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: undefined,
    });

    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);
  });
});
