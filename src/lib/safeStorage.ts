export const safeStorageWarn = (message: string) => {
  console.warn(message);
};

export const getStorage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export function safeGet(key: string): string | null {
  const s = getStorage();
  if (!s) return null;
  try {
    return s.getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(key: string, value: string): boolean {
  const s = getStorage();
  if (!s) return false;
  try {
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(key: string): boolean {
  const s = getStorage();
  if (!s) return false;
  try {
    s.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export interface VersionedStoreOptions<T extends { version: number }, I> {
  key: string;
  version: number;
  validate: (value: unknown) => value is T;
  empty: () => T;
  maxItems: number;
  /** Extracts the list of items from a store (used for capping on load). */
  items: (store: T) => I[];
  /** Rebuilds a store with the given items (used for capping on load). */
  withItems: (store: T, items: I[]) => T;
  /** Label used in warning messages, e.g. "Watchlist". */
  label: string;
}

export interface VersionedStore<T> {
  load: () => T;
  save: (store: T) => boolean;
  clear: () => T;
}

export function createVersionedStore<T extends { version: number }, I = unknown>(
  opts: VersionedStoreOptions<T, I>,
): VersionedStore<T> {
  const { key, validate, empty, maxItems, items, withItems, label } = opts;

  const save = (store: T): boolean => {
    const s = getStorage();
    if (!s) return false;
    try {
      s.setItem(key, JSON.stringify(store));
      return true;
    } catch {
      safeStorageWarn(`Could not persist ${label.toLowerCase()} (storage full or unavailable).`);
      return false;
    }
  };

  const load = (): T => {
    const s = getStorage();
    if (!s) return empty();
    let raw: string | null = null;
    try {
      raw = s.getItem(key);
    } catch {
      return empty();
    }
    if (!raw) return empty();
    try {
      const parsed = JSON.parse(raw);
      if (!validate(parsed)) {
        safeStorageWarn(`${label} data was in an unknown format and has been reset.`);
        save(empty());
        return empty();
      }
      return withItems(parsed, items(parsed).slice(0, maxItems));
    } catch {
      safeStorageWarn(`${label} data was corrupt and has been reset.`);
      save(empty());
      return empty();
    }
  };

  const clear = (): T => {
    const next = empty();
    save(next);
    return next;
  };

  return { load, save, clear };
}
