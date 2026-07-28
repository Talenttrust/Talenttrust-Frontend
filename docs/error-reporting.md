# Error Reporting & Boundary Redaction

This project implements a pluggable, SSR-safe error reporting abstraction plus DOM-safe redaction for React / Next.js error boundaries.

## Architecture

| Module | Role |
| --- | --- |
| `src/lib/errorReporter.ts` | Pluggable reporter; returns a **user-safe digest** for support quotes |
| `src/lib/redactErrorDetail.ts` | Strips Stellar G-addresses, URLs, and stack frames before detail hits the DOM |
| `src/components/SafeBoundary.tsx` | Section error boundary — stable copy + digest |
| `src/app/error.tsx` | Route error boundary — stable copy + digest |
| `src/app/global-error.tsx` | Root error boundary — stable copy + digest |

---

## API Reference

### `reportError(error, context, level?, meta?): string`

Reports the **full unredacted** error to the active reporter and returns a digest:

- Prefers an existing Next.js `error.digest` when present
- Otherwise derives a short `tt-xxxxxxxx` identifier
- Attaches the digest onto the error object when possible

Boundary UIs must show this digest — **not** `error.message` — so users can quote a safe reference in support requests.

### `resolveErrorDigest(error): string`

Pure helper used by `reportError` (and tests) to resolve the digest without reporting.

### `setErrorReporter(reporter | null): void`

Inject a custom reporter (Sentry, etc.) or pass `null` to restore the default.

### Redaction helpers (`redactErrorDetail.ts`)

```typescript
redactErrorDetail(detail: string): string
// Always strips G-addresses, http(s) URLs, and `at …` stack lines.

prepareErrorDetailForDom(detail: string): string
// Development / test: returns detail unredacted.
// Production: always runs redactErrorDetail first.
```

---

## Default reporter behaviour

1. **Development / Test** (`NODE_ENV !== 'production'`): logs via `console.error` / `console.warn` with a `[Context]` prefix.
2. **Production**: console is a no-op; digests are still returned for UI.

---

## Boundary UI contract

All three boundaries follow the same rules:

1. Call `reportError(error, …)` with the **full** error (wallet addresses, stacks, etc. stay in the reporter path only).
2. Render a **stable** user-facing sentence (no raw exception text as the primary message).
3. Render `Reference: {digest}` so support can correlate reports.
4. Optional debug detail:
   - **Development**: may show `prepareErrorDetailForDom(message)` (unredacted path).
   - **Production**: never mounts detail that could leak secrets; if detail were shown it must pass through `prepareErrorDetailForDom` (always redacts).

### Example support reference

```
Reference: tt-a1b2c3d4
```

or a Next.js digest:

```
Reference: 389234871
```

---

## Injecting a custom reporter

```typescript
import { setErrorReporter } from '@/lib/errorReporter';

setErrorReporter((error, context, level, meta) => {
  Sentry.captureException(error, {
    level: level === 'warn' ? 'warning' : 'error',
    tags: { context },
    extra: meta,
  });
});
```

---

## Testing

```bash
npm test -- --testPathPattern="redactErrorDetail|SafeBoundary|error.test|global-error|errorReporter"
```

Covered edge cases:

- G-address / URL / stack redaction
- Unredacted path outside production
- Forced redaction in production
- Digest shown instead of raw message in SafeBoundary / route boundaries
- Existing Next.js digest preferred when present
