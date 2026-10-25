/**
 * Pure integer stroop conversion — no floating-point arithmetic.
 *
 * 1 XLM = 10_000_000 stroops (7 decimal places).
 *
 * Accepts decimal strings such as "1", "12.5", "0.0000001".
 * Rejects zero, negative, more than 7 decimal places, and non-numeric input.
 *
 * Returns a bigint so callers can safely pass it to nativeToScVal as i128.
 */

const STROOPS_PER_XLM = 10_000_000n;
const MAX_DECIMALS = 7;

export class StroopConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StroopConversionError';
  }
}

/**
 * Convert an XLM amount string to stroops (bigint).
 *
 * @throws {StroopConversionError} on any invalid input.
 */
export function stroopsFromXlm(xlm: string): bigint {
  const trimmed = xlm.trim();

  // Must be a valid decimal number (no scientific notation, no leading sign for positive)
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new StroopConversionError(
      `Invalid amount "${xlm}": must be a positive decimal number (e.g. "12.5").`,
    );
  }

  const parts = trimmed.split('.');
  const intPart = parts[0];
  const fracPart = parts[1] ?? '';

  if (fracPart.length > MAX_DECIMALS) {
    throw new StroopConversionError(
      `Invalid amount "${xlm}": too many decimal places (max ${MAX_DECIMALS} for XLM stroops).`,
    );
  }

  // Pad fractional part to exactly MAX_DECIMALS digits
  const paddedFrac = fracPart.padEnd(MAX_DECIMALS, '0');

  const stroops = BigInt(intPart) * STROOPS_PER_XLM + BigInt(paddedFrac);

  if (stroops <= 0n) {
    throw new StroopConversionError(`Invalid amount "${xlm}": must be greater than zero.`);
  }

  return stroops;
}

/**
 * Convert a stroop bigint back to an XLM string for display (e.g. "12.5000000").
 */
export function xlmFromStroops(stroops: bigint): string {
  const intPart = stroops / STROOPS_PER_XLM;
  const fracPart = stroops % STROOPS_PER_XLM;
  return `${intPart}.${String(fracPart).padStart(MAX_DECIMALS, '0')}`;
}
