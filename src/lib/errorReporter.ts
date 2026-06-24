export type ErrorReporter = (error: unknown, context: string) => void;

const defaultReporter: ErrorReporter = (error, context) => {
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[${context}]`, error);
  }
};

let activeReporter: ErrorReporter = defaultReporter;

/**
 * Reports an error with context.
 * Default behavior:
 * - Development/Test environments: Outputs the error to console.error
 * - Production: No-op
 *
 * Can be overridden by calling setErrorReporter.
 */
export function reportError(error: unknown, context: string): void {
  try {
    activeReporter(error, context);
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error within injected error reporter:', err);
    }
  }
}

/**
 * Inject a custom error reporter, or pass null to reset to default.
 */
export function setErrorReporter(reporter: ErrorReporter | null): void {
  activeReporter = reporter || defaultReporter;
}
