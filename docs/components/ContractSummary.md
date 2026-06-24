# ContractSummary Component

## Overview

The `ContractSummary` component renders a summary card for a contract, displaying the contract name, both parties, the current status badge, total value, creation date, and milestone count. It integrates with `StatusBadge`, `truncateAddress`, and the preferences-driven `formatAmount` for currency formatting.

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `contractName` | `string` | Yes | The name/title of the contract |
| `parties` | `ContractParty[]` | Yes | Array of parties with `label` and `address` fields |
| `totalValue` | `number` | Yes | The monetary total value of the contract |
| `currency` | `string` | Yes | The currency code (e.g. `USD`) |
| `status` | `StatusType` | Yes | The contract status (`Active`, `Completed`, `Disputed`, `Pending`, `Paid`) |
| `createdAt` | `string` | Yes | Human-readable creation date |
| `milestoneCount` | `number` | Yes | Number of milestones; controls pluralisation |

### ContractParty

```ts
type ContractParty = {
  label: string;
  address: string;
};
```

## Rendering Behaviour

- **Contract name** — rendered as an `<h1>` with `id="contract-summary-title"`
- **Status badge** — rendered via `StatusBadge` with the passed `status`
- **Total value** — formatted through `formatAmount` from `usePreferences()`
- **Party addresses** — truncated via `truncateAddress` (first 6 chars + `...` + last 4 chars)
- **Milestones** — displays count with correct pluralisation (`1 milestone` vs `2 milestones`)

## Currency Formatting

The component honours the `amountFormat` preference from `PreferencesProvider`:

| `amountFormat` | Behaviour | Example (1200 USD) |
|----------------|-----------|-------------------|
| `usd` (default) | Standard currency formatting in `en-US` locale | `$1,200.00` |
| `ngn` | Forces `NGN` currency with `en-NG` locale | `NGN1,200.00` |
| `compact` | Compact notation in `en-US` locale | `$1.2K` |

Outside a `PreferencesProvider` the component falls back to `en-US` standard currency formatting.

## Accessibility

- The outer `<section>` uses `aria-labelledby="contract-summary-title"` pointing to the `<h1>` containing the contract name, giving the region a programmatic label
- The `StatusBadge` carries `role="status"` and `aria-label="Status: {status}"`

## Dependencies

- `StatusBadge` from `@/components/StatusBadge`
- `truncateAddress` from `@/lib/truncateAddress`
- `usePreferences` from `@/lib/preferences`

## Testing

The component is tested in `src/components/__tests__/ContractSummary.test.tsx`:

- Contract name and truncated party addresses
- Status badge rendering and ARIA attributes
- Currency formatting with each `amountFormat` mode (usd, ngn, compact) inside `PreferencesProvider`
- Milestone count pluralisation (0, 1, 2+)
- Very long address truncation
- `aria-labelledby` association
- `jest-axe` accessibility violation check

Run tests with: `npm test src/components/__tests__/ContractSummary.test.tsx`
