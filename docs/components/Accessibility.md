# Accessibility Testing

Automated accessibility regression tests catch contrast, role, labeling, and semantic issues before they reach production. The project uses [jest-axe](https://github.com/nickcolley/jest-axe) (axe-core integration for Jest) to audit rendered DOM against [WCAG 2.1 AA](https://www.w3.org/TR/WCAG21/) success criteria.

## Setup

- **jest-axe** is installed as a dev dependency.
- The custom `toHaveNoViolations` matcher is registered in `jest.setup.js`.
- A shared helper module lives at `src/test-utils/a11y.tsx` with:
  - `testA11y(ui, options?)` — renders a component and asserts zero axe violations.
  - `assertNoA11yViolations(container)` — runs axe on an already-rendered container.
  - `renderWithA11y(ui, options?)` — standard RTL render (alias for convenience).

### Test helper API

```tsx
import { testA11y, renderWithA11y, assertNoA11yViolations } from '@/test-utils/a11y';

// One-shot: render + assert
await testA11y(<MyComponent prop="value" />);

// Two-step: render, run assertions, then check a11y
const { container, getByRole } = renderWithA11y(<MyComponent prop="value" />);
expect(getByRole('heading')).toBeInTheDocument();
await assertNoA11yViolations(container);
```

## Test file

All a11y regression tests are colocated in `src/components/__tests__/a11y.test.tsx`. Each component section covers multiple states that produce meaningfully different DOM output:

| Component | Tested states |
|-----------|---------------|
| `MilestonesList` | Empty, single milestone, multiple statuses, missing optional fields |
| `ContractSummary` | Active + multiple parties, Disputed, Completed with single milestone |
| `ReputationProfile` | No reputation, full score + history, partial (score without history), null score |
| `EmptyState` | Text-only, with illustration variant, with primary action, with both actions |
| `FormField` | Default state, errored state, with helper text, required marker |

## Running

```bash
npm test
```

Axe audits run as part of the standard Jest suite. Any violation fails the suite with a detailed report of the rule, selector, and suggested fix.

## CI

The GitHub Actions workflow (`.github/workflows/ci.yml`) already runs `npm test` on every push and pull request to the `main` branch. Adding new a11y tests to `a11y.test.tsx` automatically gates violations in CI.
he
## Skip-to-content link (WCAG 2.4.1 Bypass Blocks)

A visually-hidden skip link is rendered as the **first focusable element** in `<body>` (inside `src/app/layout.tsx`). It lets keyboard and screen-reader users skip the sticky header navigation on every page.

### How it works

```tsx
{/* First child inside WalletProvider — before the header */}
<a href="#main-content" className="skip-link">
  Skip to main content
</a>
```

- **Visually hidden when blurred**: the `.skip-link` class positions the link off-screen (`top: -9999px`). This keeps it out of the visual flow without removing it from the tab order.
- **Visible on focus**: `:focus` resets `top` to `0`, revealing the link in the top-left corner with the app's primary colour and a matching focus ring (`var(--ring)`).
- **Target**: `<main id="main-content" tabIndex={-1}>` — the `tabIndex={-1}` allows the browser to move focus there programmatically when the link is activated.
- **No header disruption**: the link uses `position: absolute` and `z-index: 9999`, so it overlays without affecting the sticky header or `SettingsTrigger` layout.

### CSS (globals.css)

```css
.skip-link {
  position: absolute;
  top: -9999px;
  left: 0;
  z-index: 9999;
  padding: 0.75rem 1.25rem;
  background: var(--primary);
  color: var(--primary-foreground);
  font-weight: 600;
  border-radius: 0 0 var(--radius) 0;
  text-decoration: none;
}

.skip-link:focus {
  top: 0;
  outline: 3px solid var(--ring);
  outline-offset: 2px;
}
```

### Test file

Tests live in `src/app/__tests__/layout.test.tsx` and cover:

| Test | What is verified |
|------|-----------------|
| Correct link text | `getByRole('link', { name: /skip to main content/i })` |
| `href="#main-content"` | Points to the main landmark |
| `.skip-link` class | CSS hook is applied |
| First focusable element | Skip link precedes all header controls in DOM order |
| `<main id="main-content">` exists | Target element is present |
| `tabIndex={-1}` on `<main>` | Programmatic focus is possible |
| axe clean | No WCAG violations via `jest-axe` |

## RouteAnnouncer — client-side navigation focus and announcement

[`RouteAnnouncer`](../../src/components/RouteAnnouncer.tsx) is mounted in the root layout inside the provider tree. It uses `usePathname` from `next/navigation` to detect route changes and:

1. **Focuses the `<main>` landmark** — the `<main>` element in the layout has `tabIndex={-1}` and `id="main-content"`, making it programmatically focusable. On each navigation, focus moves there so keyboard and screen-reader users start at the top of the new page (WCAG 2.4.3).
2. **Announces the page title** — a visually hidden `role="status"` region (`.sr-only`) is updated with the text of the first `<h1>` on the page, falling back to `"Page: <pathname>"`. Assistive technology reads the announcement automatically.

### Behaviour notes

- **Initial mount**: no focus or announcement fires — the component waits for an actual route change.
- **Same-path re-render**: no spurious announcement — a ref tracks the previous pathname.
- **Missing `<main>` / `<h1>`**: gracefully handled — focus attempt is a no-op, and the pathname is used as fallback text.
- **Skip-link compatibility**: the component targets `<main id="main-content">`, which is the standard skip-link destination. If a skip link is added later, the two will not conflict.

### Test file

Colocated tests live in `src/components/__tests__/RouteAnnouncer.test.tsx` and cover:

| Test | Scenario |
|------|----------|
| Initial mount silence | No announcement before first navigation |
| Title from `<h1>` | Announcement reads the `<h1>` text |
| Focus on navigation | `document.activeElement` is the `<main>` after a route change |
| Pathname fallback | No `<h1>` — uses `"Page: /path"` |
| Same-path stability | Re-render with same pathname produces no announcement |
| Multiple navigations | Correct announcement after several route changes |
| Absent `<main>` | Component does not throw when no `<main>` exists |

## ErrorSummary — form validation focus management

[`ErrorSummary`](../../src/components/ErrorSummary.tsx) is rendered at the top of the sign-in form when validation fails. It is the primary accessibility hook for communicating form errors to assistive-technology users.

### Behaviour

- **`role="alert"`** — the container uses an ARIA live region role so screen readers announce the error summary immediately when it appears in the DOM.
- **`tabIndex={-1}` + programmatic focus** — a `useEffect` calls `ref.current.focus()` whenever `errors.length` transitions from 0 to a positive value, or when the error list changes. This moves keyboard focus to the summary so users do not need to navigate back to find the errors.
- **Anchor links** — each list item renders an `<a href="#fieldId">` pointing to the associated input. Activating the link moves focus directly to the invalid field.
- **Renders nothing when empty** — when `errors` is an empty array the component returns `null`, producing no DOM output.

### Test file

Tests live in `src/components/__tests__/ErrorSummary.test.tsx` and cover:

| Test | What is verified |
|------|-----------------|
| Empty render | `null` returned; no DOM output |
| Alert region | `role="alert"` present and `tabIndex={-1}` set |
| Anchor links | Each error produces an `<a href="#fieldId">` with the message text |
| Focus on mount | `document.activeElement` is the summary after errors transition from empty |
| Re-focus on update | Focus returns to summary when the error list changes |
| Duplicate `fieldId`s | Two entries with the same `fieldId` render without React key warnings |
| Single error | Edge-case with one error renders correctly |
| axe audit (with errors) | No WCAG violations when the summary is visible |
| axe audit (empty) | No WCAG violations when the summary is absent |

## Adding a new component

1. Render every distinct state of the component (empty, populated, error, loading, etc.).
2. Call `await testA11y(<Component ... />)` for each state.
3. If the component depends on a context provider, wrap it in the provider before passing to `testA11y`.

## Single landmark rule (WCAG 2.4.1 Bypass Blocks)

Per WCAG guidelines, a page should have exactly one `<main>` landmark to avoid confusing screen reader users with duplicate navigation targets. The root layout (`src/app/layout.tsx`) provides the single `<main id="main-content">` landmark, so page components must not render nested `<main>` elements.

### Home page landmark fix (issue #148)

The home sign-in form (`src/app/page.tsx`) previously had two accessibility issues:
1. **Nested `<main>` landmark** - The page rendered its own `<main>` element while the layout already provided one, creating duplicate landmarks
2. **Duplicate `<h1>` heading** - The page rendered an `<h1>` "TalentTrust" while the layout header already displayed the same text, breaking the heading hierarchy

**Fix applied:**
- Removed the nested `<main>` from `src/app/page.tsx` and replaced it with a `<div>` wrapper
- Changed the page heading from `<h1>` to `<h2>` since the layout header provides the page title
- Added a comment explaining the single-landmark rule for future maintainers

**Test coverage:**
- Added tests in `src/app/page.test.tsx` to verify exactly one `<main>` landmark exists
- Added tests to verify no `<h1>` exists in the page component
- Added comprehensive jest-axe coverage for empty, errored, and valid form states
- Verified ErrorSummary focus and error anchor targeting work correctly

## Caveats

- **jest-axe** runs in a JSDOM environment, which does not fully simulate visual rendering. Color-contrast violations are still detected because axe checks computed styles from JSDOM's CSS support.
- Dynamic changes (e.g. after a button click or data fetch) require a separate `testA11y` call after the state change — axe does not auto-observe mutations.
- For full end-to-end a11y coverage, supplement these unit tests with manual screen-reader and keyboard-navigation checks.


# Accessibility: Dark-theme color contrast audit

**Issue:** a11y/theming-27 — Improve dark-theme color contrast across themed components
**Scope:** `Talenttrust/Talenttrust-Frontend`
**Standard:** WCAG 2.1 AA — 4.5:1 for normal text, 3:1 for large text (≥18pt regular or ≥14pt bold) and UI component boundaries.

## Method

Contrast ratios below were computed directly from the hex values defined in
`src/app/globals.css`, using the standard WCAG relative-luminance formula
(sRGB → linearized → `0.2126R + 0.7152G + 0.0722B`, then
`(L_lighter + 0.05) / (L_darker + 0.05)`). This is the same formula used by
browser dev tools and axe's `color-contrast` check.

Note: `jest-axe` is included in the automated test suite
(`src/components/__tests__/a11y.test.tsx`) to catch ARIA/role/live-region
regressions, but **jsdom does not run a layout/paint engine**, so axe's
`color-contrast` rule does not reliably evaluate colors resolved through
compiled Tailwind classes in this test environment. The ratios in this
document were verified independently and are the authoritative record for
this audit, not the axe run.

## Failures found (before fix)

| Component | Element | Light mode | Dark mode | Status |
|---|---|---|---|---|
| `toast-provider.tsx` | Toast description (`text-slate-600` on `--surface`) | 7.24:1 ✅ | **2.36:1** ❌ | Fails AA (needs 4.5:1) |
| `toast-provider.tsx` | Dismiss button icon (`text-slate-500` on `--surface`) | 4.55:1 ✅ (borderline) | **3.75:1** ❌ | Fails AA (needs 4.5:1) |
| `toast-provider.tsx` | Dismiss button hover bg (`hover:bg-slate-100`, fixed) | n/a (light bg always) | Visually broken — bright patch on dark panel | Not a hard WCAG number, but a real regression |
| `StatusBadge.tsx` | All 5 status pills (`bg-{color}-100 text-{color}-800`, fixed) | 6.37–6.78:1 ✅ | Unaffected by theme — same light pastel chip rendered inside a dark panel | Passes AA numerically, but visually inconsistent with the dark theme |

## Root cause

Both components used **fixed Tailwind utility classes** (`text-slate-600`,
`bg-emerald-100`, etc.) instead of the **CSS variables** already defined in
`globals.css` and toggled by `[data-theme]` via
`src/lib/preferences.tsx`. Fixed classes don't change when the theme
attribute flips, so colors tuned for a light surface get reused, unchanged,
against a dark surface.

## Fix

Added two new sets of theme-aware tokens to `globals.css`:

- **Status/badge tokens** (`--status-success-bg/-foreground`,
  `--status-info-bg/-foreground`, `--status-error-bg/-foreground`,
  `--status-warning-bg/-foreground`) — used by both `StatusBadge.tsx` and
  the toast badges in `toast-provider.tsx`. Light-mode values are
  byte-identical to the original Tailwind hex values, so light mode is
  visually unchanged.
- Reused the **existing** `--muted-foreground` token (already defined,
  already passing AA in both modes) for the toast description text and the
  dismiss button, instead of inventing a new token.

### Verified ratios (after fix)

| Token pair | Light mode | Dark mode |
|---|---|---|
| `--muted-foreground` on `--surface` (toast description, dismiss icon) | 4.55:1 ✅ | 6.96:1 ✅ |
| `--status-success-foreground` on `--status-success-bg` | 6.78:1 ✅ | 5.98:1 ✅ |
| `--status-info-foreground` on `--status-info-bg` | 6.59:1 ✅ | 5.67:1 ✅ |
| `--status-error-foreground` on `--status-error-bg` | 6.68:1 ✅ | 5.30:1 ✅ |
| `--status-warning-foreground` on `--status-warning-bg` | 6.37:1 ✅ | 6.29:1 ✅ |
| Dismiss button hover: `--foreground` on `--accent` | 16.30:1 ✅ | 13.98:1 ✅ |

All pairs clear AA with margin in both themes.

### Badge-vs-panel visual separation (not a WCAG text rule, but checked anyway)

Dark-mode badge backgrounds were also checked against `--surface`
(`#0f172a`) to make sure the chip is visually distinguishable from the
toast panel behind it, not just internally readable:

| Badge background | Ratio vs `--surface` |
|---|---|
| `--status-success-bg` (`#14532d`) | 1.96:1 |
| `--status-info-bg` (`#0c4a6e`) | 1.89:1 |
| `--status-error-bg` (`#7f1d1d`) | 1.78:1 |
| `--status-warning-bg` (`#78350f`) | 1.97:1 |

An earlier draft of these dark badge backgrounds (`#052e1f`, `#3f0d16`) was
rejected at this step — they measured ~1.1–1.2:1 against `--surface` and
were effectively invisible as distinct chips, despite passing the internal
text-contrast check. Flagging this because it's a failure mode that's easy
to miss: a color pair can pass AA's text-contrast formula and still be a
bad fix if the background blends into its container.

## Known pre-existing issue (not introduced by this fix, noted for visibility)

`--muted-foreground` in **light mode** (`#64748b`) measures **4.55:1**
against `--surface` (`#f8fafc`) — it passes AA, but only with a 0.05
margin. This isn't a regression from this PR (the variable already existed
with this value), but it's worth flagging since the issue asked for an
audit of both themes: this pairing has very little headroom and would fail
AA outright if either value drifted even slightly in a future change.

