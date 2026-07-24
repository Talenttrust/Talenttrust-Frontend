# Disputes — API Contract

This document covers every disputes-related module in the TalentTrust Frontend:
the validation helper, the `ActionPanel` dispute UI, and the contract-detail
page handler that persists a dispute transition. Each section maps inputs,
outputs, error codes, and accessibility behaviour to the actual source so it
stays accurate as the code evolves.

---

## Table of Contents

1. [Overview](#overview)
2. [Status Model](#status-model)
3. [validateDisputeReason — `src/lib/disputeReason.ts`](#validatedisputereason)
4. [ActionPanel — Dispute Flow — `src/components/ActionPanel.tsx`](#actionpanel-dispute-flow)
   - [Inline Form (default)](#inline-form-default)
   - [Confirm Dialog (legacy)](#confirm-dialog-legacy)
5. [Contract Detail Page — `src/app/contracts/[id]/page.tsx`](#contract-detail-page)
6. [Error Codes & Messages](#error-codes--messages)
7. [Accessibility Notes](#accessibility-notes)
8. [Cross-References](#cross-references)

---

## Overview

Disputes are a lifecycle state a contract can enter when a party believes the
work or terms have not been honoured. The dispute flow is purely **client-side**:

1. The user clicks **Dispute** in the `ActionPanel`.
2. An inline form (or legacy confirm dialog) captures a free-text reason.
3. The validated reason string is forwarded to `onDispute(reason: string)`.
4. The page handler persists the new `Disputed` status to `localStorage` via
   `upsertContract` from `src/lib/repository.ts`.

No network call is made; the dispute state is a local persistence transition
using the same repository pattern as every other contract status change.

---

## Status Model

Contracts use the `StatusType` union defined in `src/components/StatusBadge.tsx`
and re-exported from `src/types/domain.ts`:

```ts
export type StatusType = 'Active' | 'Completed' | 'Disputed' | 'Pending' | 'Paid';
```

Milestones share the same `StatusType`. The `Disputed` variant carries:

| Property   | Value                                           |
|------------|-------------------------------------------------|
| Badge icon | `⚠` (decorative, `aria-hidden="true"`)         |
| Badge CSS  | `--status-error-bg` / `--status-error-foreground` CSS variables |
| aria-label | `"Status: Disputed"`                            |

The `ActionPanel` maps contract status to available actions:

| Contract Status | Visible action buttons                          |
|-----------------|-------------------------------------------------|
| `Active`        | Submit Milestone · Release Funds · **Dispute**  |
| `Pending`       | Release Funds · **Dispute**                     |
| `Disputed`      | **Dispute**                                     |
| `Completed`     | View Summary                                    |

---

## validateDisputeReason

**Source:** `src/lib/disputeReason.ts`

### Exports

```ts
export const DISPUTE_REASON_MAX_LENGTH = 500;

export function validateDisputeReason(
  value: string,
): { valid: boolean; error?: string }
```

### Parameters

| Parameter | Type     | Required | Description                            |
|-----------|----------|----------|----------------------------------------|
| `value`   | `string` | Yes      | Raw dispute reason text from the user. |

The function coerces `null` / `undefined` via `(value || '').trim()` so it
never throws on unexpected runtime values.

### Return Shape

```ts
// success
{ valid: true }

// failure
{ valid: false; error: string }
```

### Validation Rules (in order)

| Rule | Condition | Error message |
|------|-----------|---------------|
| 1 — Non-empty | `trimmed.length === 0` | `"Please provide a reason for the dispute."` |
| 2 — Max length | `trimmed.length > 500` | `"Reason must be 500 characters or fewer."` |

### Examples

```ts
import { validateDisputeReason, DISPUTE_REASON_MAX_LENGTH } from '@/lib/disputeReason';

// Valid reason
validateDisputeReason('Milestone 3 was not delivered by the agreed date.');
// → { valid: true }

// Empty string
validateDisputeReason('');
// → { valid: false, error: 'Please provide a reason for the dispute.' }

// Whitespace only
validateDisputeReason('   ');
// → { valid: false, error: 'Please provide a reason for the dispute.' }

// Exactly 500 characters (at the limit — valid)
validateDisputeReason('a'.repeat(500));
// → { valid: true }

// 501 characters (over the limit — invalid)
validateDisputeReason('a'.repeat(501));
// → { valid: false, error: 'Reason must be 500 characters or fewer.' }

// Leading/trailing whitespace that makes it valid after trimming
validateDisputeReason('  Valid reason with whitespace.  ');
// → { valid: true }

// null / undefined (runtime coercion)
validateDisputeReason(null as any);
// → { valid: false, error: 'Please provide a reason for the dispute.' }
```

---

## ActionPanel — Dispute Flow

**Source:** `src/components/ActionPanel.tsx`

The `ActionPanel` exposes two dispute UX modes selected by the `disputeFlow`
prop:

| `disputeFlow` value | Description |
|---------------------|-------------|
| `'inline'` (default) | Renders an expandable form below the Dispute button. The reason is collected and validated before `onDispute` is called. |
| `'confirm'`          | Opens the shared `ConfirmDialog` with a fixed confirmation message. `onDispute` is called with a static fallback reason. Used by the contract detail page. |

### Props (dispute-relevant subset)

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `status` | `'Active' \| 'Completed' \| 'Disputed' \| 'Pending'` | — | Drives visibility of the Dispute button. |
| `onDispute` | `(reason: string) => void` | `undefined` | Called after the user confirms a valid dispute. Receives the **trimmed** reason string. |
| `isLoading` | `boolean` | `false` | Disables all action buttons, including Dispute. |
| `errorMessage` | `string` | `undefined` | Renders a `role="alert"` region above actions for transient API errors. |
| `disabledReasons.dispute` | `string` | `undefined` | Screen-reader description for why the Dispute button is disabled. Rendered in an `sr-only` span linked via `aria-describedby`. |
| `disputeFlow` | `'inline' \| 'confirm'` | `'inline'` | Selects the UX mode (see above). |

### Inline Form (default)

When `disputeFlow="inline"` and the user's wallet is connected:

1. Click **Dispute** → opens the inline reason form below the button.
2. User types a reason (max 500 characters, enforced via `maxLength` attribute
   and `handleDisputeReasonChange`).
3. Click **Confirm Dispute** → calls `handleDisputeSubmit`:
   - Re-checks wallet connection; if disconnected, sets error
     `"Connect your wallet before submitting a dispute."` and returns focus to
     the textarea.
   - Calls `validateDisputeReason(reason)`. On failure, sets the error message
     and returns focus to the textarea.
   - On success, calls `onDispute(reason.trim())` and closes the form.
4. Click **Cancel** → closes the form; focus returns to the Dispute button.

#### State machine (inline form)

```
[Dispute button visible]
  │
  ▼ click Dispute
[Form open — textarea focused]
  │
  ├─ Cancel ──────────────────────────────→ [Form closed — Dispute button focused]
  │
  └─ Confirm Dispute
       │
       ├─ Wallet disconnected ────────────→ [Error shown — textarea focused]
       │
       ├─ Validation fails ───────────────→ [Error shown — textarea focused]
       │
       └─ Validation passes
            │
            ▼
         onDispute(trimmedReason) called
            │
            ▼
         [Form closed — Dispute button focused]
```

#### Character counter behaviour

| Remaining chars | `aria-live` region | Announcement frequency |
|-----------------|--------------------|------------------------|
| > 50            | `polite`           | Debounced 1 000 ms after last keystroke; immediate at multiples of 50 |
| ≤ 50            | `assertive`        | Immediate at multiples of 10 |
| ≤ 10            | `assertive`        | Every keystroke |
| 0               | `assertive`        | Immediate |

The visual counter (`aria-hidden="true"`) always shows `"X of 500 characters"`.
The screen-reader counter uses the `sr-only` live region with id
`dispute-reason-counter`.

#### Request/response example (inline form)

**User action — open form and submit valid reason:**

```
User input:  "The work delivered in milestone 3 does not match the agreed spec."
Trimmed:     "The work delivered in milestone 3 does not match the agreed spec."
Length:      67  (≤ 500 ✓)
Wallet:      connected ✓
```

**Result — `onDispute` called:**

```ts
onDispute("The work delivered in milestone 3 does not match the agreed spec.")
```

**User action — submit empty reason:**

```
User input:  ""
```

**Result — validation error displayed (no callback):**

```
error: "Please provide a reason for the dispute."
focus: textarea
```

**User action — submit whitespace-only reason:**

```
User input:  "     "
```

**Result:**

```
error: "Please provide a reason for the dispute."
focus: textarea
```

**User action — submit reason exceeding 500 characters:**

> Note: The textarea enforces `maxLength={500}` and the change handler silently
> truncates at 500, so this path is reached only if `validateDisputeReason` is
> called directly with an over-length string (e.g. in tests).

```
error: "Reason must be 500 characters or fewer."
focus: textarea
```

**User action — submit while wallet is disconnected:**

```
wallet: disconnected
```

**Result:**

```
error: "Connect your wallet before submitting a dispute."
focus: textarea
```

### Confirm Dialog (legacy)

When `disputeFlow="confirm"`:

1. Click **Dispute** → opens `ConfirmDialog` with:
   - `title`: `"Confirm Dispute"`
   - `description`: `"Are you sure you want to open a dispute for this contract? This action cannot be undone."`
   - `confirmLabel`: `"Dispute"`
   - `tone`: `"destructive"`
2. Click **Dispute** in dialog → calls `onDispute('Dispute opened from action panel.')`.
3. Click **Cancel** / press `Escape` → closes dialog; focus returns to the
   Dispute button.

> This mode is used by `src/app/contracts/[id]/page.tsx` (`disputeFlow="confirm"`).
> The reason string is a static fallback; the page-level handler ignores the
> reason and records only the status transition.

---

## Contract Detail Page

**Source:** `src/app/contracts/[id]/page.tsx`

### Route

```
GET /contracts/[id]
```

`[id]` is validated by `isValidContractId` from `src/lib/validateContractId.ts`
before the component mounts. Invalid ids trigger Next.js `notFound()`.

### handleDispute

```ts
const handleDispute = useCallback(() => {
  persistContractStatus(
    'Disputed',
    'Dispute opened',
    'The contract was marked as Disputed and the change was saved.',
  );
}, [persistContractStatus]);
```

`handleDispute` is passed as the `onDispute` prop to `ActionPanel`. When
called, it invokes `persistContractStatus` which:

1. Guards against a missing `contractData` (returns early with an error toast).
2. Calls `upsertContract(buildPersistedContract(contractData, 'Disputed'))`.
3. On **success**: updates local React state (`setContractData`) and fires a
   success toast.
4. On **failure** (localStorage write returns `false`): sets `errorMessage` and
   fires an error toast without changing state.

### persistContractStatus — request/response shape

**Input:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `nextStatus` | `ContractData['status']` | The new status to persist (`'Disputed'`). |
| `successTitle` | `string` | Toast title on success. |
| `successDescription` | `string` | Toast description on success. |

**Success path:**

```ts
// Contract state before:
contractData.status === 'Active'

// After handleDispute():
contractData.status === 'Disputed'

// Toast:
showSuccess({
  title: 'Dispute opened',
  description: 'The contract was marked as Disputed and the change was saved.',
})
```

**Failure path — no contractData:**

```ts
setErrorMessage(
  'Contract details are unavailable, so the status could not be updated.'
)
showError({
  title: 'Unable to update contract',
  description: 'Contract details are unavailable, so the status could not be updated.',
})
```

**Failure path — localStorage write fails:**

```ts
setErrorMessage(
  'The contract status could not be persisted. Please try again.'
)
showError({
  title: 'Unable to update contract',
  description: 'The contract status could not be persisted. Please try again.',
})
// contractData.status unchanged
```

### buildPersistedContract — output shape

```ts
{
  contractName: string;       // from contractData.name
  parties: ContractParty[];   // from contractData.parties
  totalValue: number;         // from contractData.totalValue
  currency: string;           // from contractData.currency
  status: 'Disputed';         // the new status
  createdAt: string;          // from contractData.createdAt
  milestoneCount: number;     // from contractData.milestones.length
}
```

This shape satisfies the `Contract` type from `src/types/domain.ts` and is
written to `localStorage` under the key `talenttrust_app_data` by
`upsertContract`.

---

## Error Codes & Messages

All user-facing error strings are defined in source as string literals. They
are listed here for integrators writing UI copy or tests:

| Code / location | Message | When surfaced |
|-----------------|---------|---------------|
| `DISPUTE_REASON_EMPTY` | `"Please provide a reason for the dispute."` | `validateDisputeReason` — empty / whitespace-only input |
| `DISPUTE_REASON_TOO_LONG` | `"Reason must be 500 characters or fewer."` | `validateDisputeReason` — trimmed length > 500 |
| `DISPUTE_WALLET_ERROR` | `"Connect your wallet before submitting a dispute."` | `ActionPanel` — wallet disconnected at form submit time |
| `PERSIST_NO_CONTRACT` | `"Contract details are unavailable, so the status could not be updated."` | `persistContractStatus` — `contractData` is null |
| `PERSIST_WRITE_FAIL` | `"The contract status could not be persisted. Please try again."` | `persistContractStatus` — `upsertContract` returns `false` |

The `ActionPanel` renders validation errors in a `role="alert"` paragraph with
`id="dispute-reason-error"`. The contract detail page renders `errorMessage`
inside `ActionPanel`'s own `role="alert"` region above the action buttons.

---

## Accessibility Notes

- The **Dispute button** carries `aria-expanded` (reflects inline form open/close)
  and `aria-controls="dispute-reason-form"` when the form is open.
- The inline form container uses `role="group"` with `aria-labelledby="dispute-form-heading"`.
- The reason `<textarea>` has `aria-required="true"`, `aria-invalid="true"` on
  error, and `aria-describedby` pointing to the hint span, character counter,
  and (when present) the error span.
- Focus management:
  - Opening the form moves focus to the textarea.
  - Cancelling or successfully submitting returns focus to the Dispute button
    (`disputeTriggerRef`). If that button is no longer in the DOM or is
    disabled, focus falls back to the `<aside>` panel itself.
- Screen-reader announcements for character count use a controlled live region
  (polite/assertive escalation) that is only mounted while the form is open,
  preventing stale announcements when the form is closed.

For the full accessibility specification see
[`docs/components/ActionPanel.md`](./components/ActionPanel.md) and
[`docs/components/Accessibility.md`](./components/Accessibility.md).

---

## Cross-References

| File | Role |
|------|------|
| `src/lib/disputeReason.ts` | Validation helper (`validateDisputeReason`, `DISPUTE_REASON_MAX_LENGTH`) |
| `src/components/ActionPanel.tsx` | Dispute UI — inline form and confirm dialog modes |
| `src/components/ConfirmDialog.tsx` | Modal used by the confirm-dialog dispute flow |
| `src/app/contracts/[id]/page.tsx` | Page handler — `handleDispute` and `persistContractStatus` |
| `src/lib/repository.ts` | `upsertContract` — persists `Disputed` status to localStorage |
| `src/types/domain.ts` | Re-exports `StatusType`, `Contract`, `Milestone` |
| `src/components/StatusBadge.tsx` | `StatusType` definition; `Disputed` badge styling |
| `src/lib/__tests__/disputeReason.test.ts` | Unit tests for `validateDisputeReason` |
| `src/components/__tests__/ActionPanel.test.tsx` | Integration tests for dispute form and confirm flows |
