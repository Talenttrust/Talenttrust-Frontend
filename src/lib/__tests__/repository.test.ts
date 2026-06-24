/**
 * Test suite for src/lib/repository.ts
 *
 * Covers:
 * 1. Basic round-trip — write then read back for both entities.
 * 2. Data isolation — contracts and milestones live under the same key but
 *    never clobber each other.
 * 3. Corrupt data handling — malformed JSON falls back to [] gracefully.
 * 4. SSR context isolation — functions return [] safely when window is absent.
 * 5. Empty-store defaults — first read on a fresh store returns [].
 * 6. Multiple writes — each save is additive, not a full replacement.
 * 7. writeStore failure — localStorage.setItem throws; warn logged, no crash.
 */

import {
  listContracts,
  saveContract,
  listMilestones,
  saveMilestone,
  STORAGE_KEY,
} from '../repository';
import type { Contract } from '@/components/ContractSummary';
import type { Milestone } from '@/components/MilestonesList';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const contractA: Contract = {
  contractName: 'Alpha Contract',
  parties: [{ label: 'Client', address: '0xAAA' }],
  totalValue: 1000,
  currency: 'USD',
  status: 'Active',
  createdAt: 'Jan 1, 2025',
  milestoneCount: 2,
};

const contractB: Contract = {
  contractName: 'Beta Contract',
  parties: [{ label: 'Freelancer', address: '0xBBB' }],
  totalValue: 2500,
  currency: 'USD',
  status: 'Pending',
  createdAt: 'Feb 1, 2025',
  milestoneCount: 1,
};

const milestoneA: Milestone = {
  id: 'ms-001',
  title: 'Kickoff',
  status: 'Pending',
  payout: 500,
  currency: 'USD',
  dueDate: 'Mar 1, 2025',
};

const milestoneB: Milestone = {
  id: 'ms-002',
  title: 'Delivery',
  status: 'Completed',
  payout: 1500,
  currency: 'USD',
  dueDate: 'Apr 15, 2025',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Directly seeds raw JSON into localStorage for corruption tests. */
function seedRaw(value: string) {
  window.localStorage.setItem(STORAGE_KEY, value);
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  window.localStorage.clear();
  jest.restoreAllMocks();
});

// ===========================================================================
// 1. EMPTY STORE DEFAULTS
// ===========================================================================

describe('empty store', () => {
  it('listContracts returns [] when storage is empty', () => {
    expect(listContracts()).toEqual([]);
  });

  it('listMilestones returns [] when storage is empty', () => {
    expect(listMilestones()).toEqual([]);
  });
});

// ===========================================================================
// 2. BASIC ROUND-TRIP
// ===========================================================================

describe('contract round-trip', () => {
  it('saves a contract and reads it back', () => {
    saveContract(contractA);
    expect(listContracts()).toEqual([contractA]);
  });

  it('preserves all Contract fields intact', () => {
    saveContract(contractA);
    const [result] = listContracts();
    expect(result.contractName).toBe('Alpha Contract');
    expect(result.parties).toEqual([{ label: 'Client', address: '0xAAA' }]);
    expect(result.totalValue).toBe(1000);
    expect(result.status).toBe('Active');
    expect(result.milestoneCount).toBe(2);
  });
});

describe('milestone round-trip', () => {
  it('saves a milestone and reads it back', () => {
    saveMilestone(milestoneA);
    expect(listMilestones()).toEqual([milestoneA]);
  });

  it('preserves all Milestone fields intact', () => {
    saveMilestone(milestoneA);
    const [result] = listMilestones();
    expect(result.id).toBe('ms-001');
    expect(result.title).toBe('Kickoff');
    expect(result.status).toBe('Pending');
    expect(result.payout).toBe(500);
    expect(result.dueDate).toBe('Mar 1, 2025');
  });
});

// ===========================================================================
// 3. MULTIPLE WRITES ARE ADDITIVE
// ===========================================================================

describe('multiple saves are additive', () => {
  it('accumulates multiple contracts', () => {
    saveContract(contractA);
    saveContract(contractB);
    const result = listContracts();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(contractA);
    expect(result[1]).toEqual(contractB);
  });

  it('accumulates multiple milestones', () => {
    saveMilestone(milestoneA);
    saveMilestone(milestoneB);
    const result = listMilestones();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(milestoneA);
    expect(result[1]).toEqual(milestoneB);
  });
});

// ===========================================================================
// 4. DATA ISOLATION — contracts and milestones never overwrite each other
// ===========================================================================

