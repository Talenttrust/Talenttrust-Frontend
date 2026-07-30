# Reputation Theming Guide

How `ReputationProfile` (and its `CopyIdButton` sub-component) consume the
app's CSS custom-property token system, and how to customize them.

## Token source

Every token is defined once in [`src/app/globals.css`](../../src/app/globals.css):
a light-mode default set on `:root`, and a dark-mode override set on
`[data-theme='dark']`. Components never hardcode a color for themeable
surfaces — they reference the token via Tailwind's arbitrary-value syntax,
e.g. `bg-[var(--card)]`, so switching `data-theme` on the document root is
enough to re-theme every consumer at once.

## Tokens `ReputationProfile` consumes

| Token | Used for | Light | Dark |
|-------|----------|-------|------|
| `--card` | Profile card and history card backgrounds | `#ffffff` | `#020617` |
| `--foreground` | Primary text, selected history item border | `#0f172a` | `#f8fafc` |
| `--muted-foreground` | Secondary text (labels, timestamps, copy button idle state) | `#64748b` | `#94a3b8` |
| `--muted` | Selected history item background | `#f1f5f9` | `#1e293b` |
| `--border` | Card/history-item borders, copy button border | `#e2e8f0` | `#1e293b` |
| `--surface` | Hover background for the "Load more" button and copy button | `#f8fafc` | `#0f172a` |
| `--ring` | Focus ring on checkboxes | `#2563eb` | `#3b82f6` |
| `--background` | Avatar initial text color (paired with a `--foreground` avatar background for contrast) | `#ffffff` | `#020617` |

### Legend/band tokens

The reputation-level legend uses a dedicated token set (introduced for the
`a11y/reputation-31` theming migration) rather than the generic tokens
above, so the "active band" highlight can differ from the general
`--muted`/`--accent` treatment used elsewhere:

| Token | Light | Dark |
|-------|-------|------|
| `--legend-active-bg` | `#eef2ff` | `#1e1b4b` |
| `--legend-active-border` | `#c7d2fe` | `#4338ca` |
| `--legend-active-foreground` | `#312e81` | `#e0e7ff` |

### Status tokens

The "Partial reputation data" banner and toast-style confirmations reuse
the shared status token set (also used by `StatusBadge` and toasts — see
[`docs/components/Toast.md`](../components/Toast.md)):

| Token | Light | Dark |
|-------|-------|------|
| `--status-warning-bg` | `#fef3c7` | `#78350f` |
| `--status-warning-foreground` | `#92400e` | `#fcd34d` |

## Customizing

To retheme reputation (or the whole app), edit the token values in
`globals.css` — either the `:root` block (light mode) or the
`[data-theme='dark']` block (dark mode). Do not add new hardcoded colors
inside `ReputationProfile.tsx`; add or reuse a token instead so dark mode
and any future theme stay consistent automatically.

Contrast ratios for the legend and status tokens were audited as part of
`a11y/reputation-31` and `a11y/theming-27` — see
[`docs/components/Accessibility.md`](../components/Accessibility.md) for
the recorded ratios before changing any of the values above.

## High-contrast (forced-colors) mode

Independently of the token system above, `ReputationProfile` also has a
`@media (forced-colors: active)` block in `globals.css` (Windows High
Contrast support) that overrides the token-based styling with
system colors (`CanvasText`, `Highlight`, `HighlightText`, `ButtonText`)
via `data-reputation-toolbar`, `data-reputation-list`, and `data-selected`
attributes. This is a separate, OS-driven mode — it does not use the
`--*` tokens above and is not affected by `data-theme`. See the
"Reputation-specific high-contrast rules" section of `globals.css` for the
exact rules.

## See also

- [`docs/components/ReputationProfile.md`](../components/ReputationProfile.md) — component API reference
- [`docs/components/ReputationAccessibility.md`](../components/ReputationAccessibility.md) — accessibility contract
- [`docs/reputation/hooks.md`](./hooks.md) — helper functions, utilities, and types
