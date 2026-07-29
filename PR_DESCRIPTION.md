## Description

Extract a shared `useFormValidation` hook from the duplicated validation state logic that was repeated across `ContractCreationForm`, `CreateContractForm`, `MilestoneCreationForm`, and the login form (`page.tsx`).

Each form previously re-implemented the same `errors` state, submit-time validation, and `ErrorSummary` focus handoff — making accessibility regressions easy to introduce in one form but not others. This PR consolidates the pattern into a single, tested source of truth.

### Changes

- **`src/hooks/useFormValidation.ts`** — New hook returning `{ errors, validateAndSubmit, clearFieldError, setFieldError }` typed against `ValidationError` from `@/lib/validateLogin`.
- **`src/hooks/__tests__/useFormValidation.test.tsx`** — 24 unit tests covering all states, transitions, and edge cases (initial state, success/failure paths, per-field error clearing, external validation integration, instance isolation).
- **`docs/hooks/useFormValidation.md`** — Usage documentation following the existing hook doc style.
- **`src/app/page.tsx`** — Migrated to use `validateAndSubmit` with the `onError` callback for screen-reader announcements.
- **`src/components/ContractCreationForm.tsx`** — Migrated to use `validateAndSubmit`.
- **`src/components/contracts/CreateContractForm.tsx`** — Migrated to use `validateAndSubmit`, `clearFieldError`, and `setFieldError` (for `WalletAddressInput` external validation).
- **`src/components/milestones/MilestoneCreationForm.tsx`** — Migrated to use `validateAndSubmit`; restored `hasErrors()` and submit button `disabled` prop (regression from partial migration).
- **`src/components/milestones/MilestoneCreationForm.test.tsx`** — Updated test and snapshots to reflect the restored disabled-button behavior.

### Key design decisions

- `validateAndSubmit` always calls `setErrors` with a **new array reference**, so `ErrorSummary`'s focus `useEffect` fires reliably on every submit (byte-for-byte match with the original inline behavior).
- The optional `onError` callback enables forms like the login page to trigger screen-reader announcements on validation failure without coupling the hook to the announcer.
- `setFieldError` enables external components (e.g. `WalletAddressInput`) to push errors into the form's validation state — replacing the inline `setErrors` functional-update pattern that `CreateContractForm` previously used.

Closes #408

## Type of Change

- [x] Refactor (no functional change, internal code improvement)
- [x] Documentation update

---

## Pre-flight Checklist

- [x] `npm run lint` passes with no errors on changed files
- [x] `npm test` passes with no failures
- [x] `npm run build` completes successfully

---

## Testing & Coverage

- [x] Module test coverage for impacted files meets or exceeds the **95% minimum threshold**
  - `useFormValidation.test.tsx`: 24 tests, all passing (6 describe blocks covering initial state, success path, failure path, clearFieldError, setFieldError, multiple submissions, integration patterns, instance isolation, edge cases)

### What was tested?

- **Hook unit tests**: Initial state, success/failure paths, per-field error clearing, external validation via `setFieldError`, multiple submissions, instance isolation, edge cases (empty validator, large error count, void return).
- **Integration tests**: Login form (`page.test.tsx` — 46 tests), milestone form (`MilestoneCreationForm.test.tsx` — 6 tests with updated snapshots).

---

## Accessibility & Security Notes

### Accessibility

The `ErrorSummary` focus-on-submit behaviour is preserved byte-for-byte. Each form continues to render `ErrorSummary` with `role="alert"`, `aria-labelledby`, and auto-focus on validation failure. The hook's `onError` callback is used in `page.tsx` for form announcer integration.

### Security

No changes to authentication, authorization, wallet logic, API calls, or user-supplied input handling. Validation logic remains in the existing pure validator functions (`validateLogin`, `validateContract`, `validateMilestone`).
