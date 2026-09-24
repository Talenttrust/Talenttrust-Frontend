import {
  CONTRACT_DRAFT_STORAGE_KEY,
  CONTRACT_DRAFT_VERSION,
  MAX_CONTRACT_NAME_LENGTH,
  MAX_PARTY_LABEL_LENGTH,
  clearContractDraft,
  coerceContractDraft,
  loadContractDraft,
  saveContractDraft,
} from '@/lib/contractDraft';
import { safeStorage } from '@/lib/safeStorage';

const WALLET_A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const WALLET_B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

const sampleDraft = {
  contractName: 'Website Redesign',
  parties: [
    { label: 'Client', address: WALLET_A },
    { label: 'Freelancer', address: WALLET_B },
  ],
  totalValue: '5000',
  currency: 'USD',
};

const readRaw = () => window.localStorage.getItem(CONTRACT_DRAFT_STORAGE_KEY);
const writeRaw = (value: string) =>
  window.localStorage.setItem(CONTRACT_DRAFT_STORAGE_KEY, value);

beforeEach(() => {
  window.localStorage.clear();
  safeStorage.resetCache();
  jest.restoreAllMocks();
});

describe('contract draft envelope', () => {
  // ── Edge case 1: no stored draft ─────────────────────────────────────────
  it('reports none when nothing is stored, without creating anything', () => {
    expect(loadContractDraft(WALLET_A)).toEqual({ status: 'none' });
    expect(readRaw()).toBeNull();
  });

  // ── Edge case 2: malformed JSON ─────────────────────────────────────────
  it('discards malformed JSON and clears it, so the next save starts clean', () => {
    writeRaw('{not json at all');

    expect(loadContractDraft(WALLET_A)).toEqual({ status: 'discarded', reason: 'malformed' });
    expect(readRaw()).toBeNull();
  });

  it('discards a JSON payload that is not an object', () => {
    writeRaw('"just a string"');

    expect(loadContractDraft(WALLET_A)).toEqual({ status: 'discarded', reason: 'malformed' });
    expect(readRaw()).toBeNull();
  });

  // ── Edge case 3: schema upgrade ─────────────────────────────────────────
  it('migrates a legacy v0 payload (bare snapshot, no envelope) for a known wallet', () => {
    writeRaw(JSON.stringify(sampleDraft));

    const result = loadContractDraft(WALLET_A);

    expect(result.status).toBe('restored');
    if (result.status !== 'restored') throw new Error('expected restore');
    expect(result.draft.contractName).toBe('Website Redesign');
    expect(result.draft.parties).toHaveLength(2);
  });

  it('refuses to adopt a legacy v0 payload without an identity to own it', () => {
    writeRaw(JSON.stringify(sampleDraft));

    expect(loadContractDraft(null)).toEqual({ status: 'discarded', reason: 'identity-mismatch' });
    expect(readRaw()).toBeNull();
  });

  it('discards an envelope from a newer schema rather than guessing its fields', () => {
    writeRaw(
      JSON.stringify({
        version: CONTRACT_DRAFT_VERSION + 1,
        identity: WALLET_A,
        savedAt: new Date().toISOString(),
        draft: sampleDraft,
        somethingNew: { nested: true },
      }),
    );

    expect(loadContractDraft(WALLET_A)).toEqual({
      status: 'discarded',
      reason: 'unsupported-version',
    });
    expect(readRaw()).toBeNull();
  });

  // ── Edge case 4: wallet switch ──────────────────────────────────────────
  it('never restores another wallet\'s draft, and clears it', () => {
    expect(saveContractDraft(WALLET_A, sampleDraft)).toBe(true);

    expect(loadContractDraft(WALLET_B)).toEqual({
      status: 'discarded',
      reason: 'identity-mismatch',
    });
    expect(readRaw()).toBeNull();

    // A's draft is gone by policy (account change), so A no longer sees it either.
    expect(loadContractDraft(WALLET_A)).toEqual({ status: 'none' });
  });

  it('does not hand a wallet draft to an anonymous session', () => {
    expect(saveContractDraft(WALLET_A, sampleDraft)).toBe(true);

    expect(loadContractDraft(null)).toEqual({
      status: 'discarded',
      reason: 'identity-mismatch',
    });
  });

  it('restores the same wallet\'s draft with its saved timestamp', () => {
    const savedAt = '2026-09-24T10:00:00.000Z';
    expect(saveContractDraft(WALLET_A, sampleDraft, { savedAt })).toBe(true);

    const result = loadContractDraft(WALLET_A);

    expect(result).toEqual({ status: 'restored', draft: sampleDraft, savedAt });
  });

  // ── Edge case 5: storage quota failure ──────────────────────────────────
  it('reports failure when the storage write is refused', () => {
    jest.spyOn(safeStorage, 'setItem').mockReturnValue(false);

    expect(saveContractDraft(WALLET_A, sampleDraft)).toBe(false);
  });

  it('reports failure when the bytes do not survive the write', () => {
    // safeStorage.setItem returns true even when localStorage throws — it keeps
    // an in-memory fallback — so the read-back is what proves durability.
    jest.spyOn(safeStorage, 'setItem').mockReturnValue(true);
    jest.spyOn(safeStorage, 'getItem').mockReturnValue(null);

    expect(saveContractDraft(WALLET_A, sampleDraft)).toBe(false);
  });

  it('does not store an empty draft', () => {
    expect(
      saveContractDraft(WALLET_A, {
        contractName: '',
        parties: [
          { label: '', address: '' },
          { label: '', address: '' },
        ],
        totalValue: '',
        currency: 'USD',
      }),
    ).toBe(false);
    expect(readRaw()).toBeNull();
  });
});

