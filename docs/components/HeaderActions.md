# HeaderActions

## Purpose

`HeaderActions` provides a responsive wrapper for the global header action area. It preserves the sticky, blurred header styling while collapsing wallet-specific actions behind a mobile disclosure control on narrow viewports.

## Breakpoints

- `sm` and above: `WalletConnectButton` renders inline in the header.
- below `sm`: wallet actions are hidden behind an accessible toggle button to eliminate horizontal overflow.

## Accessibility

- The toggle is a native `button` element with:
  - `aria-expanded="true | false"`
  - `aria-controls="header-wallet-actions"`
- The controlled menu is a `region` with `aria-label="Wallet actions"`.
- The disclosure button is keyboard-focusable and has a visible focus ring via existing utility classes.

## Usage

In `src/app/layout.tsx`, replace the inline theme and wallet button area with:

```tsx
import HeaderActions from '@/components/HeaderActions';

<header className="sticky top-0 z-40 ...">
  <div className="flex items-center gap-2">
    <span className="text-xl font-bold tracking-tight text-slate-900">TalentTrust</span>
  </div>
  <Navbar />
  <HeaderActions />
</header>
```

## Implementation Notes

- The component avoids mutating `WalletConnectButton` props or internals.
- The disclosure wrapper uses `sm:block` so the wallet actions are always visible on desktop layouts, while mobile users can toggle visibility.
- The component renders a `ThemeToggle` button consistently and only hides the mobile disclosure control on larger screens.
