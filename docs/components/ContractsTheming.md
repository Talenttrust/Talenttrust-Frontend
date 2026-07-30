# Contracts Theming Guide

## Overview

This guide documents exactly which CSS custom properties ("theme tokens")
the contracts feature consumes, where each one is used, and how to
customize them. It also documents — accurately, not aspirationally — the
large parts of contracts' styling that are **not** tokenized today, so this
guide doesn't overstate how theme-aware the feature currently is.

Theme switching itself (`light` / `dark` / `system`, persistence, hydration)
is implemented once, application-wide, by `PreferencesProvider`; see
[`docs/preferences.md`](../preferences.md) for that contract. This guide
only covers how contracts plugs into it.

## How theming reaches contracts

`PreferencesProvider` sets `data-theme="light"` or `data-theme="dark"` on
`document.documentElement` based on the user's `theme` preference
(`src/lib/preferences.tsx`). `src/app/globals.css` defines every token
twice — once under `:root` (light values) and once under
`[data-theme='dark']` (dark values) — so any component that reads a token
via `var(--token-name)` automatically repaints when the attribute changes,
with no per-component theme logic required.

## Tokens contracts actually consumes

Token usage differs sharply between the two contracts routes:

- **`/contracts`** (the list page — `ContractsList`, `ContractListItem`,
  `ContractsSkeleton`, and the search/sort/export/density toolbar in
  `src/app/contracts/page.tsx`) consumes **no theme tokens at all**. See
  [What is *not* tokenized](#what-is-not-tokenized-known-limitation-not-a-bug)
  below.
- **`/contracts/[id]`** (the detail page) consumes two token surfaces:

| Token | Consumer | Where |
|---|---|---|
| `--status-success-bg` / `--status-success-foreground` | `StatusBadge` (via `ContractSummary`) | `Active` and `Paid` contract status pills |
| `--status-info-bg` / `--status-info-foreground` | `StatusBadge` (via `ContractSummary`) | `Completed` contract status pills |
| `--status-error-bg` / `--status-error-foreground` | `StatusBadge` (via `ContractSummary`) | `Disputed` contract status pills |
| `--status-warning-bg` / `--status-warning-foreground` | `StatusBadge` (via `ContractSummary`) | `Pending` contract status pills |
| `--ring` | `Breadcrumbs` | Focus ring on breadcrumb links (`focus-visible:ring-[var(--ring)]`) |

`StatusBadge` is shared with milestones — see
[`MilestonesTheming.md`](./MilestonesTheming.md) and
[`StatusBadge.md`](./StatusBadge.md) for its full color-token table. The
`--status-*` tokens were introduced and contrast-audited under issue
a11y/theming-27; both light and dark pairs meet WCAG AA (4.5:1) for text
against their own chip background — see
[`Accessibility.md`](./Accessibility.md#accessibility-dark-theme-color-contrast-audit)
for the full ratio table. `Breadcrumbs` is only rendered on
`/contracts/[id]` today (`src/app/contracts/[id]/page.tsx`).

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

There is currently no dedicated contracts-only token override point;
contracts' detail-page tokens are the same application-wide `--ring` /
`--status-*` tokens every other status-driven component (e.g.
`MilestoneRow`) reads from.

## What is *not* tokenized (known limitation, not a bug)

The entire `/contracts` list page is **hardcoded Tailwind color classes**,
not CSS custom properties, and does not change with `data-theme` at all:

- **Toolbar and list container** (`src/app/contracts/page.tsx`,
  `ContractsList.tsx`): search input, sort `<select>`, CSV/JSON export
  buttons, and the density toggle all use hardcoded
  `border-slate-300` / `bg-white` / `text-slate-900`, with no `dark:`
  variants.
- **Contract cards** (`ContractListItem.tsx`): `border-slate-200 bg-white`
  card with plain `text-slate-500` status text — not routed through
  `StatusBadge` at all, so list-view status text has no color coding or
  token backing, unlike the detail page's pill.
- **`ContractsSkeleton`**: entirely `bg-slate-200` shimmer blocks, no
  `dark:` variants.
- **"Create Contract" button**: hardcoded `bg-blue-600` / `hover:bg-blue-700`.

Most of the `/contracts/[id]` detail page is hardcoded too — only
`StatusBadge` (via `ContractSummary`) and `Breadcrumbs`'s focus ring
(documented above) read theme tokens. `ActionPanel`, `ContractProgress`,
and their skeleton counterparts all use hardcoded Tailwind slate/blue
classes with no `var(--...)` or `dark:` variants.

If you're customizing contracts' theme and the toolbar, cards, or action
panel don't change color, this is why — they're intentionally out of
scope for the token system as it exists today, not a bug in this guide's
instructions. Bringing them onto the token system (or adding `dark:`
variants) would be a separate, larger change.

## See also

- [`docs/preferences.md`](../preferences.md) — the `PreferencesProvider`
  theme contract this guide builds on (persistence, hydration, `system`
  resolution)
- [`MilestonesTheming.md`](./MilestonesTheming.md) — the sibling guide for
  milestones, which shares the same `--status-*` / `--ring` tokens via the
  same `StatusBadge` component
- [`StatusBadge.md`](./StatusBadge.md) — full `StatusBadge` component
  reference, including the icon+label-not-color-alone a11y contract
- [`Accessibility.md`](./Accessibility.md) — the `--status-*` contrast
  audit (a11y/theming-27)
- [`ContractsApi.md`](./ContractsApi.md) / [`ContractDetail.md`](./ContractDetail.md) —
  component API and composition reference for the pages this guide covers