describe('coerceContractDraft', () => {
  it('clamps over-long user text to the form\'s limits', () => {
    const longName = 'x'.repeat(MAX_CONTRACT_NAME_LENGTH + 50);
    const longLabel = 'y'.repeat(MAX_PARTY_LABEL_LENGTH + 50);

    const draft = coerceContractDraft({
      contractName: longName,
      parties: [{ label: longLabel, address: WALLET_A }],
      totalValue: '10',
      currency: 'USD',
    });

    expect(draft?.contractName).toHaveLength(MAX_CONTRACT_NAME_LENGTH);
    expect(draft?.parties[0].label).toHaveLength(MAX_PARTY_LABEL_LENGTH);
  });

  it('ignores unexpected keys instead of copying them into state', () => {
    const draft = coerceContractDraft({
      contractName: 'Real name',
      parties: [],
      totalValue: '1',
      currency: 'USD',
      isAdmin: true,
      __proto__: { polluted: 'yes' },
    });

    expect(draft).not.toBeNull();
    expect(Object.keys(draft ?? {})).toEqual(['contractName', 'parties', 'totalValue', 'currency']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('drops non-object party rows and caps the list length', () => {
    const draft = coerceContractDraft({
      contractName: 'Name',
      parties: [...Array(50).keys()].map((i) => (i === 0 ? 'not-a-row' : { label: `p${i}`, address: '' })),
      totalValue: '1',
      currency: 'USD',
    });

    expect(draft?.parties.length).toBeLessThanOrEqual(10);
    expect(draft?.parties.every((p) => typeof p.label === 'string')).toBe(true);
  });

  it('returns null for a payload with no content at all', () => {
    expect(coerceContractDraft({})).toBeNull();
    expect(coerceContractDraft(null)).toBeNull();
    expect(coerceContractDraft({ contractName: '', parties: [], totalValue: '' })).toBeNull();
  });
});

describe('clearContractDraft', () => {
  it('removes the envelope and is safe when nothing is stored', () => {
    saveContractDraft(WALLET_A, sampleDraft);
    clearContractDraft();
    expect(readRaw()).toBeNull();

    expect(() => clearContractDraft()).not.toThrow();
  });
});
