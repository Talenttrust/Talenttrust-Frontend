/**
 * Severity level for reported errors.
 */
export type ErrorLevel = 'warn' | 'error';

/**
 * Custom error reporter function.
 *
 * @param error   - The error or value to report.
 * @param context - A short human-readable label describing where the error occurred.
 * @param level   - Optional severity level ('warn' | 'error'). Defaults to 'error'.
 * @param meta    - Optional structured metadata attached to the report.
 */
export type ErrorReporter = (
  error: unknown,
  context: string,
  level?: ErrorLevel,
  meta?: Record<string, unknown>,
) => void;

type DigestCarrier = { digest?: string };

const defaultReporter: ErrorReporter = (error, context, level, meta) => {
  if (process.env.NODE_ENV !== 'production') {
    const logger = level === 'warn' ? console.warn : console.error;
    if (meta !== undefined) {
      logger(`[${context}]`, error, meta);
    } else {
      logger(`[${context}]`, error);
    }
  }
};

let activeReporter: ErrorReporter = defaultReporter;

/**
 * Resolve or create a short, user-safe error digest for support quotes.
 * Prefers an existing Next.js / caller-provided `digest` when present.
 */
export function resolveErrorDigest(error: unknown): string {
  if (error && typeof error === 'object') {
    const existing = (error as DigestCarrier).digest;
    if (typeof existing === 'string' && existing.trim().length > 0) {
      return existing.trim();
    }
  }

  const seed =
    error instanceof Error
      ? `${error.name}:${error.message}`
      : typeof error === 'string'
        ? error
        : 'unknown';

  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Unsigned 32-bit hex, prefixed for easy recognition in support tickets.
  return `tt-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Reports an error with context, an optional severity level, and optional metadata.
 *
 * Default behavior:
 * - Development/Test environments: Outputs to console.warn (level='warn') or
 *   console.error (level='error' or omitted), with metadata if provided.
 * - Production: No-op for console; still returns a digest for UI support refs.
 *
 * Full (unredacted) error detail is intended for the reporter only — never for
 * the DOM. Boundary UIs should display the returned digest instead of `message`.
 *
 * Can be overridden by calling {@link setErrorReporter}.
 *
 * @returns A stable, user-safe digest string suitable for support requests.
 */
export function reportError(
  error: unknown,
  context: string,
  level?: ErrorLevel,
  meta?: Record<string, unknown>,
): string {
  const digest = resolveErrorDigest(error);

  // Attach digest onto Error-like objects when missing so downstream UI can read it.
  if (error && typeof error === 'object' && !(error as DigestCarrier).digest) {
    try {
      (error as DigestCarrier).digest = digest;
    } catch {
      // Non-extensible objects — digest is still returned to the caller.
    }
  }

  try {
    activeReporter(error, context, level, meta);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error within injected error reporter:', err);
    }
  }

  return digest;
}

/**
 * Inject a custom error reporter, or pass null to reset to default.
 */
export function setErrorReporter(reporter: ErrorReporter | null): void {
  activeReporter = reporter || defaultReporter;
}
