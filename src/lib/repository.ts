/**
 * @file repository.ts
 *
 * Client-side persistence layer for TalentTrust.
 *
 * Provides synchronous read/write access to Contract and Milestone records
 * stored in the browser's localStorage under a single namespaced key.
 *
 * Design principles:
 * - **Pure & synchronous** — no React dependencies; safe to call from any context.
 * - **SSR-safe** — guards every storage access with a `typeof window` check so
 *   Next.js server-side builds never throw.
 * - **Resilient** — all reads are wrapped in try/catch; corrupt or missing data
 *   falls back to `[]` with a console warning rather than crashing.
 * - **Non-mutating** — callers own their data; this module never mutates the
 *   objects it receives or returns.
 */

import type { Contract } from '@/types/domain';
import type { Milestone } from '@/components/MilestonesList';

// ---------------------------------------------------------------------------
// Storage key & data shape
// ---------------------------------------------------------------------------

/** Single localStorage key that houses all persisted app data. */
export const STORAGE_KEY = 'talenttrust_app_data';

interface AppData {
  contracts: Contract[];
  milestones: Milestone[];
}

const EMPTY_DATA: AppData = { contracts: [], milestones: [] };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns `true` when code is running inside a real browser environment.
 * Guards against Next.js SSR / build-time execution where `window` is absent.
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Reads and parses the full persisted data object from localStorage.
 *
 * @returns The parsed `AppData` object, or `EMPTY_DATA` on any failure
 *          (missing key, unparseable JSON, unexpected shape).
 */
function readStore(): AppData {
  if (!isBrowser()) return { ...EMPTY_DATA };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_DATA };

    const parsed = JSON.parse(raw) as Partial<AppData>;

    return {
      contracts: Array.isArray(parsed.contracts) ? parsed.contracts : [],
      milestones: Array.isArray(parsed.milestones) ? parsed.milestones : [],
    };
  } catch (err) {
    console.warn(
      '[repository] Failed to read from localStorage. Falling back to empty state.',
      err,
    );
    return { ...EMPTY_DATA };
  }
}

/**
 * Serialises and writes the full data object back to localStorage.
 *
 * @param data - The complete `AppData` object to persist.
 * @returns `true` when the write succeeds; otherwise `false`.
 */
function writeStore(data: AppData): boolean {
  if (!isBrowser()) return false;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn('[repository] Failed to write to localStorage.', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API — Contracts
// ---------------------------------------------------------------------------

/**
 * Returns all persisted contracts.
 *
 * Reads from localStorage and returns the stored array. If localStorage is
 * unavailable (SSR) or the stored value is corrupt, returns an empty array
 * `[]` and logs a console warning — it never throws.
 *
 * @returns A new array of `Contract` objects (may be empty).
 *
 * @example
 * ```ts
 * const contracts = listContracts();
 * // → [{ contractName: 'Design Sprint', ... }, ...]
 * ```
 */
export function listContracts(): Contract[] {
  return readStore().contracts;
}

/**
 * Appends a contract to the persisted list.
 *
 * The write is additive — existing milestones and other contracts are
 * preserved. Passing a contract whose `contractName` already exists will
 * result in a duplicate; deduplication is the caller's responsibility.
 *
 * @param contract - The `Contract` record to persist.
 *
 * @example
 * ```ts
 * saveContract({
 *   contractName: 'Design Sprint',
 *   parties: [{ label: 'Client', address: '0xABC...' }],
 *   totalValue: 5000,
 *   currency: 'USD',
 *   status: 'Active',
 *   createdAt: '2025-01-01',
 *   milestoneCount: 3,
 * });
 * ```
 */
export function saveContract(contract: Contract): void {
  const store = readStore();
  writeStore({ ...store, contracts: [...store.contracts, contract] });
}

/**
 * Replaces an existing contract that shares the same `contractName`, or appends
 * the contract when no persisted match exists yet.
 *
 * The helper returns a success flag so calling UI code can surface a toast or
 * fallback message when persistence fails instead of assuming the write worked.
 *
 * @param contract - The full `Contract` record to insert or replace.
 * @returns `true` when the contract is persisted successfully; otherwise `false`.
 *
 * @example
 * ```ts
 * const updated = upsertContract({
 *   contractName: 'Design Sprint',
 *   parties: [{ label: 'Client', address: '0xABC...' }],
 *   totalValue: 5000,
 *   currency: 'USD',
 *   status: 'Completed',
 *   createdAt: '2025-01-01',
 *   milestoneCount: 3,
 * });
 * ```
 */
export function upsertContract(contract: Contract): boolean {
  const store = readStore();
  const existingIndex = store.contracts.findIndex(
    (existingContract) => existingContract.contractName === contract.contractName,
  );

  const contracts =
    existingIndex === -1
      ? [...store.contracts, contract]
      : store.contracts.map((existingContract, index) =>
          index === existingIndex ? contract : existingContract,
        );

  return writeStore({ ...store, contracts });
}

// ---------------------------------------------------------------------------
// Public API — Milestones
// ---------------------------------------------------------------------------

/**
 * Returns all persisted milestones.
 *
 * Reads from localStorage and returns the stored array. If localStorage is
 * unavailable (SSR) or the stored value is corrupt, returns an empty array
 * `[]` and logs a console warning — it never throws.
 *
 * @returns A new array of `Milestone` objects (may be empty).
 *
 * @example
 * ```ts
 * const milestones = listMilestones();
 * // → [{ id: 'ms-1', title: 'Kickoff', status: 'Pending', ... }, ...]
 * ```
 */
export function listMilestones(): Milestone[] {
  return readStore().milestones;
}

/**
 * Appends a milestone to the persisted list.
 *
 * The write is additive — existing contracts and other milestones are
 * preserved. Callers are responsible for ensuring `id` uniqueness.
 *
 * @param milestone - The `Milestone` record to persist.
 *
 * @example
 * ```ts
 * saveMilestone({
 *   id: 'ms-1',
 *   title: 'Project Kickoff',
 *   status: 'Pending',
 *   payout: 1000,
 *   currency: 'USD',
 *   dueDate: 'Jun 1, 2025',
 * });
 * ```
 */
export function saveMilestone(milestone: Milestone): void {
  const store = readStore();
  writeStore({ ...store, milestones: [...store.milestones, milestone] });
}
