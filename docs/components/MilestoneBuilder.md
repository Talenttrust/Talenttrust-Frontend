# MilestoneBuilder & MilestoneTimeline

Components for authoring milestones during escrow creation and displaying milestone release status on escrow cards.

## File Locations

- Creation form builder: `src/components/MilestoneBuilder.tsx`
- Builder tests: `src/components/__tests__/MilestoneBuilder.test.tsx`
- Card timeline: `src/components/milestones/MilestoneTimeline.tsx`
- Milestone state derivation: `src/components/milestones/milestoneState.ts`
- Timeline tests: `src/components/milestones/MilestoneTimeline.test.tsx`, `src/components/milestones/milestoneState.test.ts`

## `MilestoneBuilder` (`src/components/MilestoneBuilder.tsx`)

Controlled fieldset for adding, editing, reordering (`Up` / `Down`), and removing milestone rows (`title` + `amount`) with integer-stroop arithmetic (`toStroops`, `formatStroops`, `totalStroops`) and validation (`validateMilestones`).

### Props (`MilestoneBuilderProps`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `milestones` | `MilestoneInput[]` | Yes | — | Controlled array of `{ id, title, amount }` rows |
| `onChange` | `(milestones: MilestoneInput[]) => void` | Yes | — | Callback when rows are edited, added, removed, or moved |
| `currencySymbol` | `string` | No | `'XLM'` | Token symbol shown in labels and live total |
| `errors` | `MilestoneValidation \| null` | No | — | Per-row and form-level validation errors |

### Constants & Helpers

- `MAX_MILESTONE_TITLE_LENGTH = 80`
- `MAX_MILESTONES = 20`
- `MAX_AMOUNT_DECIMALS = 7`
- `newMilestone(title?, amount?)`, `validateMilestones(rows)`, `toStroops(amount)`, `formatStroops(stroops)`, `totalStroops(rows)`

## `MilestoneTimeline` (`src/components/milestones/MilestoneTimeline.tsx`)

Renders an ordered list (`<ol aria-label="Milestone timeline">`) of milestones for an `EscrowContract`, deriving each milestone's status via `milestoneState(contract, index)` (`'released' | 'releasable' | 'awaiting-funds' | 'locked'`).

### Props (`MilestoneTimelineProps`)

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `contract` | `EscrowContract` | Yes | — | Contract containing milestones and funding amounts |
| `onRelease` | `(index: number) => void` | Yes | — | Triggered when clicking the release button on a `'releasable'` milestone |
| `busy` | `boolean` | No | `false` | Disables release buttons while a mutation is in flight |
| `showSummary` | `boolean` | No | `true` | Shows or hides the cumulative released progress summary bar |
