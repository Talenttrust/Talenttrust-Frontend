# Preferences

`src/lib/preferences.tsx`

Global user-preference state (theme, amount format, toast density, quiet mode) backed by `localStorage`. Used across the escrow payout display in `MilestonesList` and any component that needs to format monetary amounts.

---

## API

### `PreferencesProvider`

Mount once at the app root (e.g. `app/layout.tsx`). Loads persisted preferences from `localStorage` on mount and writes back on every change.

```tsx
<PreferencesProvider>{children}</PreferencesProvider>
```

### `usePreferences()`

Returns `{ preferences, updatePreference, formatAmount }`.

| Field | Type | Description |
|---|---|---|
| `preferences` | `UserPreferences` | Current values |
| `updatePreference(key, value)` | `function` | Merge-update one field and persist |
| `formatAmount(amount, currency?)` | `function` | Format a number per `amountFormat` |

### `formatAmount(amount: number, currency?: string): string`

| `amountFormat` | Behaviour |
|---|---|
| `'usd'` (default) | `Intl.NumberFormat` `en-US`, currency style, passed `currency` (default `"USD"`) |
| `'ngn'` | `Intl.NumberFormat` `en-NG`, currency forced to `"NGN"` |
| `'compact'` | `en-US`, compact notation, currency style with passed `currency` |

Edge cases handled: `0`, fractions (e.g. `0.5`), large payouts (`1 000 000+`), negative amounts.

---

## Types

```ts
type Theme        = 'light' | 'dark' | 'system';
type AmountFormat = 'usd'   | 'ngn'  | 'compact';
type ToastDensity = 'relaxed' | 'compact';

interface UserPreferences {
  theme:        Theme;
  amountFormat: AmountFormat;
  toastDensity: ToastDensity;
  quietMode:    boolean;
}
```

---

## Usage example

```tsx
'use client';
import { usePreferences } from '@/lib/preferences';

export function PayoutAmount({ amount, currency }: { amount: number; currency: string }) {
  const { formatAmount } = usePreferences();
  return <span>{formatAmount(amount, currency)}</span>;
}
```

---

## Security

Persisted preferences are treated as untrusted input. `sanitizePreferences(raw)` returns a fresh `UserPreferences` object, copies only the known keys (`theme`, `amountFormat`, `toastDensity`, and `quietMode`), validates each value against its allowed set, and ignores prototype-pollution keys such as `__proto__` or `constructor`.

Malformed JSON still falls back to defaults during provider hydration. Unknown keys and invalid enum values are dropped rather than merged into state.

---

## Accessibility

- No interactive UI is provided by this module; it is a context/hook layer only.
- Components consuming `formatAmount` must wrap output in appropriate ARIA text — e.g. `<span aria-label="Payout $1,000.00">$1,000.00</span>`.

---

## Testing

File: `src/lib/__tests__/preferences.test.tsx`

Coverage targets (≥ 95%):

| Area | Tests |
|---|---|
| Default preferences | `provides default preferences` |
| localStorage read | `loads preferences from localStorage on mount`, `merges partial data with defaults`, `falls back on invalid JSON` |
| localStorage write | `updates preferences and persists` |
| Sanitization | malformed, array, unknown-key, invalid-enum, and prototype-pollution payloads |
| `formatAmount` – USD | zero, fraction, large, negative, default currency |
| `formatAmount` – NGN | typical, zero, large |
| `formatAmount` – compact | thousands (`K`), millions (`M`), zero |
| Custom currency handling | default and compact formats preserve caller-provided currency |
| Re-render consumer | `consumer component re-renders with updated format` |
| Outside provider | default fallback formatting and no-op `updatePreference` |

Run tests:

```bash
npm test -- --testPathPattern=preferences --coverage
```
