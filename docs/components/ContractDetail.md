# Contract Detail Components

This page uses a set of reusable components to present contract metadata, milestone progress, and context-aware actions.

## Components

### `ContractSummary`

Props:
- `contractName: string`
- `parties: { label: string; address: string }[]`
- `totalValue: number`
- `currency: string`
- `status: 'Active' | 'Completed' | 'Disputed' | 'Pending'`
- `createdAt: string`
- `milestoneCount: number`

Description: Displays the contract name, current status badge, total value, creation date, and key parties with middle-truncated addresses.

### `MilestonesList`

Props:
- `milestones: Array<{ id: string; title: string; status: 'Pending' | 'Completed' | 'Paid' | 'Disputed'; payout: number; currency: string; dueDate?: string; }>`

Description: Renders a scrollable milestone roster, each showing the title, due date, status, and payout amount.

### `ActionPanel`

Props:
- `status: 'Active' | 'Completed' | 'Disputed' | 'Pending'`
- `onSubmitMilestone?: () => void`
- `onDispute?: () => void`
- `onReleaseFunds?: () => void`
- `onViewSummary?: () => void`
- `disabledReasons?: Partial<Record<ActionKey, string>>`
- `errorMessage?: string`
- `isLoading?: boolean`

Description: Chooses appropriate action buttons based on the current contract status. See `docs/components/ActionPanel.md` for keyboard support, disabled-state reasons, loading, and error guidance.

## Adding a new action type

1. Update the `ActionPanelProps` type to include the callback for the new action.
2. Extend the `getActionButtons` helper inside `ActionPanel.tsx` with the new status-to-action mapping.
3. Add a new button render block in `ActionPanel` that uses the callback and descriptive `aria-label`.
4. Add unit tests in `src/components/__tests__/ActionPanel.test.tsx` to verify the new action appears for the correct status and that the callback triggers.

## Route parameter validation

The `id` route parameter is validated by `isValidContractId` (defined in `src/lib/validateContractId.ts`) before it is used anywhere on the page.

Rules enforced:
- **Non-empty** — an empty string is rejected.
- **Allowed charset** — only alphanumeric characters (`a–z`, `A–Z`, `0–9`), hyphens (`-`), and underscores (`_`) are accepted. Slashes, angle brackets, null bytes, and other special characters are all rejected.
- **Max length** — at most 64 characters. Oversized values are rejected.

If the id fails any rule, Next.js `notFound()` is called immediately and the existing not-found UI is shown. The raw param value is never rendered or forwarded.

## Layout

The contract detail page uses a responsive grid:
- Desktop: a two-column layout with summary and milestones on the left, and a sticky action panel on the right.
- Mobile: stacked content to keep text readable and controls accessible.

## Accessibility

- Status badges use high contrast color combinations.
- Buttons include descriptive `aria-label` attributes, visible focus rings, and disabled-state descriptions.
- Section headers use semantic landmarks and visible labels.
