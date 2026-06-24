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

export function normalizeStellarAddress(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().toUpperCase();
}
