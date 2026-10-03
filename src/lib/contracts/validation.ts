/**
 * Validation boundaries for contract route parameters and loading state.
 *
 * This module defines the canonical, deterministic validation rules used by
 * `src/app/contracts/[id]/loading.tsx` and any other consumer that needs to
 * decide whether a contract identifier is well-formed before fetching or
 * rendering data.
 *
 * Invariants:
 *   1. A contract id is either valid or invalid; there is no "partially
 *      valid" state. Consumers must never proceed with an invalid id.
 *   2. Validation is pure and deterministic: the same input always produces
 *      the same result, with no I/O, timers, or global mutable state.
 *   3. Validation never throws for any input; it returns a discriminated
 *      result so callers can handle rejection without try/catch.
 *   4. Duplicate ids are detected explicitly and reported as a distinct
 *      reason so the caller can surface an appropriate message.
 *   5. Boundary values (length limits, allowed characters) are enforced
 *      inclusively and documented in the constants below.
 */

/** Minimum accepted length for a contract id. */
export const CONTRACT_ID_MIN_LENGTH = 1;

/** Maximum accepted length for a contract id. */
export const CONTRACT_ID_MAX_LENGTH = 128;

/**
 * Allowed character set for contract ids. This is deliberately conservative:
 * lowercase letters, digits, hyphens, and underscores. This prevents path
 * traversal, encoding tricks, and accidental URI segment injection.
 */
export const CONTRACT_ID_PATTERN = /^[a-z0-9_-]+$/;
export type ContractIdValidationReason =
  | "empty"
  | "too_short"
  | "too_long"
  | "invalid_characters"
  | "duplicate";

export interface ContractIdValidationSuccess {
  readonly ok: true;
  readonly value: string;
}

export interface ContractIdValidationFailure {
  readonly ok: false;
  readonly reason: ContractIdValidationReason;
  readonly message: string;
}

export type ContractIdValidationResult =
  | ContractIdValidationSuccess
  | ContractIdValidationFailure;

export interface ValidateContractIdOptions {
  /** Ids already present in the current batch; used to detect duplicates. */
  readonly existingIds?: ReadonlyArray<string> | undefined;
}

function fail(
  reason: ContractIdValidationReason,
  message: string,
): ContractIdValidationFailure {
  return { ok: false, reason, message };
}

/**
 * Validate a contract identifier against the canonical boundaries.
 *
 * The function is total: every string input produces a deterministic result,
 * and it never throws. Non-string inputs are treated as empty because the
 * route param is always a string at the boundary, but defensive callers
 * may pass `undefined` or `null`.
 */
export function validateContractId(
  rawId: unknown,
  options: ValidateContractIdOptions = {},
): ContractIdValidationResult {
  if (typeof rawId !== "string") {
    return fail("empty", "Contract id must be a string.");
  }

  const id = rawId.trim();

  if (id.length < CONTRACT_ID_MIN_LENGTH) {
    return fail("empty", "Contract id must not be empty.");
  }

  if (id.length > CONTRACT_ID_MAX_LENGTH) {
    return fail(
      "too_long",
      `Contract id must be at most ${CONTRACT_ID_MAX_LENGTH} characters.`,
    );
  }

  if (!CONTRACT_ID_PATTERN.test(id)) {
    return fail(
      "invalid_characters",
      "Contract id may only contain lowercase letters, digits, hyphens, and underscores.",
    );
  }

  const existingIds = options.existingIds ?? [];
  if (existingIds.includes(id)) {
    return fail("duplicate", "Contract id already exists.");
  }

  return { ok: true, value: id };
}

/**
 * Convenience predicate for callers that only need a boolean. This is
 * equivalent to validateContractId(id).ok and is provided to avoid adhoc
 * duplication of the rules in consumers.
 */
export function isValidContractId(id: unknown): boolean {
  return validateContractId(id).ok;
}
