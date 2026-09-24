/**
 * Draft persistence for contract creation.
 *
 * A refresh used to erase a half-typed contract, and — worse — a draft typed
 * by one wallet could reappear under another. Both are identity bugs, so the
 * stored value is an **envelope**, not a bare form snapshot:
 *
 *   { version, identity, savedAt, draft }
 *
 * Three rules follow from that shape, and each has a test:
 *
 * 1. **Versioned.** A payload written by an older schema is migrated only
 *    through an explicit path; a payload from a *newer* version is discarded,
 *    because this code cannot know what future fields mean. Restoring data it
 *    does not understand is how a "draft" turns into corruption.
 * 2. **Identity-scoped.** The envelope records which wallet it belongs to. A
 *    mismatch is not a draft for the current user — it is someone else's data,
 *    so it is cleared rather than shown.
 * 3. **Validated before restore.** Every field is rebuilt explicitly from
 *    primitives (no object spread of parsed JSON, which is how `__proto__`
 *    payloads pollute a prototype), lengths are clamped to the limits the form
 *    enforces, and user text is sanitised on the way in.
 *
 * Values are written through `safeStorage`, whose `setItem` swallows quota
 * errors — so a save is only reported successful after a read-back confirms
 * the exact bytes landed. A quota failure therefore surfaces as `false`
 * instead of a draft that silently exists only in memory.
 */
import { safeStorage } from './safeStorage';
import { sanitizeUserText } from './sanitizeUserText';

/** Storage key for the draft envelope. Versioned in the *value*, not the key. */
export const CONTRACT_DRAFT_STORAGE_KEY = 'talenttrust.contract-draft';

/** Current envelope schema version. */
export const CONTRACT_DRAFT_VERSION = 1;

/**
 * Legacy version 0: the pre-envelope shape, a bare form snapshot with no
 * identity. Kept as an explicit migration input rather than "anything without
 * a version", so a corrupt future payload cannot masquerade as legacy.
 */
const LEGACY_VERSION = 0;

/** Field limits, single-sourced here and re-exported by the form. */
export const MAX_CONTRACT_NAME_LENGTH = 200;
export const MAX_PARTY_LABEL_LENGTH = 100;
/** Mirrors the form's party row limits: at least 2 rows, at most this many. */
export const MAX_DRAFT_PARTIES = 10;

export interface ContractDraftData {
  contractName: string;
  parties: Array<{ label: string; address: string }>;
  totalValue: string;
  currency: string;
}

export interface ContractDraftEnvelope {
  version: number;
  identity: string | null;
  savedAt: string;
  draft: ContractDraftData;
}

