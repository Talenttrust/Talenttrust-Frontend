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

// ── Generic token amount helpers ─────────────────────────────────────────────

/**
 * Parse a user-supplied decimal string into the smallest unit of a token.
 *
 * Works for any decimal count (0, 6, 7, 18, …).
 * Rejects input that has more fractional digits than `decimals`.
 *
 * @throws {StroopConversionError} on any invalid input.
 */
export function parseTokenAmount(text: string, decimals: number): bigint {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new StroopConversionError(
      `Invalid amount "${text}": must be a positive decimal number.`,
    );
  }

  const parts = trimmed.split('.');
  const intPart = parts[0];
  const fracPart = parts[1] ?? '';

  if (fracPart.length > decimals) {
    throw new StroopConversionError(
      `Invalid amount "${text}": too many decimal places (max ${decimals}).`,
    );
  }

  const scale = 10n ** BigInt(decimals);
  const paddedFrac = fracPart.padEnd(decimals, '0');
  const amount = BigInt(intPart) * scale + BigInt(paddedFrac || '0');

  if (amount <= 0n) {
    throw new StroopConversionError(`Invalid amount "${text}": must be greater than zero.`);
  }

  return amount;
}

/**
 * Format a raw token amount (bigint) as a human-readable string with the
 * token's symbol appended (e.g. "12.5 USDC", "1 XLM").
 */
export function formatTokenAmount(raw: bigint, decimals: number, symbol: string): string {
  if (decimals === 0) {
    return `${raw} ${symbol}`;
  }
  const scale = 10n ** BigInt(decimals);
  const intPart = raw / scale;
  const fracPart = raw % scale;
  const fracStr = String(fracPart).padStart(decimals, '0').replace(/0+$/, '');
  const display = fracStr ? `${intPart}.${fracStr}` : `${intPart}`;
  return `${display} ${symbol}`;
}

/**
 * Convert an XLM amount string to stroops (bigint).
 *
 * @throws {StroopConversionError} on any invalid input.
 */
export function stroopsFromXlm(xlm: string): bigint {
  return parseTokenAmount(xlm, MAX_DECIMALS);
}

/**
 * Convert a stroop bigint back to an XLM string for display (e.g. "12.5000000").
 */
export function xlmFromStroops(stroops: bigint): string {
  const intPart = stroops / STROOPS_PER_XLM;
  const fracPart = stroops % STROOPS_PER_XLM;
  return `${intPart}.${String(fracPart).padStart(MAX_DECIMALS, '0')}`;
}
