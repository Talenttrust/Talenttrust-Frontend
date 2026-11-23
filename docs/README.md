# TalentTrust Frontend — Documentation Index

Reference documentation for components, hooks, library modules, and guides in `src/`.

---

## Components

| Document | Source in `src/` | What it covers |
|----------|------------------|----------------|
| [AddressInput.md](./components/AddressInput.md) | `src/components/forms/AddressInput.tsx` | Stellar `G...` / `C...` address input with StrKey validation, clipboard paste, and wallet autofill |
| [CommandPalette.md](./components/CommandPalette.md) | `src/components/palette/CommandPalette.tsx` | `Cmd+K` / `Ctrl+K` route, escrow ID, address, and quick-action command palette |
| [ConfirmDialog.md](./components/ConfirmDialog.md) | `src/components/ui/ConfirmDialog.tsx`, `src/components/ui/ConfirmProvider.tsx` | Accessible `<dialog>` confirmation modal and `useConfirm()` hook |
| [EscrowDashboard.md](./components/EscrowDashboard.md) | `src/components/EscrowDashboard.tsx`, `src/components/escrow/*` | Escrow dashboard, `EscrowCard`, `EscrowToolbar`, `ViewFilterControl`, `Pagination`, and dispute dialogs |
| [ExportMenu.md](./components/ExportMenu.md) | `src/components/escrow/ExportMenu.tsx` | Escrows and milestones CSV export menu with keyboard navigation |
| [Header.md](./components/Header.md) | `src/components/Header.tsx` | Global navigation bar, desktop controls, and collapsible mobile menu |
| [MilestoneBuilder.md](./components/MilestoneBuilder.md) | `src/components/MilestoneBuilder.tsx`, `src/components/milestones/MilestoneTimeline.tsx` | Structured milestone form builder and escrow card milestone timeline |
| [NotFound.md](./components/NotFound.md) | `src/app/not-found.tsx` | App Router 404 fallback page |
| [NotificationBell.md](./components/NotificationBell.md) | `src/components/NotificationBell.tsx`, `src/components/NotificationsProvider.tsx`, `src/components/WatchToggle.tsx` | Watchlist notification bell popover, unread badge, and `NotificationsProvider` context |
| [ReputationLookup.md](./components/ReputationLookup.md) | `src/components/ReputationLookup.tsx`, `src/components/reputation/StarRating.tsx` | On-chain and API freelancer reputation lookup and 1–5 star rating widget |
| [Toast.md](./components/Toast.md) | `src/components/toast/ToastProvider.tsx` | Toast notification provider, `useToast`, and `useOptionalToast` |
| [WalletButton.md](./components/WalletButton.md) | `src/components/wallet/WalletButton.tsx`, `src/components/wallet/NetworkGuard.tsx` | Header Freighter wallet menu button and wrong-network banner |
| [WalletContext.md](./components/WalletContext.md) | `src/components/wallet/WalletProvider.tsx`, `src/contexts/WalletContext.tsx` | Global `WalletProvider` state machine and on-chain `WalletContext` |

---

## Hooks

| Document | Source in `src/` | What it covers |
|----------|------------------|----------------|
| [useContracts.md](./hooks/useContracts.md) | `src/hooks/useContracts.ts`, `src/hooks/useEscrowMutation.ts` | SWR hooks (`useContracts`, `useContract`, `useReputation`) and `useEscrowMutation` |
| [useUIHooks.md](./hooks/useUIHooks.md) | `src/hooks/useDisclosure.ts`, `src/hooks/useHotkeys.ts`, `src/hooks/useOnlineStatus.ts`, `src/hooks/useTheme.ts` | Disclosure state, dashboard keyboard shortcuts, online status detection, and theme persistence |

---

## Library

| Document | Source in `src/` | What it covers |
|----------|------------------|----------------|
| [apiAndNetworking.md](./lib/apiAndNetworking.md) | `src/lib/api.ts`, `src/lib/swr.tsx`, `src/lib/commands.ts`, `src/lib/status.ts`, `src/lib/swRouting.ts`, `src/lib/site.ts` | REST client, SWR provider, command palette ranking, system status checks, and service worker routing |
| [contractQueryAndExport.md](./lib/contractQueryAndExport.md) | `src/lib/contractQuery.ts`, `src/lib/csv.ts`, `src/lib/exportContracts.ts`, `src/lib/optimistic.ts`, `src/lib/statement.ts` | Escrow filtering/sorting/pagination, CSV formula sanitization and export, optimistic reducers, and statement ledger |
| [notificationsAndWatchlist.md](./lib/notificationsAndWatchlist.md) | `src/lib/watchlist.ts`, `src/lib/notifications.ts`, `src/lib/poller.ts` | Watchlist snapshot diffing, `localStorage` notification store, and background poller |

---

## Guides

| Document | What it covers |
|----------|----------------|
| [COPYWRITING_GUIDE.md](./COPYWRITING_GUIDE.md) | Voice, tone, and user-facing copy standards |
| [keyboard.md](./keyboard.md) | Global and component keyboard shortcuts, dialog focus management, and live regions |
| [stellar-address.md](./stellar-address.md) | Stellar StrKey validation and normalization (`src/lib/stellar/address.ts`) |
| [statement-exports.md](./statement-exports.md) | Statement CSV/JSON downloads, ledger reconciliation, and mismatch warnings |
