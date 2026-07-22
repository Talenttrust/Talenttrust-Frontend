# Contributing

## Development workflow

1. Fork the repo and clone your fork.
2. Create a branch from `main`:
   ```bash
   git checkout -b your-initials/description-of-change
   ```
3. Install dependencies and verify your toolchain:
   ```bash
   npm install
   npm run lint && npm test && npm run build
   ```
4. Make your changes, commit, push, and open a pull request.

See the [PR template](.github/pull_request_template.md) for the pre-flight checklist.

---

## Running tests

```bash
npm test            # run all tests
npm test -- --watch # watch mode
npm test -- --coverage  # generate coverage report
```

Coverage expectations are documented in the PR template; the project targets **95% minimum coverage** for impacted modules.

### Module alias `@/`

Jest is configured (`jest.config.js`) with the same `@/` path alias defined in `tsconfig.json`:

```
^@/(.*)$ → src/$1
```

Import components and utilities using the alias:

```ts
import StatusBadge from '@/components/StatusBadge';
import { formatAmount } from '@/lib/preferences';
```

This works in both source files and test files without relative-path gymnastics.

---

## Writing tests

Tests live next to the units they cover in `__tests__` directories. Jest discovers files matching `**/*.test.{ts,tsx}`.

| Location                          | Tests                          |
|-----------------------------------|--------------------------------|
| `src/components/__tests__/`       | UI component tests             |
| `src/lib/__tests__/`              | Pure utility / helper tests    |
| `src/contexts/__tests__/`         | Context / provider tests       |
| `src/app/**/__tests__/`           | Page-level / route tests       |

### Example: a unit test

```tsx
import { render, screen } from '@testing-library/react';
import StatusBadge from '@/components/StatusBadge';

describe('StatusBadge', () => {
  it('renders the status text', () => {
    render(<StatusBadge status="Active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});
```

---

## Accessibility testing with jest-axe

The project uses [jest-axe](https://github.com/nickcolley/jest-axe) to audit rendered DOM against WCAG rules. Three helpers are exported from `src/test-utils/a11y.tsx`, and `toHaveNoViolations` is extended globally in `jest.setup.ts`.

### `testA11y(ui, options?)`

Render a component and immediately assert zero axe violations. The canonical one-liner for most a11y tests:

```tsx
import { testA11y } from '@/test-utils/a11y';
import EmptyState from '@/components/EmptyState';

it('has no a11y violations', async () => {
  await testA11y(
    <EmptyState title="No items" description="Nothing here yet." />
  );
});
```

### `assertNoA11yViolations(container)`

Run axe against an arbitrary `HTMLElement`. Useful when you need to interact with the component before auditing (e.g. open a modal, click a button):

```tsx
import { render, fireEvent, screen } from '@testing-library/react';
import { assertNoA11yViolations } from '@/test-utils/a11y';

it('toast has no violations after trigger', async () => {
  const view = render(<MyToast />);
  fireEvent.click(screen.getByRole('button'));
  await assertNoA11yViolations(view.container);
});
```

### `renderWithA11y(ui, options?)`

A thin wrapper around `@testing-library/react`'s `render`. Use it when you need the rendered view but want to defer the axe audit or skip it entirely:

```tsx
import { renderWithA11y } from '@/test-utils/a11y';

it('renders without crashing', () => {
  const view = renderWithA11y(<MyComponent />);
  expect(view.container.firstChild).toBeInTheDocument();
});
```

### Reference test file

[`src/components/__tests__/a11y.test.tsx`](src/components/__tests__/a11y.test.tsx) is the primary reference. It demonstrates:

- Using `testA11y` for static component snapshots.
- Using `assertNoA11yViolations` after user interactions (toast triggers).
- Using `renderWithA11y` for non-audit assertions alongside a11y checks.
- Testing components under multiple themes via `data-theme` toggles.
- Importing from `@/test-utils/a11y`, `@/components/*`, and `@/contexts/*`.

---

## Coverage

Run `npm test -- --coverage` to view per-file coverage. The project enforces a **95% line and branch coverage floor** on any module touched by a PR. If your changes introduce new components or utilities, add corresponding tests to maintain that threshold.

---

## Lint and build

```bash
npm run lint  # ESLint
npm run build # Next.js production build
```

Both must pass before a PR can be merged. CI runs lint, build, tests, and `npm audit` on every push and pull request to `main`.
