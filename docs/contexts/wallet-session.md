# Wallet Session Management Guide

This guide documents the session lifecycle, persistence, and inactivity-based auto-disconnect safeguards managed by the [`WalletProvider`](file:///c:/Users/USER/Desktop/Talenttrust-Frontend/src/contexts/WalletContext.tsx#L31) within TalentTrust.

---

## Overview

The [`WalletProvider`](file:///c:/Users/USER/Desktop/Talenttrust-Frontend/src/contexts/WalletContext.tsx#L31) provides the global wallet connection state. To improve security on shared or public machines, it includes an optional idle auto-disconnect safeguard that monitors user activity and automatically logs out the user after a configurable period of inactivity.

---

## Configuration

The auto-disconnect feature is configured via the [`idleTimeout`](file:///c:/Users/USER/Desktop/Talenttrust-Frontend/src/contexts/WalletContext.tsx#L33) prop on the [`WalletProvider`](file:///c:/Users/USER/Desktop/Talenttrust-Frontend/src/contexts/WalletContext.tsx#L31).

| Prop | Type | Default | Description |
|---|---|---|---|
| [`idleTimeout`](file:///c:/Users/USER/Desktop/Talenttrust-Frontend/src/contexts/WalletContext.tsx#L33) | `number` | `0` (disabled) | The inactivity duration in milliseconds before the wallet is automatically disconnected. |

### Wiring the Provider

The provider is placed in the global layout structure (`src/app/layout.tsx`). Here is an example configuration setting the idle timeout to 15 minutes:

```tsx
import { WalletProvider } from '@/contexts/WalletContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // 15 minutes = 15 * 60 * 1000 = 900,000 ms
  return (
    <WalletProvider idleTimeout={900000}>
      {children}
    </WalletProvider>
  );
}
```

> [!NOTE]
> Setting [`idleTimeout`](file:///c:/Users/USER/Desktop/Talenttrust-Frontend/src/contexts/WalletContext.tsx#L33) to `0` or omitting it (so it defaults to `0` or `undefined`) completely disables the inactivity auto-disconnect safeguard.

---

## Session Persistence & Rehydration

To provide a seamless user experience across page reloads and navigations, the wallet session status is persisted in the browser.

### Storage Key
The wallet public address is saved under the storage key:
* `wallet_connected_address` (as defined in [`WalletContext.tsx`](file:///c:/Users/USER/Desktop/Talenttrust-Frontend/src/contexts/WalletContext.tsx#L52)).

### Rehydration Flow on Mount
1. **Client Check:** During server-side rendering (SSR), `window` is undefined, and the rehydration hook does not execute.
2. **Mount Event:** Once the component mounts on the client, a `useEffect` runs to rehydrate the wallet state.
3. **Retrieval:** The address is retrieved from storage using [`getItem`](file:///c:/Users/USER/Desktop/Talenttrust-Frontend/src/lib/safeStorage.ts) via the `safeStorage` helper.
4. **State Restoration:** If a valid address exists, the inner state of [`WalletProvider`](file:///c:/Users/USER/Desktop/Talenttrust-Frontend/src/contexts/WalletContext.tsx#L31) is restored, making the address globally accessible via [`useWallet`](file:///c:/Users/USER/Desktop/Talenttrust-Frontend/src/contexts/WalletContext.tsx#L147).

### Security Profile
* Only the public key (mocked or from the Stellar wallet extension) is saved to the storage.
* No private keys, seed phrases, or sensitive wallet data are ever accessed or persisted.
* Storage interactions are safely wrapped using `safeStorage` (in [`src/lib/safeStorage.ts`](file:///c:/Users/USER/Desktop/Talenttrust-Frontend/src/lib/safeStorage.ts)) to catch potential storage access exceptions in restricted browser environments.

