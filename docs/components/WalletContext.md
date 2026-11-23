# WalletProvider & WalletContext

TalentTrust provides two Freighter wallet context layers:

1. **Global App Wallet (`src/components/wallet/WalletProvider.tsx`)** — Mounted in `src/app/layout.tsx`, manages connection state, network verification against `expectedPassphrase()`, auto-reconnect (`tt.wallet.autoconnect`), and powers `WalletButton` and `NetworkGuard`.
2. **On-Chain Route WalletContext (`src/contexts/WalletContext.tsx`)** — Mounted on `/contracts/onchain/[id]` (`src/app/contracts/onchain/[id]/page.tsx`) to provide direct Freighter `connect`, `disconnect`, and `signTx` helpers for `OnChainEscrowActions`.

---

## 1. Global `WalletProvider` (`src/components/wallet/WalletProvider.tsx`)

### File Locations

- Provider & hooks: `src/components/wallet/WalletProvider.tsx`
- UI components: `src/components/wallet/WalletButton.tsx`, `src/components/wallet/NetworkGuard.tsx`
- Freighter helpers: `src/lib/stellar/freighterWallet.ts`, `src/lib/stellar/network.ts`
- Tests: `src/components/wallet/WalletProvider.test.tsx`, `src/components/wallet/WalletButton.test.tsx`, `src/components/wallet/NetworkGuard.test.tsx`

### State Machine (`WalletState`)

```ts
type WalletState =
  | { type: 'unavailable' }
  | { type: 'disconnected' }
  | { type: 'connecting' }
  | { type: 'connected'; address: string; passphrase: string }
  | { type: 'wrong-network'; address: string; passphrase: string }
  | { type: 'error'; message: string };
```

### Hooks

- `useWallet()` — Returns `{ state, connect, disconnect, refresh }`. Throws if called outside `<WalletProvider>`.
- `useOptionalWallet()` — Returns `{ state, connect, disconnect, refresh }` or `null` when outside `<WalletProvider>`.

---

## 2. On-Chain `WalletContext` (`src/contexts/WalletContext.tsx`)

### File Locations

- Context & hook: `src/contexts/WalletContext.tsx`
- Consumer: `src/components/onchain/OnChainEscrowActions.tsx`

### Interface (`WalletContextValue`)

```ts
export interface WalletContextValue {
  address: string | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  signTx: (xdr: string, networkPassphrase: string) => Promise<string>;
}
```

### Usage

```tsx
import { WalletProvider, useWallet } from '@/contexts/WalletContext';
```
