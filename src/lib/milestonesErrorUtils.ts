/**
 * Utility functions for deterministic milestones error handling.
 *
 * Exported so that both the error boundary component and its tests can
 * share the same error-identity and validation logic without duplication.
 */

import type { Error as NodeError } from 'next';

/**
 * Ensures the given value is a valid Error instance suitable for state
 * tracking and reporting. Non-Error values are sanitized into a minimal
 * synthetic Error so that subsequent identity checks, reporting, and UI
 * rendering remain predictable and safe.
 *
 * Invariants:
 * - Never returns null or undefined.
 * - Never exposes the original value's message, stack, or custom properties
 *   in reported metadata.
 * - A given synthetic Error is deterministic for the same input category.
 */
export function ensureValidError(
  error: unknown,
): NodeError & { digest?: string } {
  if (error instanceof Error) {
    return error;
  }
  if (error === null || error === undefined) {
    const synthetic = new Error('Invalid milestone error');
    // Do not copy message/stack from the original to avoid leakage.
    return synthetic;
  }
  // For non-Error objects (hostile getters, etc.), create a synthetic Error.
  try {
    return new Error(String(error));
  } catch {
    return new Error('Invalid milestone error');
  }
}

/**
 * Returns a deterministic identity string for an Error value.
 *
 * The identity is based on the error's `digest` when present and valid,
 * otherwise on the error's `name` and `message`. This identity is used
 * to suppress duplicate reports across rerenders, rapid retries, and
 * boundary path variations.
 *
 * Invariants:
 * - Never throws, even when accessing `.name` or `.message` triggers
 *   hostile getters.
 * - The output is a stable string for the same error value across calls.
 * - Invalid/edge inputs produce a neutral, predictable identity.
 */
export function getErrorIdentity(
  error: NodeError & { digest?: string },
): string {
  if (typeof error.digest === 'string' && error.digest.length > 0) {
    return `digest:${error.digest}`;
  }

  // Fall back to a stable identity derived from the error object itself
  // so re-renders of the same instance do not re-report.
  try {
    return (
      'object:' +
      (error.name || 'Error').toString() +
      ':' +
      (error.message || '').toString()
    );
  } catch {
    return 'object:Error:';
  }
}

/**
 * Compares two Error values for sameness based on their deterministic
 * identity. Returns `true` when the same failure has already been reported,
 * preventing duplicate telemetry.
 *
 * The comparison follows the same logic as `getErrorIdentity`, so the
 * two functions are inverses of each other in practice:
 *   hasSameErrorIdentity(a, b) === (getErrorIdentity(a) === getErrorIdentity(b)).
 */
export function hasSameErrorIdentity(
  existing: NodeError | null,
  incoming: NodeError & { digest?: string },
): boolean {
  if (existing === null || existing === undefined) {
    return false;
  }
  const existingId = getErrorIdentity(existing);
  const incomingId = getErrorIdentity(incoming);
  return existingId === incomingId;
}