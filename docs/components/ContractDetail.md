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

Description: Chooses appropriate action buttons based on the current contract status.

## Adding a new action type

1. Update the `ActionPanelProps` type to include the callback for the new action.
2. Extend the `getActionButtons` helper inside `ActionPanel.tsx` with the new status-to-action mapping.
3. Add a new button render block in `ActionPanel` that uses the callback and descriptive `aria-label`.
4. Add unit tests in `src/components/__tests__/ActionPanel.test.tsx` to verify the new action appears for the correct status and that the callback triggers.

## Layout

The contract detail page uses a responsive grid:
- Desktop: a two-column layout with summary and milestones on the left, and a sticky action panel on the right.
- Mobile: stacked content to keep text readable and controls accessible.

## Accessibility

- Status badges use high contrast color combinations.
- Buttons include descriptive `aria-label` attributes.
- Section headers use semantic landmarks and visible labels.
