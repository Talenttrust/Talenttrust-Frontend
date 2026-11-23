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

The suite runs on [Vitest](https://vitest.dev/) with the jsdom environment and React Testing Library. `vitest.config.ts` is the source of truth: it maps the `@/` alias to `src/`, loads `src/test/setup.ts`, and collects every `src/**/*.test.{ts,tsx}` file.

```bash
npm test                                              # link check + full Vitest suite (what CI runs)
npx vitest run                                        # full suite, without the link check
npx vitest run src/lib/__tests__/commands.test.ts     # a single test file
npx vitest run src/lib/__tests__/commands.test.ts -t "malformed JSON"  # tests whose name matches
npx vitest                                            # watch mode, re-runs affected tests on change
```

`npm test` also runs `node scripts/check-links.mjs`, which verifies that internal links map to real App Router routes. Run it before pushing if you add or rename pages.

### Module alias `@/`

Vitest is configured with the same `@/` path alias as `tsconfig.json` (`@/*` → `./src/*`), in `vitest.config.ts`:

```ts
resolve: {
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
},
```

Import components and utilities through the alias in both source and test files:

```tsx
import { RoleChip } from '@/components/RoleChip';
import { staticCommands } from '@/lib/commands';
```

No relative-path gymnastics required.

---

## Writing tests

Place tests next to the code they cover, either in a `__tests__` directory or as a `*.test.ts(x)` file beside the module. Vitest collects `src/**/*.test.{ts,tsx}`.

| Location                              | Tests                          |
|---------------------------------------|--------------------------------|
| `src/components/**/__tests__/`        | UI component tests             |
| `src/components/**/*.test.tsx`        | Co-located UI component tests  |
| `src/lib/__tests__/`                  | Pure utility / helper tests    |
| `src/hooks/__tests__/`                | Hook tests                     |
| `src/app/**/__tests__/`               | Page-level / route tests       |
| `src/test/`                           | Shared setup, fixtures and a11y helpers |

`globals: true` is enabled, so `describe`, `it` and `expect` are available without imports, but importing them from `vitest` explicitly is also fine.

### Example: a unit test

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleChip } from '@/components/RoleChip';

describe('RoleChip', () => {
  it('labels the client role', () => {
    render(<RoleChip role="client" />);
    expect(screen.getByText('You are the client')).toBeInTheDocument();
  });
});
```

`src/test/setup.ts` registers `@testing-library/jest-dom` matchers and calls `cleanup()` after every test, so you do not need to unmount manually.

---

## Accessibility testing with vitest-axe

The project uses [vitest-axe](https://github.com/chaance/vitest-axe) to audit rendered DOM against axe-core rules. `src/test/setup.ts` extends `expect` with vitest-axe's matchers, so `toHaveNoViolations()` is available in every test:

```tsx
import { it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { RoleChip } from '@/components/RoleChip';

it('has no axe violations', async () => {
  const { container } = render(<RoleChip role="freelancer" />);
  expect(await axe(container)).toHaveNoViolations();
});
```

### Shared helper: `expectNoA11yViolations`

`src/test/a11y.ts` exports `expectNoA11yViolations(ui, options?)`, which renders the UI inside the app's providers (toasts, wallet, SWR, confirm dialog, notifications), runs axe, and throws a readable summary of any violations. It disables the `color-contrast` rule because jsdom has no layout or computed colours.

```tsx
import { expectNoA11yViolations } from '@/test/a11y';
import { RoleChip } from '@/components/RoleChip';

it('has no accessibility violations', async () => {
  await expectNoA11yViolations(<RoleChip role="client" />);
});
```

Pass `prepare` when you need to interact with the component before auditing, and `rules` to override axe rules:

```tsx
await expectNoA11yViolations(<MyDialog />, {
  prepare: () => {
    fireEvent.click(screen.getByRole('button', { name: 'Open dialog' }));
  },
});
```

### Reference test file

[`src/test/a11y.routes.test.tsx`](src/test/a11y.routes.test.tsx) is the primary reference. It demonstrates:

- Auditing whole pages and the not-found page.
- Using `prepare` to open dialogs, the command palette and the notification panel before auditing.
- Overriding axe rules per test where needed.

---

## Coverage

Coverage is **not enabled by default** and no coverage provider is installed, so `vitest run --coverage` fails until you add one. To generate a report, install the provider that matches the installed Vitest major version:

```bash
npm install --save-dev @vitest/coverage-v8@^5
npx vitest run --coverage
```

Add tests for new components, helpers and branches in the same PR that introduces them; reviewers look for untested behaviour rather than a fixed percentage.

---

## Lint and build

```bash
npm run lint  # ESLint
npm run build # Next.js production build
```

Both must pass before a PR can be merged. CI runs lint, build, tests, and `npm audit` on every push and pull request to `main`.
