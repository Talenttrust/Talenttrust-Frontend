# Error Reporting Abstraction

This project implements a pluggable, SSR-safe error reporting abstraction designed to unify error catching across UI components and route boundaries.

## Architecture

The abstraction resides in `src/lib/errorReporter.ts` and provides standard interfaces for reporting errors and injecting custom reporters (e.g. Sentry, Rollbar, LogRocket, or custom internal dashboards).

### API Reference

#### Types

```typescript
type ErrorReporter = (error: unknown, context: string) => void;
```

#### Functions

* **`reportError(error: unknown, context: string): void`**
  Reports an error captured in a React/Next.js boundary.
  
* **`setErrorReporter(reporter: ErrorReporter | null): void`**
  Injects a custom error reporter. Pass `null` to reset behavior back to the default reporter.

---

## Default Behavior

The default error reporter adapts automatically to the environment:

1. **Development/Test (`process.env.NODE_ENV !== 'production'`)**:
   Errors are output directly to `console.error` with a prefix: `[Context] error`.
2. **Production (`process.env.NODE_ENV === 'production'`)**:
   Reports are completely suppressed (no-op) to avoid polluting logs or console outputs in production.

---

## Integration in Codebase

The abstraction is already integrated into core boundaries:

* **`src/components/SafeBoundary.tsx`**: Triggers `reportError(error, 'SafeBoundary')` on component catch.
* **`src/app/error.tsx`**: Triggers `reportError(error, 'Error Boundary')` in the Next.js page error boundary.
* **`src/app/global-error.tsx`**: Triggers `reportError(error, 'Global Error Boundary')` in the Next.js global root boundary.

---

## Injecting a Custom Reporter

You can configure a custom error reporting service by importing `setErrorReporter` at the application's entry point (e.g. in your main layout or initialization logic):

```typescript
import { setErrorReporter } from '@/lib/errorReporter';

setErrorReporter((error, context) => {
  // Example: Forward to external telemetry/Sentry
  Sentry.captureException(error, {
    extra: { context }
  });
});
```
