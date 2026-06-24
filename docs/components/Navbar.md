# Navbar

Accessible primary global navigation for the TalentTrust application.

## Overview

`Navbar` renders persistent links to the three core application routes:
`/contracts`, `/milestones`, and `/reputation`. It is mounted inside the
sticky header in `src/app/layout.tsx` and uses `next/link` with
`usePathname` for client-side navigation and active-route highlighting.

## File Location

- Component: `src/components/Navbar.tsx`
- Tests: `src/components/__tests__/Navbar.test.tsx`

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| —    | —    | —        | Navbar accepts no props. Route data is internal. |

## Accessibility

- **`aria-current="page"`** — applied to the link whose `href` matches
  the current pathname. Screen readers announce "current page" so users
  know which section they are in.
- **Focus management** — All links are natively focusable. Focus rings
  use `focus:ring-2 focus:ring-[var(--ring)]` consistent with
  `WalletConnectButton` and `not-found` quick links.
- **Landmark** — Wrapped in `&lt;nav aria-label="Primary"&gt;` for easy
  screen-reader landmark navigation.
- **Keyboard order** — Links appear in DOM order after the brand and
  before the wallet button, maintaining a logical tab sequence.

## Mobile Behavior

On viewports narrower than the header's content width, the navigation
links wrap below the brand/wallet row via `flex-wrap`. No hamburger
menu is used—this avoids hidden-focus management and keeps the
implementation lightweight while remaining fully accessible.

## Styling

| State | Tailwind Classes |
|-------|-----------------|
| Active route | `text-[var(--primary)] bg-[var(--primary)]/10` |
| Inactive route | `text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]` |
| Focus | `focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-1` |

## Dependencies

- `next/link` — client-side navigation
- `next/navigation` — `usePathname` hook
- No additional packages required

## Related

- `src/app/layout.tsx` — mounting point
- `src/app/not-found.tsx` — contains the same three routes as recovery links
- `src/components/RouteAnnouncer.tsx` — announces route changes to AT