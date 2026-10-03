import React from 'react';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Public types  (stable – do not remove or rename without a migration plan)
// ---------------------------------------------------------------------------

/** A single breadcrumb entry. Omit `href` for the current (final) crumb. */
export type BreadcrumbItem = {
  /** Visible label for this crumb. Must be a non-empty string. */
  label: string;
  /**
   * Navigation target. When provided the crumb renders as a Next.js `<Link>`.
   * Omit (or pass `undefined`) for the final crumb, which renders as plain
   * text with `aria-current="page"`.
   *
   * Invariant: ancestor crumbs (all crumbs except the last) must supply a
   * non-empty `href`. If `href` is omitted for an ancestor, the component
   * falls back to `"/"` and surfaces a console warning in development so the
   * caller can correct the data. This fallback is intentional: it keeps the
   * component operational in production while making the misconfiguration
   * obvious during development.
   */
  href?: string;
  /** Optional unique identifier for stable key assignment under concurrent re-renders. */
  id?: string;
  [key: string]: unknown;
};

export type BreadcrumbsProps = {
  /**
   * Ordered list of crumbs from root to current page.
   * The array is treated as immutable — the component never mutates it.
   * Empty string labels are silently filtered out and a warning is emitted in
   * development so callers can detect data problems without crashing.
   *
   * **Runtime safety**: `null` or `undefined` entries (which can appear when
   * data comes from untyped APIs) are silently dropped before rendering so
   * the component never throws on malformed input.
   */
  items?: ReadonlyArray<BreadcrumbItem>;
  /**
   * Route path used to derive the trail when `items` is omitted (or empty).
   *
   * Segments are stripped of query/hash suffixes, URI-decoded, humanised and
   * prefixed with a `Home` crumb — see {@link createBreadcrumbsFromPath}.
   * This lets route-level callers render a trail without building the array.
   *
   * @default undefined
   */
  path?: string | null;
  /**
   * Accessible label for the `<nav>` landmark.
   * Defaults to `"Breadcrumb"`. Override when the page mounts multiple
   * `<nav>` elements so each has a unique label (WCAG 2.4.6).
   *
   * @default "Breadcrumb"
   */
  ariaLabel?: string;
  /**
   * Optional CSS class(es) applied to the outer `<nav>` element.
   * Allows layout-level overrides without additional wrapper elements.
   * Internal structural classes are not exposed and may change between
   * minor releases; callers should apply only additive layout classes here.
   */
  className?: string;
  /**
   * DOM `aria-label` alias for {@link BreadcrumbsProps.ariaLabel}.
   * Prose-API callers pass `aria-label`, component-API callers pass
   * `ariaLabel`; both are honoured, with `ariaLabel` taking precedence.
   */
  'aria-label'?: string;
  /**
   * Character(s) rendered between consecutive crumbs. The separator is always
   * hidden from assistive technology (`aria-hidden="true"`) because the `<ol>`
   * already conveys the ordering.
   *
   * @default "/"
   */
  separator?: React.ReactNode;
  /**
   * Forwarded to the `<nav>` landmark so tests and tooling can target a
   * specific trail when several are mounted on one page.
   */
  'data-testid'?: string;
};

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Longest `href` we are willing to render before treating it as malformed. */
const MAX_HREF_LENGTH = 2048;

/** Longest label we accept from untrusted input before dropping it. */
const MAX_LABEL_LENGTH = 512;

/** Default separator rendered between crumbs. */
const BREADCRUMB_SEPARATOR = '/';

/**
 * Shape returned by {@link normalizeBreadcrumbs}: the renderable items plus
 * counters describing what sanitisation removed (useful for assertions and
 * diagnostics).
 */
export type NormalizedBreadcrumbs = {
  items: BreadcrumbItem[];
  droppedInvalidCount: number;
  dedupedCount: number;
};

/** True when `value` is a string containing at least one non-space character. */
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

// ---------------------------------------------------------------------------
// Invariant helpers
// ---------------------------------------------------------------------------

/**
 * Emits a warning in development. Noop in production to avoid log spam.
 *
 * @internal
 */
