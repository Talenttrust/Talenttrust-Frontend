/**
 * Safe storage wrapper that provides defensive access to localStorage.
 * Handles SSR environments, private-browsing mode, disabled storage,
 * and quota-exceeded errors gracefully without throwing.
 */

let isStorageAvailableChecked = false;
let isStorageAvailable = false;
const fallbackStore: Record<string, string> = {};
let devErrorLogged = false;

/**
 * Logs a warning message once in development environments.
 * 
 * @param message - The warning message to log.
 * @param error - The associated error object.
 */
function logDevError(message: string, error: unknown): void {
  if (process.env.NODE_ENV === 'development' && !devErrorLogged) {
    console.warn(`[SafeStorage] ${message}`, error);
    devErrorLogged = true;
  }
}

/**
 * Checks if localStorage is available and functional.
 * This is executed once and cached.
 * 
 * @returns true if localStorage is fully operational, false otherwise.
 */
export function checkStorageAvailability(): boolean {
  if (isStorageAvailableChecked) {
    return isStorageAvailable;
  }
  if (typeof window === 'undefined') {
    isStorageAvailable = false;
    isStorageAvailableChecked = true;
    return false;
  }
  try {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    isStorageAvailable = true;
  } catch (error) {
    isStorageAvailable = false;
    logDevError('localStorage is not available. Falling back to in-memory storage.', error);
  }
  isStorageAvailableChecked = true;
  return isStorageAvailable;
}

/**
 * Safely retrieves an item from storage.
 * Falls back to in-memory store if localStorage is unavailable or throws.
 * 
 * @param key - The key of the item to retrieve.
 * @returns The stored string value, or null if not found.
 */
export function getItem(key: string): string | null {
  const available = checkStorageAvailability();
  if (available) {
    try {
      const value = window.localStorage.getItem(key);
      if (value !== null) {
        return value;
      }
    } catch (error) {
      logDevError(`Failed to getItem for key "${key}"`, error);
    }
  }
  return fallbackStore[key] !== undefined ? fallbackStore[key] : null;
}

/**
 * Safely writes an item to storage.
 * Falls back to in-memory store if localStorage is unavailable or throws (e.g. QuotaExceededError).
 * 
 * @param key - The key of the item to set.
 * @param value - The string value to store.
 */
export function setItem(key: string, value: string): void {
  const available = checkStorageAvailability();
  
  // Always update the fallback store to keep in-memory state in sync
  fallbackStore[key] = value;
  
  if (!available) {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    logDevError(`Failed to setItem for key "${key}"`, error);
  }
}

/**
 * Safely removes an item from storage.
 * 
 * @param key - The key of the item to remove.
 */
export function removeItem(key: string): void {
  const available = checkStorageAvailability();
  delete fallbackStore[key];
  
  if (!available) {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    logDevError(`Failed to removeItem for key "${key}"`, error);
  }
}

/**
 * Resets the cached storage availability and fallback store.
 * Strictly for testing purposes.
 */
export function resetCache(): void {
  isStorageAvailableChecked = false;
  isStorageAvailable = false;
  devErrorLogged = false;
  for (const key in fallbackStore) {
    delete fallbackStore[key];
  }
}

