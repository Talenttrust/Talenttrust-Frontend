/**
 * Redacts sensitive fragments from error text before any detail reaches the DOM.
 *
 * Strips:
 * - Stellar G-address public keys (56-char `G…` base32)
 * - Absolute http(s) URLs
 * - Stack-trace lines (`at …`)
 *
 * Use {@link prepareErrorDetailForDom} at boundary render sites so production
 * always redacts while development can keep an unredacted path.
 */

/** Stellar account public key shape: G + 55 base32 chars (A-Z, 2-7). */
const STELLAR_G_ADDRESS = /G[A-Z2-7]{55}/g;

/** Absolute http(s) URLs (stops at whitespace or common delimiters). */
const ABSOLUTE_URL = /https?:\/\/[^\s"'<>]+/gi;

/** V8 / SpiderMonkey style stack frames. */
const STACK_TRACE_LINE = /^\s*at\s+.+$/gm;

export const REDACTED_ADDRESS = '[REDACTED_ADDRESS]';
export const REDACTED_URL = '[REDACTED_URL]';
export const REDACTED_STACK = '[REDACTED_STACK]';

/**
 * Strip Stellar addresses, URLs, and stack frames from an error detail string.
 * Always applies redaction regardless of environment — callers decide when to use it.
 */
export function redactErrorDetail(detail: string): string {
  if (!detail) return detail;

  let out = detail.replace(STELLAR_G_ADDRESS, REDACTED_ADDRESS);
  out = out.replace(ABSOLUTE_URL, REDACTED_URL);
  out = out.replace(STACK_TRACE_LINE, REDACTED_STACK);

  // Collapse consecutive stack placeholders into one.
  out = out.replace(/(?:\[REDACTED_STACK\]\n?)+/g, `${REDACTED_STACK}\n`);

  return out.trim();
}

/**
 * Prepare error detail for DOM display.
 *
 * - Development / test (`NODE_ENV !== 'production'`): returns the raw detail (unredacted path).
 * - Production: always runs {@link redactErrorDetail} before returning.
 */
export function prepareErrorDetailForDom(detail: string): string {
  if (process.env.NODE_ENV !== 'production') {
    return detail;
  }
  return redactErrorDetail(detail);
}

/**
 * Extract a string message from an unknown thrown value.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || 'Unknown error';
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