function warn(message: string): void {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[Breadcrumbs] ${message}`);
  }
}

/**
 * Humanises a single route segment into a display label.
 *
 * Rules (deterministic, locale-independent):
 *  - Percent-encoded segments are decoded when the escape sequence is valid.
 *  - Purely numeric segments are ids → `"#42"`.
 *  - Remaining separators (`-`, `_`, whitespace) become single spaces and each
 *    word is capitalised: `"fast-2"` → `"Fast 2"`.
 *
 * @internal
 */
function labelFromSegment(segment: string): string {
  let decoded = segment;

  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Malformed escape sequence (e.g. a lone '%') — keep the raw segment
    // rather than throwing on untrusted route data.
  }

  if (/^\d+$/.test(decoded)) return `#${decoded}`;

  const words = decoded.split(/[\s_-]+/).filter((word) => word.length > 0);
  if (words.length === 0) return decoded;

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/**
 * Derives a breadcrumb trail from a route path.
 *
 * This is a pure, deterministic mapping so route-driven callers (and tests)
 * can predict the trail exactly:
 *  - `null` / `undefined` / empty / whitespace-only → `[]`
 *  - `"/"` (or any run of slashes) → a single `Home` crumb
 *  - `"/contracts/42"` → `[Home, Contracts, "#42"]` (final crumb has no href)
 *  - query strings and hash anchors are stripped before splitting
 *  - consecutive and trailing slashes are collapsed idempotently
 *
 * Every crumb except the last carries the cumulative href for its depth.
 *
 * @param path - Raw route path (may be untrusted).
 * @returns The derived crumbs, or `[]` when there is nothing to render.
 */
export function createBreadcrumbsFromPath(path?: string | null): BreadcrumbItem[] {
  if (typeof path !== 'string') return [];

  const [withoutHash] = path.split('#');
  const [pathname] = withoutHash.split('?');
  const cleaned = pathname.trim();

  if (cleaned.length === 0) return [];

  const segments = cleaned
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  // Root (and slash-only paths) collapse to the single Home crumb.
  if (segments.length === 0) return [{ label: 'Home', href: '/' }];

  const crumbs: BreadcrumbItem[] = [{ label: 'Home', href: '/' }];
  let href = '';

  segments.forEach((segment, index) => {
    href += `/${segment}`;
    const label = labelFromSegment(segment);

    // The final crumb is the current page: it never links anywhere.
    crumbs.push(index === segments.length - 1 ? { label } : { label, href });
  });

  return crumbs;
}

/**
 * Validates and sanitises the items array before render, falling back to
 * {@link createBreadcrumbsFromPath} when no usable items were supplied.
 *
 * Invariants enforced:
 *  1. A missing/empty `items` array is derived from `path` (when provided).
 *  2. `null` / `undefined` / non-object entries are silently dropped (runtime
 *     safety for data arriving from untyped APIs) with a dev warning.
 *  3. Empty or whitespace-only labels are removed (they create invisible,
 *     non-descriptive accessible elements). A dev warning is emitted.
 *  4. Unsafe hrefs (`javascript:`, `data:`, …) are stripped, keeping the label.
 *  5. Ancestor crumbs (every crumb except the last) without an `href` receive a
 *     `"/"` fallback at render time, and a dev warning is emitted here so it is
 *     reported once per render regardless of list length.
 *
 * The input array is never mutated.
 *
 * @param items - Raw items from a caller (may be untyped runtime data).
 * @param path - Optional route path used when `items` yields nothing.
 * @returns A new array of renderable crumbs.
 */
export function normalizeBreadcrumbItems(
  items: unknown,
  path?: string | null,
): BreadcrumbItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    return createBreadcrumbsFromPath(path);
  }

  const normalized: BreadcrumbItem[] = [];

  for (let i = 0; i < items.length; i++) {
    const rawItem: unknown = items[i];

    // Guard: null/undefined/non-object entries from untyped runtime data.
    if (rawItem == null || typeof rawItem !== 'object') {
      warn(
        `items[${i}] is ${String(rawItem)} and will be ignored. ` +
          'Every breadcrumb entry must be a valid BreadcrumbItem object.',
      );
      continue;
    }

    const candidate = rawItem as { label?: unknown; href?: unknown };
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';

    // Guard: empty-string label produces an invisible accessible element.
    if (label.length === 0) {
      warn(
        `items[${i}] has an empty label and will be ignored. ` +
          'Every breadcrumb crumb must have a visible, non-empty label.',
      );
      continue;
    }

    const hasHref = candidate.href !== undefined && candidate.href !== null;
    const href = hasHref && isSafeBreadcrumbHref(candidate.href)
      ? (candidate.href as string)
      : undefined;

    normalized.push(href === undefined ? { label } : { label, href });
  }

  // After filtering, warn about ancestor crumbs that lack an href.
  for (let i = 0; i < normalized.length - 1; i++) {
    if (!normalized[i].href) {
      warn(
        `items[${i}] ("${normalized[i].label}") is an ancestor crumb with no ` +
          'href. Falling back to "/" — pass an explicit href to silence this warning.',
      );
    }
  }

  return normalized;
}

