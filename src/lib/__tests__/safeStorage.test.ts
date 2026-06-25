import { getItem, setItem, removeItem, resetCache } from '../safeStorage';

describe('safeStorage', () => {
  let originalLocalStorage: Storage;
  let originalWindow: typeof window & typeof globalThis;
  let consoleWarnSpy: jest.SpyInstance;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalLocalStorage = window.localStorage;
    originalWindow = global.window;
    originalNodeEnv = process.env.NODE_ENV;
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    resetCache();
    jest.resetModules();
  });

  afterEach(() => {
    global.window = originalWindow;
    Object.defineProperty(window, 'localStorage', {
      value: originalLocalStorage,
      writable: true,
      configurable: true,
    });
    process.env.NODE_ENV = originalNodeEnv;
    consoleWarnSpy.mockRestore();
  });

  it('behaves normally when localStorage is fully functional', () => {
    setItem('test-key', 'test-value');
    expect(getItem('test-key')).toBe('test-value');
    expect(window.localStorage.getItem('test-key')).toBe('test-value');

    removeItem('test-key');
    expect(getItem('test-key')).toBeNull();
    expect(window.localStorage.getItem('test-key')).toBeNull();
  });

  it('degrades to in-memory fallback in SSR (no window)', () => {
    // Delete window to simulate SSR
    // @ts-ignore
    delete global.window;

    jest.isolateModules(() => {
      const { setItem: ssrSet, getItem: ssrGet } = require('../safeStorage');
      ssrSet('ssr-key', 'ssr-val');
      expect(ssrGet('ssr-key')).toBe('ssr-val');
    });
  });

  it('degrades to in-memory fallback when localStorage is disabled (throws on access)', () => {
    // Simulate disabled storage by throwing on localStorage access
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('SecurityError: The operation is insecure.');
      },
      configurable: true,
    });

    jest.isolateModules(() => {
      const { setItem: disabledSet, getItem: disabledGet } = require('../safeStorage');
      disabledSet('disabled-key', 'disabled-val');
      expect(disabledGet('disabled-key')).toBe('disabled-val');
    });
  });

  it('handles quota exceeded error on write and falls back to in-memory', () => {
    const setItemMock = jest.fn().mockImplementation((key) => {
      if (key === '__storage_test__') {
        return;
      }
      throw new Error('QuotaExceededError: The quota has been exceeded.');
    });

    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => null,
        setItem: setItemMock,
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      },
      configurable: true,
      writable: true,
    });

    jest.isolateModules(() => {
      const { setItem: quotaSet, getItem: quotaGet } = require('../safeStorage');
      quotaSet('quota-key', 'quota-val');
      expect(setItemMock).toHaveBeenCalledWith('quota-key', 'quota-val');
      expect(quotaGet('quota-key')).toBe('quota-val');
    });
  });

  it('handles errors during reading and falls back to in-memory', () => {
    const getItemMock = jest.fn().mockImplementation(() => {
      throw new Error('SecurityError: Read forbidden.');
    });

    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: getItemMock,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0,
      },
      configurable: true,
      writable: true,
    });

    jest.isolateModules(() => {
      const { setItem: readSet, getItem: readGet } = require('../safeStorage');
      readSet('read-key', 'read-val');
      expect(readGet('read-key')).toBe('read-val');
      expect(getItemMock).toHaveBeenCalledWith('read-key');
    });
  });

  it('logs warning at most once in development and never in production', () => {
    // 1. In production, no warnings should be logged
    process.env.NODE_ENV = 'production';
    
    // Simulate disabled storage
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
      configurable: true,
    });

    jest.isolateModules(() => {
      const { getItem: prodGet } = require('../safeStorage');
      prodGet('any-key');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    // 2. In development, warning is logged at most once
    process.env.NODE_ENV = 'development';

    jest.isolateModules(() => {
      const { getItem: devGet } = require('../safeStorage');
      devGet('any-key');
      devGet('another-key');
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    });
  });
});
