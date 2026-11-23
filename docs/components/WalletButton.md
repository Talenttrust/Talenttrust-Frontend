# WalletButton & NetworkGuard

Header wallet connection control and wrong-network warning banner powered by `WalletProvider` (`src/components/wallet/WalletProvider.tsx`).

## File Locations

- Wallet menu button: `src/components/wallet/WalletButton.tsx`
- Network guard banner & hook: `src/components/wallet/NetworkGuard.tsx`
- Wallet provider: `src/components/wallet/WalletProvider.tsx`
- Tests: `src/components/wallet/WalletButton.test.tsx`, `src/components/wallet/NetworkGuard.test.tsx`

## `WalletButton` (`src/components/wallet/WalletButton.tsx`)

`WalletButton` accepts no props and renders `null` when mounted outside a `<WalletProvider>`. Inside a provider, its UI adapts to `state.type`:

- `'unavailable'` — Renders an external link (`https://freighter.app`) labeled **Install Freighter**.
- `'disconnected'` / `'error'` — Renders a **Connect wallet** button that calls `connect()`.
- `'connecting'` — Renders a disabled **Connecting…** button.
- `'connected'` / `'wrong-network'` — Renders a button showing the truncated address (`GABCDE...1234`) that toggles a `role="menu"` dropdown with:
  - **Copy address** (copies full address to clipboard)
  - **View on stellar.expert** (links to account explorer for `site.network`)
  - **Disconnect** (clears session and removes `tt.wallet.autoconnect`)

## `NetworkGuard` & `useRequireNetwork` (`src/components/wallet/NetworkGuard.tsx`)

- `NetworkGuard` — Renders an `alert-error` banner when `state.type === 'wrong-network'`, informing the user which Stellar network Freighter is currently on and which network TalentTrust requires.
- `useRequireNetwork()` — Returns `true` when `state.type` is `'connected'` or `'connecting'`, and `false` otherwise.
