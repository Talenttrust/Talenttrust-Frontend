# MilestoneCreationForm Component

## Overview

`MilestoneCreationForm` renders the modal used by the milestones page to collect and validate a new milestone before the parent persists it.

## Location

`src/components/milestones/MilestoneCreationForm.tsx`

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `onSubmit` | `(milestone: Milestone) => void` | Yes | Called after the form passes validation. Receives the complete milestone object, including the generated `id`. |
| `onCancel` | `() => void` | Yes | Called when the user chooses Cancel. The component does not clear storage, save a draft, or close itself; the parent owns that behavior. |

## Fields

| Field | Initial value | Required | Submitted value |
|-------|---------------|----------|-----------------|
| Title | Empty string | Yes | Trimmed string assigned to `milestone.title`. |
| Payout Amount | Empty string | Yes | Parsed with `parseFloat` and assigned to `milestone.payout`. |
| Currency | `USD` | Yes | Trimmed string assigned to `milestone.currency`. Options are `USD`, `EUR`, `GBP`, and `XLM`. |
| Status | `Pending` | No | One of `Pending`, `Active`, `Completed`, `Paid`, or `Disputed`. |
| Due Date | Empty string | No | Trimmed string assigned to `milestone.dueDate`; blank values become `undefined`. |

## Validation Rules

- Title must contain non-whitespace text.
- Payout Amount must contain a value.
- Payout Amount must parse to a positive number greater than `0`.
- Currency must contain non-whitespace text.
- Status and Due Date do not block submission.

Validation runs on submit only. Invalid submissions update the shared `ErrorSummary`, keep the form open, and do not call `onSubmit`.

## Generated Milestone ID

On successful submit, the component builds `milestone.id` from the title slug plus the current timestamp:

1. Trim the title.
2. Lowercase it.
3. Replace every run of non-alphanumeric characters with `-`.
4. Remove leading and trailing `-` characters.
5. Append `-${Date.now()}`.

For example, `Frontend Development - Sprint 1` becomes an id shaped like `frontend-development-sprint-1-1784635200000`. The timestamp suffix prevents duplicate titles from colliding during a session.

## Accessibility

- The modal root uses `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="create-milestone-title"`.
- `ErrorSummary` exposes validation failures through `role="alert"` and links each error back to its field id.
- `FormField` applies required markers, `aria-invalid`, `aria-describedby`, and error styling for invalid fields.
- All controls are native form inputs, selects, or buttons, so keyboard operation follows browser defaults.
- The Cancel button is `type="button"` so it never submits the form.

## Parent Contract

The form only reports user intent. The parent component should:

- Render or unmount the modal based on local state.
- Persist the submitted milestone inside `onSubmit`.
- Refresh any milestone list from the source of truth after persistence.
- Close the modal in `onSubmit` or `onCancel` when appropriate.

The milestones page follows this pattern by calling `saveMilestone(milestone)`, re-reading `listMilestones()`, and then hiding the form.

## Usage Example

```tsx
import { MilestoneCreationForm } from '@/components/milestones/MilestoneCreationForm';
import { listMilestones, saveMilestone } from '@/lib/repository';

function MilestonesPage() {
  const [showForm, setShowForm] = useState(false);
  const [milestones, setMilestones] = useState(() => listMilestones());

  return (
    <>
      <button type="button" onClick={() => setShowForm(true)}>
        Add Milestone
      </button>

      {showForm && (
        <MilestoneCreationForm
          onSubmit={(milestone) => {
            saveMilestone(milestone);
            setMilestones(listMilestones());
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </>
  );
}
```

## Testing Notes

When adding or changing behavior, cover:

- Required title, payout, and currency validation.
- Positive numeric payout validation.
- Successful submission payload shape, including trimmed strings and optional due date handling.
- The slug-plus-timestamp id shape. Mock `Date.now()` for deterministic assertions.
- The `onCancel` contract.
- Dialog and error-summary accessibility attributes.
