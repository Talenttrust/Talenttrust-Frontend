# Keyboard Interaction Reference

Reference for keyboard shortcuts, dialog focus management, and screen-reader announcements in the TalentTrust frontend.

---

## Global & Dashboard Shortcuts

| Shortcut | Action | Source |
|----------|--------|--------|
| `Ctrl+K` / `Cmd+K` | Open or close the command palette | `CommandPalette` (`src/components/palette/CommandPalette.tsx`) |
| `j` | Focus next escrow card on the dashboard | `EscrowDashboard` via `useHotkeys` (`src/hooks/useHotkeys.ts`) |
| `k` | Focus previous escrow card on the dashboard | `EscrowDashboard` via `useHotkeys` (`src/hooks/useHotkeys.ts`) |
| `/` | Focus the escrow search input (`#escrow-search`) | `EscrowDashboard` via `useHotkeys` (`src/hooks/useHotkeys.ts`) |
| `?` | Open the keyboard shortcuts dialog (`ShortcutsDialog`) | `EscrowDashboard` via `useHotkeys` (`src/hooks/useHotkeys.ts`) |
| `Escape` | Clear search input (when focused in `EscrowToolbar`) or close active dialog/disclosure | `EscrowToolbar`, `CommandPalette`, `ConfirmDialog`, `DisputeDialog`, `ShortcutsDialog`, `useDisclosure` |
| `Ctrl/Cmd + K` | Open / close command palette | `CommandPalette` (`src/components/palette/CommandPalette.tsx:98`) |
| `j` | Focus next visible escrow card (roving focus) | `EscrowDashboard` (`src/components/EscrowDashboard.tsx`) |
| `k` | Focus previous visible escrow card (roving focus) | `EscrowDashboard` (`src/components/EscrowDashboard.tsx`) |
| `/` | Focus escrow search input | `EscrowDashboard` (`src/components/EscrowDashboard.tsx`) |
| `?` | Open keyboard shortcuts help dialog | `ShortcutsDialog` (`src/components/ShortcutsDialog.tsx`) |
| `Escape` | Clear search input or close open modal dialog | `EscrowToolbar`, `ShortcutsDialog`, `ConfirmDialog`, `CommandPalette` |

Shortcuts registered through `useHotkeys` (`src/hooks/useHotkeys.ts`) are automatically ignored when focus is inside an `<input>`, `<textarea>`, `<select>`, or `contenteditable` element, when modifier keys (`Ctrl`, `Meta`, `Alt`) are held, or when a native `<dialog open>` is active.
## Dashboard roving-focus & hotkeys (`useHotkeys`)

The escrow dashboard registers single-key shortcuts through `useHotkeys` (`src/hooks/useHotkeys.ts`):

- **Input suppression**: Shortcuts are ignored whenever focus is inside an `<input>`, `<textarea>`, `<select>`, or `contenteditable` element, or when `Ctrl`, `Meta`, or `Alt` is held.
- **Dialog suppression**: Shortcuts are ignored while any native `<dialog>` element is open (`dialog[open]`).
- **Roving card navigation (`j` / `k`)**: Each `EscrowCard` renders an `<article tabIndex={-1} aria-labelledby="escrow-heading-{id}">` with a visible focus ring. Pressing `j` moves focus to the next visible card on the current page (or the first card if none is focused); pressing `k` moves focus to the previous visible card.
- **Screen-reader position announcement**: Moving focus between cards updates the polite live region (`data-testid="escrow-live-announcer"`) with `"Escrow {position} of {count}"` (e.g. `"Escrow 3 of 10"`).
- **Focus search (`/`)**: Moves focus directly to `#escrow-search`.
- **Shortcuts help (`?`)**: Opens `ShortcutsDialog` (`src/components/ShortcutsDialog.tsx`), a native modal `<dialog>` listing available shortcuts, and restores focus to the previously focused element when closed.

---


---

## Component Keyboard Interactions

### `CommandPalette` (`src/components/palette/CommandPalette.tsx`)

| Key | Behavior |
|-----|----------|
| `ArrowDown` / `ArrowUp` | Move active selection down or up through filtered commands (wraps) |
| `Home` / `End` | Jump to first or last command |
| `Enter` | Execute selected command (navigate, copy contract ID, or open API docs) |
| `Escape` | Close palette and return focus to trigger |

### `ExportMenu` (`src/components/escrow/ExportMenu.tsx`)

| Key | Behavior |
|-----|----------|
| `ArrowDown` / `ArrowUp` (on trigger) | Open menu and focus first / last menu item |
| `ArrowDown` / `ArrowUp` (in menu) | Cycle focus between `Escrows` and `Milestones` CSV options |
| `Home` / `End` | Focus first / last menu item |
| `Escape` | Close menu and restore focus to the `Export CSV` button |
| `Tab` | Close menu and allow normal tab progression |

### `ViewFilterControl` (`src/components/ViewFilterControl.tsx`)

Implements a WAI-ARIA `role="radiogroup"` with roving `tabIndex`:

| Key | Behavior |
|-----|----------|
| `ArrowRight` / `ArrowDown` | Focus and select next view filter (`All`, `As client`, `As freelancer`) |
| `ArrowLeft` / `ArrowUp` | Focus and select previous view filter |

### `StarRating` (`src/components/reputation/StarRating.tsx`)

Implements a WAI-ARIA `role="radiogroup"` (1 to 5 stars):

| Key | Behavior |
|-----|----------|
| `ArrowRight` / `ArrowUp` | Increase rating selection up to 5 |
| `ArrowLeft` / `ArrowDown` | Decrease rating selection down to 1 |
| `Home` / `End` | Select 1 star / 5 stars |
| `Space` / `Enter` | Select currently focused star |

---

## Dialogs & Disclosure Focus Management

- **Native `<dialog>` modals**: `CommandPalette`, `ConfirmDialog` (`src/components/ui/ConfirmDialog.tsx`), `DisputeDialog` (`src/components/disputes/DisputeDialog.tsx`), and `ShortcutsDialog` (`src/components/ShortcutsDialog.tsx`) use native `<dialog>` elements with `showModal()`, `Escape` handling, and focus restoration to the triggering control on close.
- **Disclosure widgets**: `Header` mobile navigation uses `useDisclosure` (`src/hooks/useDisclosure.ts`), which closes on `Escape` (restoring focus to the menu button), outside pointer-down, or focus leaving the panel. `NotificationBell` (`src/components/NotificationBell.tsx`) and `WalletButton` (`src/components/wallet/WalletButton.tsx`) close on `Escape` or outside click and return focus to their trigger buttons.

---

## Screen-Reader Live Regions

- **`EscrowDashboard`** (`src/components/EscrowDashboard.tsx`): Announces card navigation (`Escrow X of Y`), mutation progress (`Creating escrow…`, `Funding escrow…`, `Milestone released`), and result counts via `aria-live="polite"`.
- **`ToastProvider`** (`src/components/toast/ToastProvider.tsx`): Renders `role="status" aria-live="polite"` for success/info toasts and `role="alert" aria-live="assertive"` for error toasts.
- **`NotificationsProvider` / `NotificationBell`** (`src/components/NotificationsProvider.tsx`, `src/components/NotificationBell.tsx`): Announces new watched-escrow events and read/clear actions via an `sr-only` `aria-live="polite"` span.
- **`MilestoneBuilder`** (`src/components/MilestoneBuilder.tsx`): Announces row additions, removals, reorderings, and live total in XLM via `aria-live="polite"`.
