# MilestoneFilter Component

## Overview

`MilestoneFilter` renders the status filter used above the milestones list. It is a controlled component: the parent owns the selected status, filters the milestone array, and passes the matching result count back to the filter for screen-reader announcements.

## Location

`src/components/milestones/MilestoneFilter.tsx`

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `selected` | `MilestoneStatusFilter` | Yes | The currently active option. Must match one of the rendered filter values. |
| `onChange` | `(filter: MilestoneStatusFilter) => void` | Yes | Called when the user chooses a different radio option. Receives the selected filter value. |
| `resultCount` | `number` | Yes | Number of milestones that match `selected`. Used only for the hidden live-region announcement. |

## Status Options

`MilestoneStatusFilter` supports:

```ts
type MilestoneStatusFilter =
  | 'All'
  | 'Active'
  | 'Pending'
  | 'Completed'
  | 'Paid'
  | 'Disputed';
```

`All` is the default page state and should return the full milestone list. Every other option should be applied by comparing the milestone's `status` field to the selected value.

## Parent Integration

The component does not filter data by itself. The parent should derive both the filtered list and `resultCount` from the same array so the visual list and assistive-technology announcement stay aligned.

```tsx
const [statusFilter, setStatusFilter] = useState<MilestoneStatusFilter>('All');

const filtered = useMemo(() => {
  if (statusFilter === 'All') return milestones;
  return milestones.filter((milestone) => milestone.status === statusFilter);
}, [milestones, statusFilter]);

<MilestoneFilter
  selected={statusFilter}
  onChange={setStatusFilter}
  resultCount={filtered.length}
/>
```

Do not pass the total milestone count when a specific status is selected. `resultCount` must be `filtered.length`, including `0`, because the hidden announcement is the only nonvisual confirmation of how many results the current filter produced.

## Accessibility Model

- The visible group uses `<fieldset>` and `<legend>` to give the control a semantic label.
- The option row has `role="radiogroup"` and `aria-label="Filter milestones by status"`.
- Each option is a native `input type="radio"` with the shared `name="milestone-status-filter"`.
- Inputs are visually hidden with `sr-only`, but remain keyboard-operable and associated with visible labels.
- Focus styling is applied through `focus-within` on the label so keyboard users can see the active control.
- The hidden result-count paragraph uses `aria-live="polite"` and `aria-atomic="true"` so filter changes announce without interrupting current speech.

## Live-Region Text

The live region uses the selected status and `resultCount` to build one of these messages:

| Selected value | Example `resultCount` | Announcement |
|----------------|-----------------------|--------------|
| `All` | `2` | `Showing all 2 milestones` |
| `All` | `1` | `Showing all 1 milestone` |
| `Paid` | `1` | `Showing 1 paid milestone` |
| `Disputed` | `0` | `Showing 0 disputed milestones` |

Status-specific announcements lowercase the status name in the sentence.

## Testing Notes

The component test suite should cover:

- All status options render as radios.
- The `selected` option is checked.
- `onChange` receives the selected status.
- `Active` is available as a filter because it is part of the canonical milestone status type.
- The live-region text, `aria-live`, and `aria-atomic` attributes.
- A basic axe accessibility pass.