/**
 * Returns a stable, unique React key for a crumb.
 *
 * Strategy: prefer the item's href when present (typically unique per crumb),
 * combined with the index as a tiebreaker. This ensures that duplicate labels
 * with different hrefs (e.g. two "Home" entries pointing to different routes)
 * do not collide, while the index prevents any remaining collisions.
 *
 * @internal
 */
function crumbKey(item: BreadcrumbItem, index: number): string {
  return `${item.href ?? ''}-${item.label}-${index}`;
}

/**
 * Return true when `href` is a safe, renderable navigation target.
 *
 * We only accept relative paths and http(s) URLs. This blocks dangerous
 * schemes such as `javascript:`, `data:`, `vbscript:`, and `mailto:` from
 * being rendered as a `<Link>`. Control characters and whitespace are
 * rejected because they can be used to obfuscate dangerous schemes.
 */
export const isSafeBreadcrumbHref = (href: unknown): href is string => {
  if (!isNonEmptyString(href)) return false;
  if (href.length > MAX_HREF_LENGTH) return false;
  // Reject control characters and newlines.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(href)) return false;
  // Reject leading/trailing whitespace.
  if (href !== href.trim()) return false;

  // Relative path (including protocol-relative `//`) is always allowed.
  if (href.startsWith('/')) return true;

  // Absolute URLs: only http and https.
  try {
    const parsed = new URL(href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Normalize and validate a list of breadcrumb items.
 *
 * This function is pure and deterministic: the same input always produces
 * the same output. It is the single source of truth for what the component
 * will render, which makes failure recovery and testing straightforward.
 *
 * Invariants:
 * - Every returned item has a non-empty, trimmed label.
 * - Every returned item has a safe `href` or no `href` at all.
 * - Duplicate consecutive labels are collapsed to a single crumb.
 * - The last item is always treated as the current page (no `href`).
 */
export const normalizeBreadcrumbs = (items: unknown): NormalizedBreadcrumbs => {
  const safeItems = Array.isArray(items) ? items : [];

  const normalized: BreadcrumbItem[] = [];
  let droppedInvalidCount = 0;
  let dedupedCount = 0;

  for (const rawItem of safeItems) {
    if (!rawItem || typeof rawItem !== 'object') {
      droppedInvalidCount += 1;
      continue;
    }

    const candidate = rawItem as { label?: unknown; href?: unknown };
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';

    if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
      droppedInvalidCount += 1;
      continue;
    }

    const hasHref = candidate.href !== undefined && candidate.href !== null;
    const href = hasHref && isSafeBreadcrumbHref(candidate.href)
      ? (candidate.href as string)
      : undefined;

    if (hasHref && href === undefined) {
      // Unsafe or malformed href: drop the href but keep the label so the
      // user still sees the trail and can recover via other navigation.
      droppedInvalidCount += 1;
    }

    const previous = normalized[normalized.length - 1];
    if (previous && previous.label === label && previous.href === href) {
      dedupedCount += 1;
      continue;
    }

    normalized.push(href === undefined ? { label } : { label, href });
  }

  // The final crumb is always the current page: drop any `href` on it.
  if (normalized.length > 0) {
    const last = normalized[normalized.length - 1];
    if (last.href !== undefined) {
      normalized[normalized.length - 1] = { label: last.label };
    }
  }

  return { items: normalized, droppedInvalidCount, dedupedCount };
};

/**
 * Accessible breadcrumb navigation component.
 *
 * ## Compatibility contract
 * - **Exports** `BreadcrumbItem`, `BreadcrumbsProps`, and the default export
 *   `Breadcrumbs` are stable public API. Do not remove or rename them.
 * - **`items` prop** is `ReadonlyArray<BreadcrumbItem>` — the component never
 *   mutates the array.
 * - **Empty arrays** render nothing (`null`). Callers may rely on this.
 * - **`null`/`undefined` entries** are silently dropped with a dev warning;
 *   the component never throws on runtime data from untyped APIs.
 * - **Empty-string labels** are silently filtered with a dev warning; callers
 *   should never pass them but will not crash if they do.
 * - **Missing ancestor `href`** falls back to `"/"` with a dev warning.
 * - **`ariaLabel`** defaults to `"Breadcrumb"`. Existing callers that omit
 *   this prop are unaffected.
 * - **`className`** defaults to `undefined`. Existing callers are unaffected.
 * - The focus ring uses `var(--ring)` (theme token) — not a hardcoded colour.
 *
 * ## Render structure
 * ```
 * <nav aria-label="Breadcrumb">
 *   <ol>
 *     <li>                          ← ancestor crumbs
 *       <Link href="…">label</Link>
 *     </li>
 *     …
 *     <li>                          ← current page
 *       <span aria-current="page">label</span>
 *     </li>
 *   </ol>
 * </nav>
 * ```
 *
 * @example
 * ```tsx
 * <Breadcrumbs
 *   items={[
 *     { label: 'Dashboard', href: '/' },
 *     { label: 'Contracts', href: '/contracts' },
 *     { label: 'Contract #42' },
 *   ]}
 * />
 * ```
 *
 * @example Customise the nav label when multiple navigations are on one page:
 * ```tsx
 * <Breadcrumbs
 *   ariaLabel="Contract navigation"
 *   items={[{ label: 'Dashboard', href: '/' }, { label: 'Contract #42' }]}
 * />
 * ```
 *
 * @example Pass a layout class to the nav wrapper:
 * ```tsx
 * <Breadcrumbs className="mb-4" items={[…]} />
 * ```
 */
const Breadcrumbs = ({
  items,
  path,
  ariaLabel,
  'aria-label': ariaLabelProp,
  separator = BREADCRUMB_SEPARATOR,
  className,
  'data-testid': dataTestId,
}: BreadcrumbsProps): React.ReactElement | null => {
  // Normalise once per render; the result is pure and deterministic, so React's
  // reconciler can diff it cheaply on every re-render.
  const crumbs = normalizeBreadcrumbItems(items, path);

  // Invariant: empty list (after sanitisation) renders nothing.
  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label={ariaLabel ?? ariaLabelProp ?? 'Breadcrumb'}
      className={className}
      data-testid={dataTestId}
    >
      <ol className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
        {crumbs.map((item, index) => {
          const isLast = index === crumbs.length - 1;

          return (
            <li key={crumbKey(item, index)} className="flex items-center gap-1">
              {/* Separator — hidden from screen readers */}
              {index > 0 && (
                <span aria-hidden="true" className="select-none text-slate-400">
                  {separator}
                </span>
              )}

              {isLast ? (
                // Current page: plain text, no link, aria-current for AT.
                // title exposes the full label when display is truncated.
                <span
                  aria-current="page"
                  title={item.label}
                  className="font-medium text-slate-900 truncate max-w-[16rem]"
                >
                  {item.label}
                </span>
              ) : (
                // Ancestor: linked crumb.
                // href falls back to "/" when absent (see sanitiseItems warning).
                // title exposes the full label when display is truncated.
                <Link
                  href={item.href ?? '/'}
                  title={item.label}
                  className="truncate max-w-[16rem] transition hover:text-slate-900 hover:underline rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

// displayName makes the component identifiable in React DevTools and error
// boundary stack traces.
Breadcrumbs.displayName = 'Breadcrumbs';

export default Breadcrumbs;
