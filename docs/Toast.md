# Toast System API

The toast system provides global, non-modal notifications for transient events like success confirmations or errors. It is composed of a `ToastProvider`, a `useToast` hook for triggering notifications, and several internal components that handle rendering and accessibility.

The provider is located at `src/components/toast/toast-provider.tsx`.

## Provider Setup

The `ToastProvider` is a context provider that must be mounted near the root of the application tree, inside the `<PreferencesProvider>`. In `src/app/layout.tsx`:

```tsx
<PreferencesProvider>
  <ToastProvider>
    {children}
  </ToastProvider>
</PreferencesProvider>
```

## API Reference

### `useToast()` Hook

The `useToast` hook provides access to the toast context from any client component rendered inside `ToastProvider`.

**Return Value**

| Method | Type | Description |
|---|---|---|
| `showSuccess(toast)` | `(toast: ToastInput) => string` | Displays a success toast. Returns a unique ID, or `'suppressed'` in Quiet Mode. |
| `showError(toast)` | `(toast: ToastInput) => string` | Displays an error toast. Returns a unique ID. |
| `dismissToast(id)` | `(id: string) => void` | Manually dismisses a toast by its ID. |
| `toasts` | `ToastRecord[]` | An array of the currently visible toast objects. |

### `ToastInput` Type

Used by both `showSuccess()` and `showError()`:

| Prop | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | Yes | The main heading for the toast. |
| `description` | `string` | No | Additional explanatory text. |
| `duration` | `number` | No | Auto-dismiss delay in milliseconds. Overrides the user's preference. |
| `action` | `ToastAction` | No | An optional action button. |

### `ToastAction` Type

| Prop | Type | Required | Description |
|---|---|---|---|
| `label` | `string` | Yes | The text label for the action button. |
| `onClick` | `() => void` | Yes | Callback fired when the button is clicked. Toast dismisses immediately after. |

## Features

### Quiet Mode

When the user preference `quietMode` is `true`, `showSuccess()` calls are suppressed. The function returns the string `'suppressed'` and no toast is shown. This allows users to opt out of non-critical notifications.

`showError()` calls are **not** affected by Quiet Mode and will always display a toast.

### Duration Control

The auto-dismiss duration is determined in the following order of precedence:

1. **Per-call `duration`**: Duration passed directly in the `ToastInput` object (takes priority)
2. **User Preference**: Uses `toastDuration` from `usePreferences()`:
   - `'short'`: 2500 ms
   - `'normal'`: 5000 ms (default)
   - `'long'`: 10000 ms
   - `'persistent'`: No auto-dismiss

### Density Control

Vertical spacing between stacked toasts is controlled by `toastDensity` preference:
- **`'relaxed'`** (default): `gap-3` (12px)
- **`'compact'`**: `gap-1.5` (6px)

### Toast Eviction

A maximum of **4** toasts are visible at once. If a fifth toast is created, the oldest (top-most) toast is automatically dismissed.

### Pause on Hover/Focus

Auto-dismiss timers are automatically paused when a toast is hovered or receives keyboard focus. The timer resumes when the interaction ends.

## Accessibility

### `ToastViewport`

The visible container has `role="region"` and `aria-label="Notifications"`. Individual toasts have roles based on their variant:

- **Success Toasts**: `role="status"` for polite announcements
- **Error Toasts**: `role="alert"` for assertive, immediate announcements

### `ToastAnnouncer`

`ToastProvider` renders a `ToastAnnouncer` with two visually hidden `aria-live` regions:

- **`aria-live="polite"`**: Announces the most recent **success** toast (non-interrupting)
- **`aria-live="assertive"`**: Announces the most recent **error** toast (interrupting for urgency)

This dual-region approach provides robust fallback for assistive technologies.

## Usage Example

```tsx
'use client';

import { useToast } from '@/components/toast/toast-provider';
import { Button } from '@/components/ui/button';

function MyComponent() {
  const { showSuccess, showError } = useToast();

  const handleSuccess = () => {
    showSuccess({
      title: 'Profile Updated',
      description: 'Your changes have been saved successfully.',
    });
  };

  const handleError = () => {
    showError({
      title: 'Connection Lost',
      description: 'Please check your network and try again.',
      action: {
        label: 'Retry',
        onClick: () => console.log('Retrying...'),
      },
    });
  };

  return (
    <div className="flex gap-2">
      <Button onClick={handleSuccess}>Show Success</Button>
      <Button variant="destructive" onClick={handleError}>
        Show Error
      </Button>
    </div>
  );
}
```

## Best Practices

1. **Use clear, actionable titles**: Messages should be understandable in 2-3 seconds
2. **Provide context in descriptions**: Explain what happened and why
3. **Avoid success toasts for obvious actions**: Not every click needs confirmation
4. **Use error toasts liberally**: Users need to know when something fails
5. **Keep actions simple**: A single action per error toast is clearer than multiple options
6. **Test with keyboard navigation**: Ensure toasts are accessible without a mouse
