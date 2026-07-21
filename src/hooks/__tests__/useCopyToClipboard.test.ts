import { renderHook, act } from '@testing-library/react';
import { useCopyToClipboard } from '../useCopyToClipboard';

describe('useCopyToClipboard', () => {
  let originalClipboard: typeof navigator.clipboard;

  beforeEach(() => {
    jest.useFakeTimers();
    originalClipboard = navigator.clipboard;
  });

  afterEach(() => {
    act(() => {
      jest.runAllTimers();
    });
    jest.useRealTimers();
    // Restore clipboard
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
  });

  function mockClipboard(impl: () => Promise<void> = () => Promise.resolve()) {
    const writeText = jest.fn().mockImplementation(impl);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    return writeText;
  }

  function removeClipboard() {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
  }

  it('should copy text successfully and reset copied state after delay', async () => {
    const writeTextMock = mockClipboard();
    const onSuccessMock = jest.fn();
    const onErrorMock = jest.fn();

    const { result } = renderHook(() =>
      useCopyToClipboard({ delay: 1000, onSuccess: onSuccessMock, onError: onErrorMock })
    );

    expect(result.current.copied).toBe(false);

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.copy('test text');
    });

    expect(success).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('test text');
    expect(result.current.copied).toBe(true);
    expect(onSuccessMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock).not.toHaveBeenCalled();

    // Advance timer close to the limit
    act(() => {
      jest.advanceTimersByTime(999);
    });
    expect(result.current.copied).toBe(true);

    // Advance past the limit
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.copied).toBe(false);
  });

  it('should use default delay of 2000ms if not specified', async () => {
    mockClipboard();
    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      await result.current.copy('test text');
    });

    expect(result.current.copied).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(result.current.copied).toBe(false);
  });

  it('should handle missing navigator.clipboard gracefully', async () => {
    removeClipboard();
    const onSuccessMock = jest.fn();
    const onErrorMock = jest.fn();

    const { result } = renderHook(() =>
      useCopyToClipboard({ onSuccess: onSuccessMock, onError: onErrorMock })
    );

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.copy('test text');
    });

    expect(success).toBe(false);
    expect(result.current.copied).toBe(false);
    expect(onSuccessMock).not.toHaveBeenCalled();
    expect(onErrorMock).toHaveBeenCalledTimes(1);
    expect(onErrorMock.mock.calls[0][0]).toBeInstanceOf(Error);
    expect((onErrorMock.mock.calls[0][0] as Error).message).toContain('supported');
  });

  it('should handle missing writeText method gracefully', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {}, // clipboard exists but no writeText
    });
    const onSuccessMock = jest.fn();
    const onErrorMock = jest.fn();

    const { result } = renderHook(() =>
      useCopyToClipboard({ onSuccess: onSuccessMock, onError: onErrorMock })
    );

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.copy('test text');
    });

    expect(success).toBe(false);
    expect(result.current.copied).toBe(false);
    expect(onSuccessMock).not.toHaveBeenCalled();
    expect(onErrorMock).toHaveBeenCalledTimes(1);
  });

  it('should handle writeText promise rejection gracefully', async () => {
    const error = new Error('Permission denied');
    mockClipboard(() => Promise.reject(error));
    const onSuccessMock = jest.fn();
    const onErrorMock = jest.fn();

    const { result } = renderHook(() =>
      useCopyToClipboard({ onSuccess: onSuccessMock, onError: onErrorMock })
    );

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.copy('test text');
    });

    expect(success).toBe(false);
    expect(result.current.copied).toBe(false);
    expect(onSuccessMock).not.toHaveBeenCalled();
    expect(onErrorMock).toHaveBeenCalledWith(error);
  });

  it('should clear existing timeout on subsequent copy operations', async () => {
    mockClipboard();
    const { result } = renderHook(() => useCopyToClipboard({ delay: 1000 }));

    await act(async () => {
      await result.current.copy('text 1');
    });
    expect(result.current.copied).toBe(true);

    // Wait 500ms
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Copy again
    await act(async () => {
      await result.current.copy('text 2');
    });
    expect(result.current.copied).toBe(true);

    // Wait another 600ms (total 1100ms since start, but only 600ms since second copy)
    act(() => {
      jest.advanceTimersByTime(600);
    });
    // Should still be true because second copy reset the 1000ms delay
    expect(result.current.copied).toBe(true);

    // Wait another 400ms (1000ms since second copy)
    act(() => {
      jest.advanceTimersByTime(400);
    });
    expect(result.current.copied).toBe(false);
  });

  it('should clear timeout on unmount', async () => {
    mockClipboard();
    const { result, unmount } = renderHook(() => useCopyToClipboard({ delay: 1000 }));

    await act(async () => {
      await result.current.copy('text');
    });

    expect(result.current.copied).toBe(true);

    // Unmount the hook
    unmount();

    // Advance time - should not cause state updates or errors
    act(() => {
      jest.advanceTimersByTime(1000);
    });
  });

  it('should not warn or update state when unmounted while the reset timer is still pending', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockClipboard();
    const { result, unmount } = renderHook(() => useCopyToClipboard({ delay: 1000 }));

    await act(async () => {
      await result.current.copy('text');
    });
    expect(result.current.copied).toBe(true);

    // Unmount while the reset timeout is still pending (not yet fired)
    unmount();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should not warn when unmounted while the clipboard write is still in flight', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    let resolveWrite: () => void = () => {};
    const writeText = jest.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        })
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const { result, unmount } = renderHook(() => useCopyToClipboard({ delay: 1000 }));

    let copyPromise: Promise<boolean>;
    act(() => {
      copyPromise = result.current.copy('text');
    });

    // Unmount before the clipboard write promise resolves
    unmount();

    await act(async () => {
      resolveWrite();
      await copyPromise;
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should handle SSR safety when navigator is undefined', async () => {
    // jsdom exposes `window` as a non-configurable global, so it cannot be
    // stubbed out here. `navigator` is configurable and is checked by the
    // same `typeof window === 'undefined' || typeof navigator === 'undefined'`
    // guard, so undefining it exercises the identical SSR branch.
    const originalNavigator = global.navigator;

    const onSuccessMock = jest.fn();
    const onErrorMock = jest.fn();

    const { result } = renderHook(() =>
      useCopyToClipboard({ onSuccess: onSuccessMock, onError: onErrorMock })
    );

    Object.defineProperty(global, 'navigator', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.copy('test');
    });

    expect(success).toBe(false);
    expect(onSuccessMock).not.toHaveBeenCalled();
    expect(onErrorMock).toHaveBeenCalledTimes(1);
    expect((onErrorMock.mock.calls[0][0] as Error).message).toContain('SSR');

    // Restore global
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });
});
