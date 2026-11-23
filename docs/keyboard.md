# Keyboard Interaction Reference

This reference covers keyboard behavior implemented by the current dashboard, command palette, export menu, search field, dialogs, and toast notifications.

## Dashboard shortcuts

The dashboard registers these single-key shortcuts through `useHotkeys`:

| Key | Action | Source |
|-----|--------|--------|
| `j` | Focus the next visible escrow card | `src/components/EscrowDashboard.tsx`, `src/hooks/useHotkeys.ts` |
| `k` | Focus the previous visible escrow card | `src/components/EscrowDashboard.tsx`, `src/hooks/useHotkeys.ts` |
| `/` | Focus the escrow search field | `src/components/EscrowDashboard.tsx`, `src/components/escrow/EscrowToolbar.tsx` |
| `?` | Open the keyboard shortcuts dialog | `src/components/EscrowDashboard.tsx`, `src/components/ShortcutsDialog.tsx` |

These shortcuts are ignored while focus is in an input, textarea, select, or editable content; while `Ctrl`, `Meta`, or `Alt` is held; and while a native dialog is open. The shortcuts dialog focuses its Close button when opened, closes with `Escape`, and restores focus to the element that was active before it opened.

## Command palette

Implemented in `src/components/palette/CommandPalette.tsx`.

| Key | Action |
|-----|--------|
| `Ctrl+K` / `Cmd+K` | Open or close the palette. The shortcut is ignored when invoked from another input, textarea, or editable element outside the palette. |
| `ArrowDown` / `ArrowUp` | Move the selected command down or up, wrapping at either end. |
| `Home` / `End` | Select the first or last command. |
| `Enter` | Run the selected command. |
| `Escape` | Close the palette. |

Opening the palette focuses its search field. Closing it restores focus to the element that opened it, including when closed with `Escape` or after running a command.

## Export menu

Implemented in `src/components/escrow/ExportMenu.tsx`.

| Key | Action |
|-----|--------|
| `ArrowDown` on the trigger | Open the menu and focus the first item. |
| `ArrowUp` on the trigger | Open the menu and focus the last item. |
| `ArrowDown` / `ArrowUp` in the menu | Move focus between the export items, wrapping at either end. |
| `Home` / `End` in the menu | Focus the first or last item. |
| `Escape` in the menu | Close the menu and return focus to the Export CSV button. |
| `Tab` in the menu | Close the menu and allow normal tab progression. |

Choosing an export also closes the menu and returns focus to its trigger. Clicking outside closes it without an explicit focus change.

## Search field

The search input in `src/components/escrow/EscrowToolbar.tsx` handles `Escape` only when the search value is non-empty: it prevents the default action and clears the query. Focus remains in the search field. With an empty query, the field does not handle `Escape`.

## Dialogs and disclosures

- `src/components/ui/ConfirmDialog.tsx` handles `Escape` as Cancel. The danger variant initially focuses its safe Cancel button; the default variant initially focuses Confirm. When used through `src/components/ui/ConfirmProvider.tsx`, closing restores focus to the element active before the confirmation was opened.
- `src/hooks/useDisclosure.ts` closes an open disclosure on `Escape` and returns focus to its trigger.
- The command palette and keyboard shortcuts dialog also close on `Escape`; their focus behavior is described above.

## Screen-reader announcements

- `src/components/EscrowDashboard.tsx` has a polite live region. It announces the focused escrow's position when navigating cards with `j` / `k` and announces dashboard feedback set by its actions.
- `src/components/palette/CommandPalette.tsx` has a polite status region for action feedback, such as copying the contract ID or opening API documentation.
- `src/components/toast/ToastProvider.tsx` places success and informational toasts in a `role="status"` polite live region and error toasts in a `role="alert"` assertive live region. A focused toast can be dismissed with `Escape`.