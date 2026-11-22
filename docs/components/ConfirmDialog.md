# ConfirmDialog & ConfirmProvider

`ConfirmDialog` (`src/components/ui/ConfirmDialog.tsx`) is the shared confirmation modal used for destructive or high-consequence actions in TalentTrust (such as cancelling a funded escrow). `ConfirmProvider` (`src/components/ui/ConfirmProvider.tsx`) wraps the application and exposes the promise-based `useConfirm()` hook.

## File Locations

- Dialog component: `src/components/ui/ConfirmDialog.tsx`
- Context provider & hook: `src/components/ui/ConfirmProvider.tsx`
- Tests: `src/components/ui/__tests__/ConfirmDialog.test.tsx`

## `ConfirmDialogProps`

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `open` | `boolean` | Yes | — | Controls whether the native `<dialog>` is open (`showModal()`). |
| `title` | `string` | Yes | — | Dialog heading rendered in `<h2>` and linked via `aria-labelledby`. |
| `description` | `ReactNode` | No | — | Explanatory body content linked via `aria-describedby`. |
| `confirmLabel` | `string` | No | `'Confirm'` | Label for the confirm button. |
| `cancelLabel` | `string` | No | `'Cancel'` | Label for the cancel button. |
| `tone` | `'danger' \| 'default'` | No | `'default'` | Applies `confirm-danger` / `btn-danger` styling and focuses Cancel first when `'danger'`. |
| `requireText` | `string` | No | — | When set, renders a text input requiring the user to type the exact string before the confirm button is enabled. |
| `onConfirm` | `() => void` | Yes | — | Callback fired when the confirm button is clicked. |
| `onCancel` | `() => void` | Yes | — | Callback fired on Cancel click, `Escape` key, native dialog cancel, or backdrop click. |

## `ConfirmProvider` & `useConfirm()`

`ConfirmProvider` is mounted in `src/app/layout.tsx`. Calling `useConfirm()` returns a `ConfirmFn`:

```ts
export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  requireText?: string;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
```

When rendered outside a `ConfirmProvider` (such as in isolated unit tests), `useConfirm()` falls back to `window.confirm(options.title)`.

### Usage Example

```tsx
import { useConfirm } from '@/components/ui/ConfirmProvider';

export function CancelEscrowButton({ id, held, token, onCancel }: {
  id: number;
  held: number;
  token: string;
  onCancel: () => void;
}) {
  const confirm = useConfirm();

  const handleClick = async () => {
    const confirmed = await confirm({
      title: `Cancel escrow #${id}?`,
      description: `Refund ${held} ${token} to the client. This cannot be undone.`,
      tone: 'danger',
      confirmLabel: 'Cancel escrow',
      cancelLabel: 'Keep escrow',
      requireText: held > 0 ? String(id) : undefined,
    });
    if (confirmed) onCancel();
  };

  return <button onClick={handleClick}>Cancel</button>;
}
```

## Accessibility & Focus Management

- Uses a native `<dialog>` element opened with `dialog.showModal()`.
- When `tone === 'danger'`, initial focus lands on the **Cancel** button; otherwise it lands on the **Confirm** button.
- `ConfirmProvider` records `document.activeElement` before opening the dialog and restores focus to that element when the promise resolves.
- Locks `document.body.style.overflow = 'hidden'` while open and restores it on close.
