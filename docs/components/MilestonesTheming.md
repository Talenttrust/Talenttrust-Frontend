# Milestones Theming Guide

## Overview

This guide documents exactly which CSS custom properties ("theme tokens")
the milestones components consume, where each one is used, and how to
customize them. It also documents — accurately, not aspirationally — the
parts of milestones' styling that are **not** tokenized today, so this
guide doesn't overstate how theme-aware the feature currently is.

Theme switching itself (`light` / `dark` / `system`, persistence, hydration)
is implemented once, application-wide, by `PreferencesProvider`; see
[`docs/preferences.md`](../preferences.md) for that contract. This guide
only covers how milestones plugs into it.

## How theming reaches milestones

`PreferencesProvider` sets `data-theme="light"` or `data-theme="dark"` on
`document.documentElement` based on the user's `theme` preference
(`src/lib/preferences.tsx`). `src/app/globals.css` defines every token
twice — once under `:root` (light values) and once under
`[data-theme='dark']` (dark values) — so any component that reads a token
via `var(--token-name)` automatically repaints when the attribute changes,
with no per-component theme logic required.

## Tokens milestones actually consumes

Only two token surfaces are used by milestones components today:

| Token | Consumer | Where |
|---|---|---|
| `--ring` | `MilestonesList` | Focus ring on the scrollable list region (`focus-visible:ring-[var(--ring)]`) |
| `--status-success-bg` / `--status-success-foreground` | `StatusBadge` | `Active` and `Paid` milestone status pills |
| `--status-info-bg` / `--status-info-foreground` | `StatusBadge` | `Completed` milestone status pills |
| `--status-error-bg` / `--status-error-foreground` | `StatusBadge` | `Disputed` milestone status pills |
| `--status-warning-bg` / `--status-warning-foreground` | `StatusBadge` | `Pending` milestone status pills |

`StatusBadge` is shared with `ContractSummary` — see
[`StatusBadge.md`](./StatusBadge.md) for its full color-token table. The
`--status-*` tokens were introduced and contrast-audited under issue
a11y/theming-27; both light and dark pairs meet WCAG AA (4.5:1) for text
against their own chip background — see
[`Accessibility.md`](./Accessibility.md#accessibility-dark-theme-color-contrast-audit)
for the full ratio table.

## Current token values

From `src/app/globals.css`:

| Token | Light (`:root`) | Dark (`[data-theme='dark']`) |
|---|---|---|
| `--ring` | `#2563eb` | `#3b82f6` |
| `--status-success-bg` | `#d1fae5` | `#14532d` |
| `--status-success-foreground` | `#065f46` | `#6ee7b7` |
| `--status-info-bg` | `#e0f2fe` | `#0c4a6e` |
| `--status-info-foreground` | `#075985` | `#7dd3fc` |
| `--status-error-bg` | `#ffe4e6` | `#7f1d1d` |
| `--status-error-foreground` | `#9f1239` | `#fda4af` |
| `--status-warning-bg` | `#fef3c7` | `#78350f` |
| `--status-warning-foreground` | `#92400e` | `#fcd34d` |

## Customizing

Edit the token's value under both selectors in `src/app/globals.css` — a
token changed in only one theme will look correct in that theme and wrong
in the other:

```css
:root {
  --status-warning-bg: #fef3c7;       /* light "Pending" chip background */
}

[data-theme='dark'] {
  --status-warning-bg: #78350f;       /* dark "Pending" chip background */
}
```

If you change a `--status-*` pair, re-check contrast for both the
text-on-chip ratio and the chip-vs-`--surface` separation ratio (the two
checks documented in `Accessibility.md`'s audit) — a change that passes one
and fails the other will look fine in isolation but blend into the page
background in that theme.

There is currently no dedicated milestones-only token override point;
milestones tokens are the same application-wide `--ring` / `--status-*`
tokens every other status-driven component (e.g. `ContractSummary`) reads
from. Introducing a milestones-specific override would mean adding new
custom properties and threading them through `StatusBadge`'s `className`
prop or a new variant — not something this guide assumes exists.

## What is *not* tokenized (known limitation, not a bug)

Most of milestones' visual surface is **hardcoded Tailwind color classes**,
not CSS custom properties, and does not change with `data-theme` at all:

- **Row backgrounds/borders** (`MilestoneRow.tsx`): unselected rows use
  `border-slate-200 bg-slate-50`, selected rows use
  `border-indigo-300 bg-indigo-50`. Neither has a `dark:` Tailwind variant,
  so a milestone row renders with the same light-slate/indigo colors
  regardless of the active theme.
- **`MilestonesListSkeleton`**: entirely `bg-slate-200` shimmer blocks, no
  `dark:` variants.
- **The due-soon reminder banner** (`MilestonesList.tsx`) is the one
  exception that *is* theme-aware, but via a different mechanism than the
  rest of this guide: it uses explicit Tailwind `dark:` variant classes
  (`border-amber-200 dark:border-amber-500/20`, etc.), not `--status-*` /
  `--ring` custom properties.

If you're customizing milestones' theme and rows or the skeleton don't
change color, this is why — they're intentionally out of scope for the
token system as it exists today, not a bug in this guide's instructions.
Bringing them onto the token system (or adding `dark:` variants, matching
the due-soon banner's approach) would be a separate, larger change.

## See also

- [`docs/preferences.md`](../preferences.md) — the `PreferencesProvider`
  theme contract this guide builds on (persistence, hydration, `system`
  resolution)
- [`StatusBadge.md`](./StatusBadge.md) — full `StatusBadge` component
  reference, including the icon+label-not-color-alone a11y contract
- [`Accessibility.md`](./Accessibility.md) — the `--status-*` contrast
  audit (a11y/theming-27)
- [`MilestonesList.md`](./MilestonesList.md) /
  [`MilestoneRow.md`](./MilestoneRow.md) — accessibility contracts for the
  components mentioned above
