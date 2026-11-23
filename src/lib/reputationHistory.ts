import { normalizeAddress, validateAddress } from '@/lib/stellar/address';

/** localStorage key for the recent reputation lookups. */
export const REPUTATION_HISTORY_KEY = 'tt.reputation.history.v1';

/** Maximum number of addresses kept in the recent-lookups list. */
export const REPUTATION_HISTORY_LIMIT = 5;

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Normalize, validate and deduplicate addresses, keeping the first occurrence
 * of each. The result is capped at {@link REPUTATION_HISTORY_LIMIT}.
 */
function cleanAddresses(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') continue;
    const normalized = normalizeAddress(value);
    if (!normalized || seen.has(normalized)) continue;
    if (!validateAddress(normalized).ok) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length === REPUTATION_HISTORY_LIMIT) break;
  }

  return out;
}

/**
 * Read the recent-lookups list from localStorage.
 *
 * Any failure (no storage, missing key, malformed JSON, unexpected shape or
 * invalid addresses) degrades to an empty list rather than throwing.
 */
export function loadReputationHistory(): string[] {
  const storage = getStorage();
  if (!storage) return [];

  let raw: string | null;
  try {
    raw = storage.getItem(REPUTATION_HISTORY_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return cleanAddresses(parsed);
  } catch {
    return [];
  }
}

/** Persist the list. Returns false when storage is unavailable or the write fails. */
export function saveReputationHistory(addresses: readonly string[]): boolean {
  const storage = getStorage();
  if (!storage) return false;

  try {
    storage.setItem(REPUTATION_HISTORY_KEY, JSON.stringify(cleanAddresses(addresses)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Add a successfully looked-up address to the front of the list, normalizing
 * and deduplicating as it goes. The newest lookup always comes first.
 */
export function addReputationLookup(
  address: string,
  current: readonly string[] = loadReputationHistory(),
): string[] {
  const normalized = normalizeAddress(address);
  if (!normalized || !validateAddress(normalized).ok) {
    return cleanAddresses(current);
  }

  const next = cleanAddresses([normalized, ...current]);
  saveReputationHistory(next);
  return next;
}

/** Remove the stored list. Safe when storage is unavailable. */
export function clearReputationHistory(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(REPUTATION_HISTORY_KEY);
  } catch {
    // Ignore: a failed clear must not break the page.
  }
}