export type DraftLoadResult =
  | { status: 'none' }
  | { status: 'restored'; draft: ContractDraftData; savedAt: string }
  | { status: 'discarded'; reason: 'malformed' | 'unsupported-version' | 'identity-mismatch' | 'invalid' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Rebuilds a draft from unknown parsed JSON.
 *
 * Returns `null` when the payload cannot describe a draft at all (not an
 * object, or no usable fields). Field-by-field construction is deliberate: a
 * spread would copy `__proto__` and any unknown keys straight into state.
 */
export function coerceContractDraft(value: unknown): ContractDraftData | null {
  if (!isRecord(value)) return null;

  const contractName = sanitizeUserText(asString(value.contractName), MAX_CONTRACT_NAME_LENGTH);

  const rawParties = Array.isArray(value.parties) ? value.parties : [];
  const parties = rawParties
    .slice(0, MAX_DRAFT_PARTIES)
    .filter(isRecord)
    .map((party) => ({
      label: sanitizeUserText(asString(party.label), MAX_PARTY_LABEL_LENGTH),
      address: asString(party.address).trim(),
    }));

  const rawTotal = value.totalValue;
  const totalValue =
    typeof rawTotal === 'string' ? rawTotal : typeof rawTotal === 'number' ? String(rawTotal) : '';

  const currency = asString(value.currency).trim().slice(0, 10);

  const hasAnyContent =
    contractName !== '' ||
    totalValue !== '' ||
    parties.some((party) => party.label !== '' || party.address !== '');

  // A payload with nothing in it is not a draft; restoring it would replace the
  // form's pristine state with an equally pristine one and claim it "restored".
  if (!hasAnyContent) return null;

  return { contractName, parties, totalValue, currency };
}

/**
 * Reads the draft for an identity.
 *
 * @param identity - The current wallet address, or `null` before a wallet is
 *   connected. Only `null` matches a `null` envelope: an anonymous session must
 *   not adopt a draft that belongs to a connected wallet.
 * @returns A discriminated result; `discarded` carries why, so the caller can
 *   tell the user their draft was dropped instead of silently losing it.
 */
export function loadContractDraft(identity: string | null): DraftLoadResult {
  const raw = safeStorage.getItem(CONTRACT_DRAFT_STORAGE_KEY);
  if (raw === null || raw === undefined || raw === '') return { status: 'none' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Unparseable bytes are not a draft and not recoverable: drop them so the
    // next save starts from a clean slate.
    clearContractDraft();
    return { status: 'discarded', reason: 'malformed' };
  }

  if (!isRecord(parsed)) {
    clearContractDraft();
    return { status: 'discarded', reason: 'malformed' };
  }

  const version = typeof parsed.version === 'number' ? parsed.version : LEGACY_VERSION;

  if (version > CONTRACT_DRAFT_VERSION) {
    // Written by a newer build. Guessing at unseen fields would corrupt state.
    clearContractDraft();
    return { status: 'discarded', reason: 'unsupported-version' };
  }

  if (version < LEGACY_VERSION) {
    clearContractDraft();
    return { status: 'discarded', reason: 'unsupported-version' };
  }

  // Version 0 carried no identity. It is owned by whoever is asking *now*, and
  // is deliberately not restored for an anonymous session — a pre-envelope
  // draft has no way to prove which wallet typed it.
  if (version === LEGACY_VERSION && identity === null) {
    clearContractDraft();
    return { status: 'discarded', reason: 'identity-mismatch' };
  }

  const storedIdentity = version === LEGACY_VERSION ? identity : asString(parsed.identity) || null;

  if (storedIdentity !== identity) {
    clearContractDraft();
    return { status: 'discarded', reason: 'identity-mismatch' };
  }

  const draft = coerceContractDraft(parsed.draft ?? parsed);
  if (!draft) {
    clearContractDraft();
    return { status: 'discarded', reason: 'invalid' };
  }

  const savedAt = asString(parsed.savedAt);
  return { status: 'restored', draft, savedAt };
}

/**
 * Writes the draft envelope for an identity.
 *
 * @returns `true` only when the exact serialised bytes can be read back. A
 *   `false` means the draft is not durably stored (quota, private mode, or a
 *   value over the safe-storage limit), and the caller should say so rather
 *   than implying the work is safe.
 */
export function saveContractDraft(
  identity: string | null,
  draft: ContractDraftData,
  { savedAt = new Date().toISOString() }: { savedAt?: string } = {},
): boolean {
  const normalised = coerceContractDraft(draft);
  if (!normalised) return false;

  const envelope: ContractDraftEnvelope = {
    version: CONTRACT_DRAFT_VERSION,
    identity,
    savedAt,
    draft: normalised,
  };

  const serialised = JSON.stringify(envelope);
  const wrote = safeStorage.setItem(CONTRACT_DRAFT_STORAGE_KEY, serialised);
  if (!wrote) return false;

  // Read-back: safeStorage.setItem returns true even when localStorage threw
  // (it keeps an in-memory fallback), so only a byte-for-byte match proves the
  // draft survived.
  return safeStorage.getItem(CONTRACT_DRAFT_STORAGE_KEY) === serialised;
}

/** Removes the stored draft. Safe to call when nothing is stored. */
export function clearContractDraft(): void {
  safeStorage.removeItem(CONTRACT_DRAFT_STORAGE_KEY);
}
