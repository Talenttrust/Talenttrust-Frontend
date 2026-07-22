# useCopyToClipboard

A custom, framework-pure React hook for copying text to the system clipboard. It encapsulates status management (reverting the "copied" state after a delay), SSR safety, error boundaries, and unmount cleanups.

## Location

`src/hooks/useCopyToClipboard.ts`

## Usage

```tsx
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

export function CopyButton({ textToCopy }: { textToCopy: string }) {
  const { copied, copy } = useCopyToClipboard({
    delay: 2000,
    onSuccess: () => {
      console.log('Successfully copied!');
    },
    onError: (err) => {
      console.error('Failed to copy', err);
    },
  });

  return (
    <button onClick={() => copy(textToCopy)}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}
```

## API Reference

### `useCopyToClipboard(options?)`

#### Options

The hook accepts an optional configuration object:

| Option | Type | Default | Description |
|---|---|---|---|
| `delay` | `number` | `2000` | The time (in milliseconds) before the `copied` state resets back to `false`. |
| `onSuccess` | `() => void` | `undefined` | Callback function triggered when a copy operation completes successfully. |
| `onError` | `(error: unknown) => void` | `undefined` | Callback function triggered when a copy operation fails (e.g., due to unsupported browser APIs or denied permissions). |

#### Returns

Returns an object with the following properties:

| Property | Type | Description |
|---|---|---|
| `copied` | `boolean` | `true` if text has been successfully copied and the delay timeout has not elapsed yet. |
| `copy` | `(text: string) => Promise<boolean>` | Async function to execute the copy action. Returns `true` on success and `false` on failure. |

## Resilience & Best Practices

1. **SSR Safety:** The hook guards against missing `window` or `navigator` objects, returning `false` safely on server renders.
2. **Clipboard API Guards:** Automatically checks for the presence of `navigator.clipboard` and `navigator.clipboard.writeText` to prevent runtime crashes in insecure contexts or old browsers.
3. **Timer Cleanup:**
   - Clears the internal timer when the hook/component unmounts to prevent memory leaks or updating states on unmounted components.
   - Clears and restarts the timer when multiple copy operations are triggered in rapid succession.
4. **Security & Privacy:** The hook itself does not log the copied text to any console or server. Error messages are bubbled up to the caller so they can show generic toasts without leaking sensitive data (e.g. wallet addresses) into developer consoles.

## Testing

Unit tests are defined in `src/hooks/__tests__/useCopyToClipboard.test.ts`. 

To run the unit tests:
```bash
npm test src/hooks/__tests__/useCopyToClipboard.test.ts
```
