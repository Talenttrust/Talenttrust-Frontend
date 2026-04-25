# EmptyState Component

The `EmptyState` component is a reusable UI element designed to provide clear guidance to users when a section or view has no data to display. It helps improve user experience by explaining the absence of content and optionally providing a call-to-action to guide the next steps.

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `icon` | `React.ReactNode` | No | An optional icon or graphic to visually represent the empty state. |
| `title` | `string` | Yes | A clear, concise heading describing the empty state. |
| `description` | `string` | Yes | Short explanatory text providing context and guidance. |
| `actionLabel` | `string` | No | The label for the optional call-to-action button. |
| `onAction` | `() => void` | No | The callback function executed when the action button is clicked. |

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

## Accessibility

The component is designed with accessibility in mind:

- Uses semantic HTML with a `role="region"` for screen readers.
- The title has an `id` and is referenced by `aria-labelledby`.
- The action button includes an `aria-label` for clarity.
- Icons are marked with `aria-hidden="true"` to avoid cluttering screen reader output.

## Styling

The component uses Tailwind CSS classes for consistent styling:

- Centered layout with flexbox.
- Responsive padding and text sizing.
- Blue-themed action button with hover states.
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
- Accessibility attributes.
- Button click functionality.

Integration tests ensure the component appears correctly in empty data scenarios across the implemented views.