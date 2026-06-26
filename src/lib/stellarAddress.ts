/**
 * Lightweight Stellar address validation for display and form handling.
 *
 * Acceptance rule (current implementation): after trimming whitespace and uppercasing,
 * a value is considered plausible if it is exactly 56 characters long, starts with "G",
 * and only uses the base32 alphabet A-Z and 2-7. This is intentionally conservative
 * and can be tightened once the Stellar SDK is introduced.
 */
const STELLAR_PUBLIC_KEY_LENGTH = 56;
const STELLAR_PUBLIC_KEY_PATTERN = /^G[A-Z2-7]{55}$/;

/**
 * Validate a Stellar public key address.
 *
 * This validation is **structural only** – it checks that the address
 * conforms to the acceptance rule used by the current implementation:
 *   - After trimming whitespace and converting to upper‑case, the value
 *     must be exactly 56 characters long.
 *   - It must start with the letter `G`.
 *   - All remaining characters must belong to the base‑32 alphabet
 *     `A‑Z` and `2‑7`.
 *
 * No checksum verification (StrKey) is performed. The function is intended
 * for display and form‑handling purposes where a lightweight check is
 * sufficient. Stronger validation can be added later by integrating the
 * Stellar SDK.
 *
 * @param value The raw address string (or `null`/`undefined`).
 * @returns `true` if the normalized value matches the structural rule, else `false`.
 */
export function isValidStellarAddress(value: string | null | undefined): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const normalizedValue = normalizeStellarAddress(value);
  if (!normalizedValue) {
    return false;
  }

  return normalizedValue.length === STELLAR_PUBLIC_KEY_LENGTH && STELLAR_PUBLIC_KEY_PATTERN.test(normalizedValue);
}

/**
 * Normalize a Stellar address string.
 *
 * This function trims surrounding whitespace and converts the value to
 * upper‑case. It never throws – non‑string inputs result in an empty string.
 *
 * @param value The raw address string (or `null`/`undefined`).
 * @returns The normalized address, or an empty string for invalid input.
 */
export function normalizeStellarAddress(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toUpperCase();
}
