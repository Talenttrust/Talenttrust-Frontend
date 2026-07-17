# WalletConnectButton

The `WalletConnectButton` component provides a unified control for users to connect and manage their crypto wallet session within the TalentTrust application.

## Location
`src/components/WalletConnectButton.tsx`

## Usage

```tsx
import { WalletConnectButton } from '@/components/WalletConnectButton';

export function Header() {
  return (
    <header>
      <WalletConnectButton />
    </header>
  );
}
```

## Features

- **Global State Integration:** Uses `useWallet` context to ensure the connection state is shared across the app, such as gating actions in `ActionPanel`.
- **Three rendered branches:**
  - **Disconnected / connecting:** Renders the primary "Connect Wallet" button and swaps to a disabled spinner state with "Connecting..." while `isConnecting` is true.
  - **Error:** Renders a "Connection Error" banner with a retry control labeled `Retry wallet connection`.
  - **Connected:** Renders the truncated wallet address plus icon-only controls for copy and disconnect, labeled `Copy address to clipboard` and `Disconnect wallet`.
- **Clipboard Copy (hardened):** See details in the section below.
- **Accessibility:** Fully accessible with ARIA labels, semantic HTML, and proper focus states. All interactive elements are keyboard operable.
- **Responsiveness:** Works across mobile and desktop viewpoints.

## Clipboard Copy Behaviour

The copy button uses the [Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard) (`navigator.clipboard.writeText`). The implementation is hardened against the following failure modes:

| Scenario | Behaviour |
|---|---|
| Successful write | Checkmark icon is shown; reverts to copy icon after 2 s. |
| `navigator.clipboard` is `undefined` (insecure context, old browser) | Error toast: "Copy not supported" — no checkmark shown. |
| `navigator.clipboard.writeText` is absent | Error toast: "Copy not supported" — no checkmark shown. |
| `writeText` promise rejects (e.g. permission denied) | Error toast: "Copy failed" — no checkmark shown. |

**Security note:** The wallet address is never written to `console.error`, `console.warn`, or any other log on failure. It is treated as sensitive user data.

Error notifications use the application's `showError` method from `useToast`. They appear as dismissible toasts in the top-right corner and are announced by a `role="alert"` live region for screen reader users.

## Dependencies

- `@/contexts/WalletContext` — provides `address`, `connect`, `disconnect`, `isConnecting`, `error`.
- `@/components/toast/toast-provider` — provides `useToast` / `showError` for clipboard failure notifications.
- `@/lib/truncateAddress` — derives the connected-state address pill text shown to the user.
- Inline SVGs for icons (no external icon library dependency).

## Testing

Tested with Jest and React Testing Library in `src/components/__tests__/WalletConnectButton.test.tsx`.

Coverage targets ≥ 95% for this module and includes the following scenarios:

- **Disconnected branch:** renders the connect button with the expected accessible name and calls `connect`.
- **Connecting branch:** disables the connect button and renders the loading spinner without leaking connected or error controls.
- **Error branch:** renders the retry control with the expected accessible name and calls `connect` again on retry.
- **Connected branch:** verifies the address display comes from `truncateAddress`, exposes the copy and disconnect controls, and calls `disconnect`.
- **Copy success flow:** mocks `navigator.clipboard.writeText`, verifies the full address is copied, swaps to the success icon, and resets back after 2 seconds with fake timers.
- **Accessibility:** runs `jest-axe` against the connected state via `src/test-utils/a11y.tsx` and expects zero violations.
