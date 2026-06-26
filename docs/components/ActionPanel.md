# ActionPanel Component

`ActionPanel` renders the contract actions available from the escrow detail page. The component is intentionally built from native `button` controls so actions remain reachable and operable by keyboard without custom key handling.

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `status` | `'Active' \| 'Completed' \| 'Disputed' \| 'Pending'` | Yes | Determines which actions are shown and their tab order. |
| `onSubmitMilestone` | `() => void` | No | Callback for submitting milestone work for approval. |
| `onDispute` | `() => void` | No | Callback for opening the dispute flow. |
| `onReleaseFunds` | `() => void` | No | Callback for releasing escrow funds. |
| `onViewSummary` | `() => void` | No | Callback for viewing the completed contract summary. |
| `disabledReasons` | `ActionPanelDisabledReasons` | No | Disables specific visible actions globally and exposes the provided reason through `aria-describedby` (e.g. `submitMilestone`, `releaseFunds`, `dispute`, `viewSummary`). |
| `errorMessage` | `string` | No | Announces transient API or network errors with a `role="alert"` region rendered above the actions. |
| `isLoading` | `boolean` | No | Disables all visible actions while contract or wallet state is loading, providing a universal screen-reader loading reason. |

## Aria Descriptions & Disabled Reasons

The `ActionPanel` manages accessibility heavily through `aria-describedby` for disabled buttons, allowing screen reader users to understand *why* an action cannot be performed:

- **`isLoading`**: When `true`, it renders a hidden span with `id="action-panel-loading-reason"` containing "Action is disabled while contract data is loading." All visible buttons point to this ID via `aria-describedby`.
- **`disabledReasons`**: If `isLoading` is false, the panel checks `disabledReasons` for each action key (e.g., `submitMilestone`). If a reason string is provided, a hidden span is rendered with `id="action-panel-${key}-reason"`, and the button points to this ID via `aria-describedby`.

**Note on Wallet Gating**: Buttons are automatically disabled and receive a `title` (tooltip) if `isWalletConnected` is false, overriding individual `disabledReasons` visually but still preserving the accessible structure.

## Accessibility

- Buttons use browser-native keyboard support for `Tab`, `Enter`, and `Space`.
- Visible focus rings use high-contrast Tailwind `focus-visible:outline` utilities and are not removed in any state.
- Actions are rendered in contract workflow order: submit milestone, release funds, dispute, then summary when applicable.
- Unavailable actions stay visible as disabled buttons with an accessible reason. Use `disabledReasons` for states such as no wallet, missing permissions, pending API responses, or unmet milestone conditions.
- Loading states disable all visible actions and describe that contract data is still loading.
- Error states are announced through `role="alert"` without moving focus or changing the action order.

## Status Mapping

| Status | Visible actions |
|--------|-----------------|
| `Active` | Submit Milestone, Release Funds, Dispute |
| `Pending` | Release Funds, Dispute |
| `Disputed` | Dispute |
| `Completed` | View Summary |

## Usage Example

```tsx
import ActionPanel from '@/components/ActionPanel';

export default function ContractDetail({ contractData, isLoading, errorMessage }) {
  const handleSubmitMilestone = () => { /* ... */ };
  const handleReleaseFunds = () => { /* ... */ };
  const handleDispute = () => { /* ... */ };
  const handleViewSummary = () => { /* ... */ };

  return (
    <ActionPanel
      status={contractData?.status || 'Active'}
      onSubmitMilestone={handleSubmitMilestone}
      onReleaseFunds={handleReleaseFunds}
      onDispute={handleDispute}
      onViewSummary={handleViewSummary}
      isLoading={isLoading}
      errorMessage={errorMessage}
      disabledReasons={{
        submitMilestone: !contractData?.canSubmit ? 'You do not have permission to submit milestones.' : undefined,
      }}
    />
  );
}
```

## Testing Notes

The component tests cover:

- Action rendering and callback behavior for active and completed contracts.
- Logical button order for keyboard navigation.
- Visible focus ring classes on every enabled action.
- Disabled action semantics and screen-reader descriptions.
- Loading, slow-network error, and missing-handler edge cases.
