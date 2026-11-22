# EscrowDashboard & Escrow Components

`EscrowDashboard` (`src/components/EscrowDashboard.tsx`) is the primary interactive view on `/contracts`. It pairs an escrow creation form (Demo API or On-chain testnet via Freighter) with a filterable, sortable, paginated list of escrow cards supporting optimistic funding and milestone releases.

## File Locations

- Dashboard container: `src/components/EscrowDashboard.tsx`
- Escrow card: `src/components/escrow/EscrowCard.tsx`
- Filter & sort toolbar: `src/components/escrow/EscrowToolbar.tsx`
- CSV export menu: `src/components/escrow/ExportMenu.tsx`
- On-chain creation form: `src/components/escrow/OnchainCreateForm.tsx`
- Pagination control: `src/components/escrow/Pagination.tsx`
- Role view filter: `src/components/ViewFilterControl.tsx`
- Role badge: `src/components/RoleChip.tsx`
- Watchlist toggle: `src/components/WatchToggle.tsx`
- Keyboard shortcuts modal: `src/components/ShortcutsDialog.tsx`
- Dispute modal & arbiter split form: `src/components/disputes/DisputeDialog.tsx`, `src/components/disputes/ResolveDisputeForm.tsx`
- Star rating widget: `src/components/reputation/StarRating.tsx`
- Tests: `src/components/EscrowDashboard.test.tsx`, `src/components/__tests__/EscrowCard.test.tsx`, `src/components/__tests__/EscrowDashboard*.test.tsx`

## Subcomponents

### `EscrowCard` (`src/components/escrow/EscrowCard.tsx`)

Renders an individual `EscrowContract` with progress bar, `MilestoneTimeline`, status badge, and context-sensitive action buttons (`Fund`, `Release next`, `Dispute`, `Cancel`, `Resolve 50/50`, `Statement`, and rating controls).

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `contract` | `EscrowContract` | Yes | Contract record to display |
| `busy` | `boolean` | No | Marks the card `aria-busy` and disables action buttons |
| `optimistic` | `boolean` | No | Dims the card while an optimistic transition is in flight |
| `error` | `{ message: string; detail?: string } \| null` | No | Card-local error banner |
| `onRetry` | `() => void` | No | Callback for the error banner's `Retry` button |
| `headerActions` | `ReactNode` | No | Controls rendered beside the status badge (`RoleChip`, `WatchToggle`) |
| `extraActions` | `ReactNode` | No | Extra action buttons (e.g. `Statement` link on terminal escrows) |
| `ratingSlot` | `ReactNode` | No | Custom rating UI (`StarRating`) for completed escrows |
| `resolveSlot` | `ReactNode` | No | Custom resolution UI (`ResolveDisputeForm`) for disputed escrows |
| `onFund` | `(contract: EscrowContract, amount: number) => void` | No | Deposit remaining budget |
| `onReleaseNext` | `(contract: EscrowContract, milestoneIndex: number) => void` | No | Release a milestone |
| `onDispute` | `(contract: EscrowContract, trigger: HTMLButtonElement) => void` | No | Open `DisputeDialog` |
| `onCancel` | `(contract: EscrowContract) => void` | No | Trigger cancellation confirmation |
| `onResolve` | `(contract: EscrowContract) => void` | No | Resolve disputed escrow 50/50 |
| `onRate` | `(contract: EscrowContract, rating: number) => void` | No | Submit freelancer rating |

### `EscrowToolbar` (`src/components/escrow/EscrowToolbar.tsx`)

Search (`#escrow-search`), status filter (`#escrow-status`), and sort order (`#escrow-sort`) controls backed by URL query parameters via `src/lib/contractQuery.ts`.

### `ViewFilterControl` (`src/components/ViewFilterControl.tsx`)

Accessible `role="radiogroup"` segmented control (`All`, `As client`, `As freelancer`) synced with the `?view=` query parameter. Role options require a connected wallet.

### `Pagination` (`src/components/escrow/Pagination.tsx`)

Renders `<nav aria-label="Pagination">` with `Previous` and `Next` buttons when `pageCount > 1`.