## Components reviewed but not changed

- **`ToastDemo.tsx`** — uses fixed colors (`bg-slate-900 text-white`,
  `bg-white text-rose-700`), but each pair is **self-contained** (fixed
  background + fixed text, not a fixed text color against a *themed*
  surface). Both pairs pass AA regardless of `data-theme`
  (17.85:1 and 6.29:1 respectively). No change made — this is a styling
  preference (the buttons don't visually adapt to theme), not a contrast
  failure, and is out of scope for this issue.

## Testing

- `src/components/__tests__/a11y.test.tsx` renders toast panels (success
  and error) and all five `StatusBadge` statuses in both
  `data-theme='light'` and `data-theme='dark'`, asserting no `jest-axe`
  violations (structural a11y: roles, labels, live regions).
- Additional assertions confirm the fixed `slate-*`/pastel Tailwind classes
  named in this issue are no longer present in the rendered output, and
  that the new CSS-variable-based classes are, as a regression guard for
  this specific fix.

---

## ReputationProfile – Tested Guarantees (issue #135)

**Component:** `src/components/ReputationProfile.tsx`
**Test file:** `src/components/ReputationProfile.test.tsx`

### Rendering branches locked down

| State | Props | Guaranteed outputs |
|-------|-------|--------------------|
| No reputation (undefined score) | `score` omitted | `"No reputation yet"` in score block; `"Pending"` in level block; `"Private by default"` pill; empty history message; **no** amber banner; **no** list items |
| No reputation (null score) | `score={null}` | Same as undefined – `typeof null !== 'number'` so `hasReputation = false` |
| Score = 0 (falsy-but-valid) | `score={0}` | `hasReputation = true`; renders `"0"`; renders level; shows amber partial banner (history empty); **no** `"No reputation yet"` |
| Partial reputation | `score > 0`, `history=[]` | Amber `"Partial reputation data"` banner + explanation; `"Private by default"` pill; empty-history message; **no** list items |
| Full reputation | `score > 0`, `history` non-empty | Each `ReputationEvent` rendered (type, summary, date); `"Visible"` pill; **no** amber banner; **no** empty-history message |
| Single-char initial | `name="A"` or `name="alice"` | Avatar div shows `"A"` (uppercased first character) |
| Default props | `score` provided, no `level`/`history` | `level` defaults to `"Community Member"`; `history` defaults to `[]` |

### Aria contracts verified

| Element | Attribute | Expected value |
|---------|-----------|----------------|
| `<section>` | `aria-labelledby` | `"profile-heading"` |
| `<h2 id="profile-heading">` | `class` | contains `sr-only`; text = `"Reputation profile for {name}"` |
| Score `<p>` | `aria-labelledby` | `"reputation-score-label"` |
| Level `<p>` | `aria-labelledby` | `"reputation-level-label"` |
| Score label `<p>` | `id` | `"reputation-score-label"` |
| Level label `<p>` | `id` | `"reputation-level-label"` |
| `<span>` before score number | `class` | `sr-only`; text = `"Reputation score "` |
| `<span>` after score number | `class` | `sr-only`; text = `" out of 5"` |
| `<span>` before level text | `class` | `sr-only`; text = `"Level "` |

### jest-axe coverage

`assertNoA11yViolations` from `src/test-utils/a11y.tsx` is called for all
four distinct DOM states:

- **Full history** (score + events) — primary axe audit required by issue #135
- **No reputation** (no score)
- **Partial reputation** (score, empty history)
- **Null score**

All states pass axe-core with zero violations.