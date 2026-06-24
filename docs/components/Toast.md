# Toast

Transient notification system for success and error feedback. Supports auto-dismiss, pause-on-interaction, screen reader announcements, density preferences, and quiet mode suppression.

## Location

`src/components/toast/toast-provider.tsx`

## Provider Architecture

```
<PreferencesProvider>
  <ToastProvider>
    {children}
    <ToastAnnouncer />    {/* screen-reader-only live regions */}
    <ToastViewport />      {/* visual toast stack, fixed top-right */}
  </ToastProvider>
</PreferencesProvider>
```

`ToastProvider` must be mounted as a child of `PreferencesProvider` because it reads `quietMode` and `toastDensity` from `usePreferences()`.

There is only one viewport. All active toasts stack vertically in a single column fixed to the top-right of the viewport.

## Exports

| Export | Kind | Description |
|---|---|---|
| `ToastProvider` | Component | Context provider; renders viewport and announcer |
| `useToast` | Hook | Returns `{ toasts, showSuccess, showError, dismissToast }` |

## Types (internal, not exported)

```ts
type ToastVariant = 'success' | 'error';

type ToastInput = {
  title: string;
  description?: string;
  duration?: number;    // defaults to 5000ms
};

type ToastRecord = ToastInput & {
  id: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toasts: ToastRecord[];
  showSuccess: (toast: ToastInput) => string;
  showError: (toast: ToastInput) => string;
  dismissToast: (id: string) => void;
};
```

## `useToast()` API

| Return value | Type | Description |
|---|---|---|
| `toasts` | `ToastRecord[]` | Array of currently visible toasts |
| `showSuccess(toast)` | `(input: ToastInput) => string` | Shows a success toast, returns its ID. Returns `'suppressed'` when quiet mode is active |
| `showError(toast)` | `(input: ToastInput) => string` | Shows an error toast, returns its ID. Not affected by quiet mode |
| `dismissToast(id)` | `(id: string) => void` | Programmatically dismisses a toast by its ID |

### ToastInput fields

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `title` | `string` | Yes | — | Bold heading displayed inside the toast panel |
| `description` | `string` | No | — | Secondary text below the title |
| `duration` | `number` | No | `5000` | Milliseconds before auto-dismiss. Passed to `window.setTimeout` |

## Return values

| Method | Normal return | Quiet mode return |
|---|---|---|
| `showSuccess` | Unique toast ID string (e.g. `"toast-550e8400-e29b-41d4-a716-446655440000"`) | `"suppressed"` (no toast created) |
| `showError` | Unique toast ID string | Always returns ID; quiet mode has no effect |

