# ToastProvider

Transient toast notification system for `success`, `error`, and `info` feedback. Supports auto-dismiss, duplicate deduplication, pause-on-hover/focus, Escape-to-dismiss, optional action buttons, and screen-reader live regions.

## File Locations

- Component & hooks: `src/components/toast/ToastProvider.tsx`
- Tests: `src/components/toast/ToastProvider.test.tsx`
- Mounting point: `src/app/layout.tsx`

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `ToastProvider` | Component | Context provider rendering the `.toast-region` stack |
| `useToast` | Hook | Returns `ToastApi`; throws if used outside `<ToastProvider>` |
| `useOptionalToast` | Hook | Returns `ToastApi`, or a no-op fallback when outside `<ToastProvider>` |
| `TOAST_DURATION_MS` | Constant | Default duration for `success` and `info` toasts (`5000` ms) |
| `ERROR_TOAST_DURATION_MS` | Constant | Default duration for `error` toasts (`8000` ms) |
| `MAX_VISIBLE_TOASTS` | Constant | Maximum visible toasts in the stack (`3`) |

## Types

```ts
export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
}

export interface ToastApi {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
  dismiss: (id?: number) => void;
}
```

## Usage

```tsx
'use client';

import { useOptionalToast } from '@/components/toast/ToastProvider';

export function FundButton({ id }: { id: number }) {
  const toast = useOptionalToast();

  return (
    <button
      type="button"
      onClick={() =>
        toast.success(`Escrow #${id} funded`, {
          action: { label: 'View escrow', onClick: () => {} },
        })
      }
    >
      Fund
    </button>
  );
}
```

## Behavior & Accessibility

- **Live regions**: Non-error toasts render inside `<div className="toast-stack" role="status" aria-live="polite">`; error toasts render inside `<div className="toast-stack" role="alert" aria-live="assertive">`.
- **Deduplication**: Pushing a toast with the same `variant` and `message` as the most recent toast refreshes its expiry timer in place rather than stacking a duplicate.
- **Queue cap**: At most `MAX_VISIBLE_TOASTS` (`3`) toasts are kept; older toasts are dropped when new ones arrive.
- **Pause on interaction**: Hovering or focusing inside `.toast-region` pauses expiration timers (`data-paused` attribute).
- **Mobile overlap avoidance**: On narrow viewports (`<= 480px`), `.toast-region` toggles `toast-region--raised` if a focused input would be covered by the toast region.
