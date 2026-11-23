# ExportMenu

Dropdown menu on the escrow dashboard that exports the currently filtered escrows or their milestones as a UTF-8 CSV file.

## File Locations

- Component: `src/components/escrow/ExportMenu.tsx`
- CSV & export helpers: `src/lib/exportContracts.ts`, `src/lib/csv.ts`
- Tests: `src/components/__tests__/ExportMenu.test.tsx`

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `contracts` | `EscrowContract[] \| null` | Yes | Filtered list of escrows to export, or `null` while loading |

## Export Options

When opened, `ExportMenu` renders two `role="menuitem"` options:

1. **Escrows (one row each)** (`kind: 'escrows'`) — Exports contract-level columns (`CONTRACT_HEADERS` in `src/lib/exportContracts.ts`).
2. **Milestones (one row each)** (`kind: 'milestones'`) — Exports one row per milestone across the visible contracts (`MILESTONE_HEADERS` in `src/lib/exportContracts.ts`).

When `contracts` is `null` (`"Loading escrows..."`) or empty (`"Nothing to export yet."`), the `Export CSV` button is disabled and linked to the status hint via `aria-describedby="export-hint"`.

## Keyboard & Accessibility

- Trigger button has `aria-haspopup="menu"`, `aria-expanded`, and `aria-controls="export-menu"`.
- Pressing `ArrowDown` or `ArrowUp` on the trigger opens the menu and focuses the first or last item.
- Inside the menu (`role="menu"`), `ArrowDown`, `ArrowUp`, `Home`, and `End` move focus between items; `Escape` closes the menu and restores focus to the trigger button.