describe('data isolation', () => {
  it('saving a contract does not erase existing milestones', () => {
    saveMilestone(milestoneA);
    saveMilestone(milestoneB);

    saveContract(contractA);

    // Milestones must still be intact
    expect(listMilestones()).toHaveLength(2);
    expect(listMilestones()[0]).toEqual(milestoneA);

    // Contract also persisted
    expect(listContracts()).toHaveLength(1);
  });

  it('saving a milestone does not erase existing contracts', () => {
    saveContract(contractA);
    saveContract(contractB);

    saveMilestone(milestoneA);

    // Contracts must still be intact
    expect(listContracts()).toHaveLength(2);
    expect(listContracts()[1]).toEqual(contractB);

    // Milestone also persisted
    expect(listMilestones()).toHaveLength(1);
  });

  it('interleaved saves preserve the full data set', () => {
    saveContract(contractA);
    saveMilestone(milestoneA);
    saveContract(contractB);
    saveMilestone(milestoneB);

    expect(listContracts()).toEqual([contractA, contractB]);
    expect(listMilestones()).toEqual([milestoneA, milestoneB]);
  });
});

// ===========================================================================
// 5. CORRUPT / INVALID DATA HANDLING
// ===========================================================================

describe('corrupt data handling', () => {
  it('returns [] for contracts when localStorage contains invalid JSON', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    seedRaw('%%%not-json%%%');
    expect(listContracts()).toEqual([]);
  });

  it('returns [] for milestones when localStorage contains invalid JSON', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    seedRaw('%%%not-json%%%');
    expect(listMilestones()).toEqual([]);
  });

  it('logs a console.warn (not error) on parse failure', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    seedRaw('{invalid}');
    listContracts();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/\[repository\]/);
  });

  it('returns [] when stored value is a JSON string (not an object)', () => {
    seedRaw('"just-a-string"');
    expect(listContracts()).toEqual([]);
    expect(listMilestones()).toEqual([]);
  });

  it('returns [] when stored value is a JSON number', () => {
    seedRaw('42');
    expect(listContracts()).toEqual([]);
    expect(listMilestones()).toEqual([]);
  });

  it('returns [] when stored value is a JSON array at the top level', () => {
    seedRaw('[]');
    expect(listContracts()).toEqual([]);
    expect(listMilestones()).toEqual([]);
  });

  it('recovers contracts array when only milestones key is missing from stored object', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ contracts: [contractA] }),
    );
    expect(listContracts()).toEqual([contractA]);
    // Missing milestones key falls back to []
    expect(listMilestones()).toEqual([]);
  });

  it('recovers milestones array when only contracts key is missing from stored object', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ milestones: [milestoneA] }),
    );
    expect(listMilestones()).toEqual([milestoneA]);
    // Missing contracts key falls back to []
    expect(listContracts()).toEqual([]);
  });

  it('does not throw even when localStorage.getItem throws', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage quota exceeded');
    });
    expect(() => listContracts()).not.toThrow();
    expect(listContracts()).toEqual([]);
  });
});

// ===========================================================================
// 6. SSR CONTEXT ISOLATION (window is undefined)
// ===========================================================================

describe('SSR context isolation', () => {
  let originalWindow: typeof globalThis.window;

  beforeEach(() => {
    // Stash the real window reference
    originalWindow = global.window;
  });

  afterEach(() => {
    // Restore window so subsequent tests are unaffected
    global.window = originalWindow;
  });

  it('listContracts returns [] without throwing when window is undefined', () => {
    // @ts-expect-error — intentionally simulating SSR environment
    delete global.window;
    expect(() => listContracts()).not.toThrow();
    expect(listContracts()).toEqual([]);
  });

  it('listMilestones returns [] without throwing when window is undefined', () => {
    // @ts-expect-error — intentionally simulating SSR environment
    delete global.window;
    expect(() => listMilestones()).not.toThrow();
    expect(listMilestones()).toEqual([]);
  });

  it('saveContract does not throw when window is undefined', () => {
    // @ts-expect-error — intentionally simulating SSR environment
    delete global.window;
    expect(() => saveContract(contractA)).not.toThrow();
  });

  it('saveMilestone does not throw when window is undefined', () => {
    // @ts-expect-error — intentionally simulating SSR environment
    delete global.window;
    expect(() => saveMilestone(milestoneA)).not.toThrow();
  });

  it('data saved before SSR simulation is not affected after window is restored', () => {
    saveContract(contractA);

    // @ts-expect-error — intentionally simulating SSR environment
    delete global.window;
    // Call must not throw
    listContracts();

    // Restore window
    global.window = originalWindow;
    // Original data is still intact
    expect(listContracts()).toEqual([contractA]);
  });
});

// ===========================================================================
// 7. WRITE FAILURE RESILIENCE
// ===========================================================================

describe('write failure resilience', () => {
  it('does not throw when localStorage.setItem throws', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => saveContract(contractA)).not.toThrow();
  });

  it('logs a console.warn when setItem throws', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    saveContract(contractA);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/\[repository\]/);
  });
});
