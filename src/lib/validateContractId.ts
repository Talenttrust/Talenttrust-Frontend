/** Maximum allowed length for a contract id. */
const MAX_ID_LENGTH = 64;

/** Allowed charset: alphanumeric plus hyphens and underscores. */
const VALID_ID_RE = /^[a-zA-Z0-9_-]+$/;

/**
 * Returns `true` when `id` is a safe contract identifier.
 *
 * Rules:
 * - Must be a non-empty string.
 * - Must contain only alphanumeric characters, hyphens, or underscores.
 * - Must not exceed {@link MAX_ID_LENGTH} characters.
 *
 * @param id - The raw route parameter value to validate.
 * @returns `true` if `id` is valid; `false` otherwise.
 */
export function isValidContractId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    id.length <= MAX_ID_LENGTH &&
    VALID_ID_RE.test(id)
  );
}
