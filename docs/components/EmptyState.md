# EmptyState Component

The `EmptyState` component gives users a clear next step when a page or section has no records to show. It is used by the placeholder pages for contracts, milestones, and reputation, and it supports both generic custom icons and named illustration variants for the most common onboarding states.

Use this component when the user has reached a valid page but there is no data yet. Do not use it for errors, loading states, permission failures, or `not-found` pages.

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `icon` | `React.ReactNode` | No | An optional icon or graphic to visually represent the empty state. |
| `illustration` | `'contracts' \| 'milestones' \| 'reputation'` | No | A named decorative illustration variant for common onboarding contexts. |
| `title` | `string` | Yes | A clear, concise heading describing the empty state. |
| `description` | `string` | Yes | Short explanatory text providing context and guidance. |
| `actionLabel` | `string` | No | The label for the optional call-to-action button. |
| `onAction` | `() => void` | No | The callback function executed when the action button is clicked. |
| `secondaryActionLabel` | `string` | No | The label for an optional secondary action. |
| `onSecondaryAction` | `() => void` | No | The callback function executed when the secondary action button is clicked. |

## Prop Behavior

- `title` and `description` are always rendered and should describe the empty state without implying an error.
- `illustration` selects one of the built-in SVG illustrations and its color treatment.
- `icon` allows a caller to pass a custom React node. If both `icon` and `illustration` are passed, the custom `icon` is rendered inside the variant wrapper.
- `actionLabel` only renders when `onAction` is also provided.
- `secondaryActionLabel` only renders when `onSecondaryAction` is also provided.
- Primary and secondary actions are grouped below the description and stack on small screens.

## Usage Examples

### Basic Empty State

```tsx
import EmptyState from '@/components/EmptyState';

<EmptyState
  title="No items found"
  description="There are no items to display at this time."
/>
```

### Empty State with Icon

```tsx
import EmptyState from '@/components/EmptyState';

<EmptyState
  icon={<SearchIcon className="w-16 h-16" />}
  title="No search results"
  description="Try adjusting your search criteria."
/>
```

### Empty State with Illustration Variant

```tsx
import EmptyState from '@/components/EmptyState';

<EmptyState
  illustration="contracts"
  title="No contracts found"
  description="Start by creating your first contract."
/>
```

### Empty State with Action

```tsx
import EmptyState from '@/components/EmptyState';

<EmptyState
  icon={<PlusIcon className="w-16 h-16" />}
  title="No contracts found"
  description="You haven't created any contracts yet. Start by creating your first contract."
  actionLabel="Create Contract"
  onAction={() => navigate('/contracts/new')}
/>
```

### Empty State with Secondary Action

```tsx
import EmptyState from '@/components/EmptyState';

<EmptyState
  illustration="milestones"
  title="No milestones tracked"
  description="Track delivery and escrow release points by adding milestones."
  actionLabel="Add Milestone"
  onAction={() => navigate('/milestones/new')}
  secondaryActionLabel="View Contracts"
  onSecondaryAction={() => navigate('/contracts')}
/>
```

## Illustration Variants

| Variant | Intended context | Visual treatment |
|---------|------------------|------------------|
| `contracts` | Empty contract list or first-contract onboarding. | Blue wrapper: `bg-blue-50 text-blue-700 ring-blue-100`. |
| `milestones` | Empty milestone tracker or contract setup guidance. | Emerald wrapper: `bg-emerald-50 text-emerald-700 ring-emerald-100`. |
| `reputation` | Empty reputation history before completed work. | Amber wrapper: `bg-amber-50 text-amber-700 ring-amber-100`. |

When no `illustration` is provided, a custom `icon` uses the neutral wrapper: `bg-slate-50 text-slate-500 ring-slate-200`.

## Current Usage

| Page | File | Variant | Action |
|------|------|---------|--------|
| Contracts | `src/app/contracts/page.tsx` | `contracts` | Primary action: `Create Contract`. |
| Milestones | `src/app/milestones/page.tsx` | `milestones` | Primary action: `Add Milestone`. |
| Reputation | `src/app/reputation/page.tsx` | `reputation` | No action yet; explanatory copy only. |

These pages follow the same pattern: render the page heading first, then show `EmptyState` only when the local collection is empty.

## Accessibility

The component is designed with accessibility in mind:

- Uses `role="region"` so screen reader users can navigate to the empty-state block as a named region.
- Calls React `useId()` to create a stable title id for each rendered instance.
- The title id is referenced by `aria-labelledby`, so the region name matches the visible heading.
- Action buttons include `aria-label` values for clarity.
- Decorative icons and illustration variants are marked with `aria-hidden="true"` to avoid cluttering screen reader output.
- Primary and secondary actions are native `button` elements, so they are reachable by keyboard and operable with `Enter` and `Space`.
- Focus states use visible high-contrast `focus-visible` outlines.
- Secondary actions use an outlined style so they are visually subordinate without being hidden from keyboard or screen reader users.

When writing copy, keep the `title` short and put detailed guidance in `description`. This keeps the region label useful in screen reader landmark lists.

## Styling

The component uses Tailwind CSS classes for consistent styling:

- Centered layout with flexbox.
- Responsive padding and text sizing.
- Primary action button with hover and focus states.
- Secondary outlined action button with hover and focus states.
- Variant illustration colors for contract, milestone, and reputation contexts.
- Gray color scheme for text to maintain readability.

## Contexts

This component is currently used in the following views:

- **Contracts View**: Prompts users to create their first contract.
- **Reputation Section**: Explains how reputation is earned through contract completion.
- **Milestones Tracker**: Guides users on adding milestones for progress tracking.

## Testing

The component includes comprehensive unit tests covering:

- Rendering of title and description.
- Conditional rendering of icon and action button.
- Secondary action rendering and callback behavior.
- Named illustration variants with decorative `aria-hidden` wrappers.
- Accessibility attributes.
- Button click functionality.

When adding or changing a variant, update tests for:

- The variant name and rendered SVG wrapper.
- The expected color class mapping.
- The `role="region"` and `aria-labelledby` relationship.
- Keyboard-reachable primary and secondary actions.

Integration tests ensure the component appears correctly in empty data scenarios across the implemented views.