The returned ID can be passed to `dismissToast` to programmatically dismiss a toast. See [dismissToast example](#dismissing-a-toast-by-id).

## Quiet mode

When `UserPreferences.quietMode` is `true`:

- `showSuccess()` returns the string `'suppressed'` and does **not** create a toast
- `showError()` is **unaffected** — error toasts always display
- The `suppressed` return lets callers branch on suppression if needed

To set quiet mode, use `updatePreference('quietMode', true)` from `usePreferences()`.

## Density preference

`UserPreferences.toastDensity` controls the vertical gap between stacked toasts:

| Value | Gap class | Visual spacing |
|---|---|---|
| `'relaxed'` (default) | `gap-3` (12px) | Looser vertical spacing |
| `'compact'` | `gap-1.5` (6px) | Tighter vertical spacing |

Set via `updatePreference('toastDensity', 'compact')` from `usePreferences()`.

## Announcer roles

`ToastAnnouncer` renders two screen-reader-only `<div>` elements inside the provider:

| Region | `aria-live` | Content |
|---|---|---|
| Polite announcer | `polite` | Title + description of the **most recent** success toast |
| Assertive announcer | `assertive` | Title + description of the **most recent** error toast |

Both regions use `aria-atomic="true"`, so the entire text content is treated as one unit.

Only the **latest** toast of each variant is announced, not the entire stack.

## Accessibility behavior

| Element | Role / attribute | Rationale |
|---|---|---|
| Toast panel (error) | `role="alert"` | Announces immediately with host's alert sound |
| Toast panel (success) | `role="status"` | Announces when idle, no alert sound |
| Viewport container | `role="region"`, `aria-label="Notifications"`, `aria-atomic="false"` | Groups notifications as a landmark |
| Dismiss button | `aria-label="Dismiss {type} notification"` | Unique label per variant (success/error) |
| Descriptions | `text-[var(--muted-foreground)]` | Custom property passes WCAG AA 4.5:1 contrast in both themes |
| Accent bar | CSS custom properties via `--status-success-bg`/`--status-error-bg` | Theme-aware colors, not fixed Tailwind |

## Auto-dismiss behavior

- Every toast starts a `window.setTimeout` equal to `duration` (default `5000` ms).
- Timer **pauses** while the toast is hovered (`mouseenter`/`mouseleave`) or the dismiss button is focused (`focus`/`blur`).
- Stacked hover and focus events use a counter so the timer only resumes when **both** interactions end.
- If a toast is dismissed manually, its timer is cleaned up immediately.
- All timers are cleared when the `ToastProvider` unmounts.

## Examples

### Basic success toast

```tsx
'use client';
import { useToast } from '@/components/toast/toast-provider';

export function SignInForm() {
  const { showSuccess } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    showSuccess({ title: 'Form submitted successfully!' });
  };

  return <form onSubmit={handleSubmit}>{/* fields */}</form>;
}
```

### Success and error toasts with descriptions

```tsx
'use client';
import { useToast } from '@/components/toast/toast-provider';

export function ApproveReleaseButton() {
  const { showError, showSuccess } = useToast();

  const handleApprove = () => {
    showSuccess({
      title: 'Milestone released',
      description: 'Funds are on the way to the freelancer wallet.',
    });
  };

  const handleReject = () => {
    showError({
      title: 'Wallet not connected',
      description: 'Connect a wallet before approving this release.',
    });
  };

  return (
    <div>
      <button onClick={handleApprove}>Approve</button>
      <button onClick={handleReject}>Reject</button>
    </div>
  );
}
```

### Custom duration

```tsx
showSuccess({
  title: 'Quick notification',
  duration: 2000, // dismiss after 2 seconds
});
```

### Dismissing a toast by ID

```tsx
'use client';
import { useToast } from '@/components/toast/toast-provider';

export function DismissibleAction() {
  const { showSuccess, dismissToast } = useToast();

  const handleNotify = () => {
    const id = showSuccess({ title: 'Dismissible toast' });
    // Pass id to a close button or timeout
    setTimeout(() => dismissToast(id), 1000);
  };

  return <button onClick={handleNotify}>Notify</button>;
}
```

### Quiet-aware success call

```tsx
'use client';
import { useToast } from '@/components/toast/toast-provider';

export function SessionMonitor() {
  const { showSuccess } = useToast();

  const handleExpiry = () => {
    const result = showSuccess({
      title: 'Session expired',
      description: 'You have been disconnected due to inactivity.',
    });

    if (result === 'suppressed') {
      // Quiet mode is on — user will not see the toast
      console.log('Session expiry toast suppressed by user preference');
    }
  };

  // ...
}
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `useToast` throws "must be used within a ToastProvider" | Component is rendered outside `<ToastProvider>` |
| Success toasts are not appearing | `quietMode` is `true` in user preferences; `showSuccess` returns `'suppressed'` |
| Toasts dismiss immediately | `duration` is set too low (below ~500ms) |
| Toasts never dismiss | `duration` is set to a very large value; try manual dismissal via `dismissToast(id)` |
| Screen reader announces stale toast | Only the **latest** toast per variant is announced; dismiss stale toasts before showing new ones |
| ESLint warns about `preferences.quietMode` dependency | `showSuccess` already includes it in its dependency array; no action needed |
