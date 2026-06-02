# EmptyState Component

The `EmptyState` component is a reusable UI element designed to provide clear guidance to users when a section or view has no data to display. It helps improve user experience by explaining the absence of content and optionally providing a call-to-action to guide the next steps.

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

| Variant | Intended context |
|---------|------------------|
| `contracts` | Empty contract list or first-contract onboarding. |
| `milestones` | Empty milestone tracker or contract setup guidance. |
| `reputation` | Empty reputation history before completed work. |

## Accessibility

The component is designed with accessibility in mind:

- Uses semantic HTML with a `role="region"` for screen readers.
- The title has an `id` and is referenced by `aria-labelledby`.
- Action buttons include `aria-label` values for clarity.
- Decorative icons and illustration variants are marked with `aria-hidden="true"` to avoid cluttering screen reader output.
- Primary and secondary actions are native `button` elements, so they are reachable by keyboard and operable with `Enter` and `Space`.
- Focus states use visible high-contrast `focus-visible` outlines.
- Secondary actions use an outlined style so they are visually subordinate without being hidden from keyboard or screen reader users.

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

Integration tests ensure the component appears correctly in empty data scenarios across the implemented views.
