# CommandPalette

Keyboard-driven route and action navigator for the TalentTrust application.

## Overview

`CommandPalette` provides a `Cmd+K` (macOS) / `Ctrl+K` (Windows/Linux) command palette that lets users jump between routes, look up an escrow by ID (`#12` or `12`), look up a Stellar address on the reputation page, or trigger quick actions (copy contract ID, open API documentation). It also renders a visible search trigger button in the header.

## File Location

- Component: `src/components/palette/CommandPalette.tsx`
- Command definitions & ranking: `src/lib/commands.ts`
- Tests: `src/components/palette/__tests__/CommandPalette.test.tsx`
- Mounting point: `src/components/Header.tsx`

## Props

`CommandPalette` accepts no props. Static routes are loaded from `src/lib/nav.json` via `src/lib/commands.ts`.

## Usage

```tsx
import { CommandPalette } from '@/components/palette/CommandPalette';

export function Header() {
  return (
    <header>
      <CommandPalette />
    </header>
  );
}
```

## Commands

Static commands come from `staticCommands` in `src/lib/commands.ts`:

- **Navigation** — every entry from `src/lib/nav.json` (`/`, `/contracts`, `/reputation`, `/docs`, `/status`)
- **Actions** — `Copy contract ID` (`actionType: 'copy-contract'`) and `Open API documentation` (`actionType: 'open-docs'`)
- **Dynamic** (`parseDynamicCommands`) — numeric queries (`#12` or `12`) resolve to `/contracts/${id}`; 56-character Stellar `G...` addresses resolve to `/reputation?address=<addr>`; other text searches resolve to `/contracts?q=<query>` so escrow titles and party addresses can be found from the palette
- **Recent** (`getRecentCommands` / `saveRecentCommand`) — up to 5 recent selections stored in `localStorage` under `tt_recent_commands`

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Cmd+K` / `Ctrl+K` | Open or close the palette (ignored when typing in another input outside the dialog) |
| `Escape` | Close the palette and restore focus to the trigger |
| `ArrowDown` / `ArrowUp` | Move selection down / up (wraps around) |
| `Home` / `End` | Jump to first / last option |
| `Enter` | Execute the selected command |

## Accessibility

- Uses a native `<dialog>` element opened via `showModal()`.
- Search `<input>` has `role="combobox"`, `aria-expanded`, `aria-controls="command-listbox"`, `aria-activedescendant`, and `aria-autocomplete="list"`.
- Results render in `<ul id="command-listbox" role="listbox">` with `<li role="option" aria-selected={...}>`.
- Focus moves to the search input when opened and returns to the trigger element when closed.
- Action feedback (such as copying the contract ID) is announced via an `aria-live="polite"` status region.
