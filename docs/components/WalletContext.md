# WalletContext

`src/contexts/WalletContext.tsx`

Provides global Stellar wallet connection state to the entire application via
React Context. Consumed through the `useWallet` hook; the raw context object
is not exported for direct use.

---

## Provider: `WalletProvider`

```tsx
<WalletProvider idleTimeout={300_000}>
  {children}
</WalletProvider>
```

### Props

| Prop          | Type     | Default | Description                                                                                                      |
|---------------|----------|---------|------------------------------------------------------------------------------------------------------------------|
| `children`    | `ReactNode` | —    | React subtree that requires wallet context.                                                                      |
| `idleTimeout` | `number` | `0`     | Inactivity duration in milliseconds before the session is automatically terminated. `0` disables the behaviour. |

### Placement in `src/app/layout.tsx`

`WalletProvider` is rendered at the root layout level, inside `ToastProvider`
and `PreferencesProvider`, so every page and component in the application can
access wallet state without prop-drilling:

```
RootLayout
└── PreferencesProvider
    └── ToastProvider
        └── WalletProvider   ← global wallet state
            └── {children}   ← all app pages and components
```

### Idle auto-disconnect

When `idleTimeout > 0`, the provider attaches passive event listeners for
`pointermove`, `keydown`, `visibilitychange`, `mousedown`, and `touchstart`.
If none of these events fires within `idleTimeout` milliseconds, `disconnect()`
is called automatically and a "Session expired" toast is displayed. The timer
resets on each activity event and is fully cleaned up when the component
unmounts.

---

## Hook: `useWallet`

```tsx
const { address, isConnecting, error, connect, disconnect } = useWallet();
```

Returns the current `WalletContextType` value. Must be called inside a
`<WalletProvider>` subtree.

### Safety guard

If `useWallet` is called outside of a `<WalletProvider>`, it throws
immediately:

```
Error: useWallet must be used within a WalletProvider
```

This makes misconfigured component trees fail fast and visibly during
development rather than silently returning `undefined`.

---

## `WalletContextType` API reference

### `address`

```ts
address: string | null
```

The connected Stellar public key (G-address), or `null` when no wallet is
connected. Rehydrated from `localStorage` (`wallet_connected_address`) on
client mount, so the session survives page refreshes without requiring a fresh
`connect()` call.

**Example value:** `"GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H"`

---

### `isConnecting`

```ts
isConnecting: boolean
```

`true` while a connection attempt is in progress — from the moment `connect()`
is called until it either succeeds or fails. Use this to disable the connect
button and show a loading indicator in the UI.

---

### `error`

```ts
error: string | null
```

Human-readable error message from the most recent failed `connect()` attempt,
or `null` when no error is present. Cleared automatically at the start of each
new `connect()` call.

When a connection failure occurs, the provider does **two** things:

1. **Sets `error`** – so consuming components (e.g. `WalletConnectButton`) can
   render an inline message next to the button.
2. **Calls `showError` from `ToastProvider`** – so screen-reader users receive
   an assertive `role="alert"` announcement via the `aria-live="assertive"`
   region without relying on the inline element being visible or focused.

This dual approach avoids duplicate announcements: the toast is the single
source of truth for assistive-technology notifications, while the inline `error`
field handles visual/interactive presentation at the component level.

Known values (exported as named constants from `WalletContext.tsx`):

| Constant                  | Value                                                                           | Cause                                        |
|---------------------------|---------------------------------------------------------------------------------|----------------------------------------------|
| `FREIGHTER_NOT_INSTALLED` | `"Freighter wallet is not installed…"`                                          | Browser extension not detected.              |
| `USER_REJECTED`           | `"User rejected the connection request."`                                       | User dismissed the Freighter approval popup. |

---

### `connect`

```ts
connect: () => Promise<void>
```

Initiates a wallet connection attempt. Sets `isConnecting` to `true` for the
duration and resets it in the `finally` block regardless of outcome. The
returned `Promise` always resolves; errors are surfaced through the `error`
field **and via an accessible error toast** (`showError`) rather than via rejection.

On failure the provider:
- Sets `error` to `'Failed to connect wallet'` for inline display.
- Calls `showError({ title: 'Wallet connection failed', description: '...' })`
  so screen readers receive an assertive `role="alert"` announcement.

> ⚠️ **Temporary mock — real Freighter integration pending.**
>
> The current implementation does **not** contact any wallet extension. It:
>
> 1. Waits **1 second** via `setTimeout` to simulate latency.
> 2. Sets `address` to the hard-coded constant `MOCKED_STELLAR_ADDRESS`
>    (`"GAAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQCAIBAEAQDZ7H"`).
> 3. Persists that address in `localStorage`.
>
> This mock exists solely to unblock UI development. It must be replaced
> with the real Freighter browser-extension flow before any production or
> testnet deployment. The intended real implementation will:
>
> 1. Guard against server-side rendering (`typeof window === 'undefined'`).
> 2. Detect `window.freighter`; surface `FREIGHTER_NOT_INSTALLED` if absent.
> 3. Call `window.freighter.requestAccess()`; map a user rejection to
>    `USER_REJECTED`.
> 4. Validate and persist the returned Stellar public key.

---

### `disconnect`

```ts
disconnect: () => void
```

Terminates the active wallet session synchronously:

1. Sets `address` to `null`.
2. Removes `wallet_connected_address` from `localStorage`.
3. Cancels any running inactivity-timeout timer.

---

## Named exports

| Export                    | Kind       | Description                                               |
|---------------------------|------------|-----------------------------------------------------------|
| `WalletProvider`          | Component  | Context provider — place at the root of the app.         |
| `useWallet`               | Hook       | Primary consumer API; throws outside `WalletProvider`.   |
| `WalletContextType`       | TypeScript type | Shape of the context value.                        |
| `MOCKED_STELLAR_ADDRESS`  | Constant   | Hard-coded G-address used by the mock `connect()`.       |
| `FREIGHTER_NOT_INSTALLED` | Constant   | Error string: extension not detected.                    |
| `USER_REJECTED`           | Constant   | Error string: user dismissed the approval prompt.        |

---

## Usage example

```tsx
'use client';

import { useWallet } from '@/contexts/WalletContext';

export default function ConnectButton() {
  const { address, isConnecting, error, connect, disconnect } = useWallet();

  if (address) {
    return (
      <button onClick={disconnect}>
        Disconnect ({address.slice(0, 6)}…)
      </button>
    );
  }

  return (
    <>
      <button onClick={connect} disabled={isConnecting}>
        {isConnecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
```

---

## Related files

| File                                    | Role                                                         |
|-----------------------------------------|--------------------------------------------------------------|
| `src/app/layout.tsx`                    | Mounts `WalletProvider` at the application root.            |
| `src/components/WalletConnectButton.tsx`| Primary UI consumer of `useWallet`.                         |
| `src/lib/safeStorage.ts`                | `getItem` / `setItem` / `removeItem` wrappers used for address persistence. |
| `docs/components/WalletConnectButton.md`| UI component documentation for the connect button.          |
