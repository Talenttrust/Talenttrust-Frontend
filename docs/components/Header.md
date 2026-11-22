# Header

Responsive global navigation header containing primary route links, the command palette trigger, wallet connection button, theme toggle, notification bell, and a collapsible mobile menu.

## File Locations

- Component: `src/components/Header.tsx`
- Navigation config: `src/lib/nav.json`
- Disclosure hook: `src/hooks/useDisclosure.ts`
- Tests: `src/components/__tests__/Header.test.tsx`
- Mounting point: `src/app/layout.tsx`

## Props

`Header` accepts no props. Navigation items are read from `src/lib/nav.json` (`/`, `/contracts`, `/reputation`, `/docs`, `/status`).

## Composed Controls

- Primary `<nav aria-label="Main">` links with `aria-current="page"` on the active route
- `CommandPalette` (`src/components/palette/CommandPalette.tsx`)
- `WalletButton` (`src/components/wallet/WalletButton.tsx`)
- `ThemeToggle` (`src/components/ThemeToggle.tsx`)
- `NotificationBell` (`src/components/NotificationBell.tsx`)
- Mobile disclosure menu (`#mobile-nav`) managed by `useDisclosure()`, which locks body scroll while open, moves initial focus to the first link, and closes automatically on route change, `Escape`, backdrop tap, or viewport resize above `721px`.
