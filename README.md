# TalentTrust Frontend

Next.js web app for secure freelance payments using blockchain technology. Includes a dashboard and Stellar wallet integration.

## Prerequisites

- Node.js 18+
- npm or yarn

## Setup

```bash
# Clone and enter the repo
git clone <your-repo-url>
cd talenttrust-frontend

# Install dependencies
npm install

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- Milestones page with typed delivery milestones, payout summaries, and an accessible status filter that announces result counts.

## Scripts

| Script        | Description              |
|---------------|--------------------------|
| `npm run dev` | Start dev server (3000)  |
| `npm run build` | Production build       |
| `npm start`   | Start production server  |
| `npm run lint` | Run ESLint             |
| `npm test`    | Run Jest tests           |

## Toast notifications

The app includes a global accessible toast system for transient feedback:

- `ToastProvider` is mounted in the root layout so notifications work across the app.
- Use `useToast()` in client components to trigger `showSuccess(...)` and `showError(...)`.
- Success messages announce through a polite `aria-live` region.
- Error messages announce through an assertive `aria-live` region.

Example:

```tsx
'use client';

import { useToast } from '@/components/toast/toast-provider';

export function ReleaseButton() {
  const { showSuccess, showError } = useToast();

  async function handleRelease() {
    try {
      showSuccess({ title: 'Milestone released' });
    } catch {
      showError({ title: 'Wallet not connected' });
    }
  }

  return <button onClick={handleRelease}>Release milestone</button>;
}
```

## Contributing

1. Fork the repo and create a branch from `main`.
2. Install deps, run tests and build: `npm install && npm test && npm run build`.
3. Open a pull request. CI runs lint, build, and tests on push/PR to `main`.

## CI/CD

GitHub Actions runs on push and pull requests to `main`:

- Install dependencies
- Lint (`npm run lint`)
- Build (`npm run build`)
- Tests (`npm test`)
- Dependency audit (`npm audit --audit-level=high --production`)

Ensure these pass locally before pushing.

### Security audits

The pipeline runs `npm audit --audit-level=high --production` after tests. Any **high** or **critical** advisory blocks the merge.

**Triage a finding**

1. Run `npm audit` locally to read the advisory details and affected package.
2. Check whether a patched version exists: `npm audit fix` (add `--force` only if you accept semver-major bumps and have reviewed the changelog).
3. If no fix is available and the advisory is a false positive or cannot be exploited in this context, document the reason and add the advisory ID to a `.nsprc` / `audit-resolve.json` file (npm ≥ 10: `npm audit --ignore <id>`).

**Waiving an advisory in CI**

Add the `--ignore <advisory-id>` flag to the audit step in `.github/workflows/ci.yml` and leave a comment explaining the waiver, the expected fix date, and a link to the advisory. Example:

```yaml
# Advisory 1234567 – lodash prototype pollution, not reachable in production
# Revisit when lodash@5 is released (tracked in #123).
run: npm audit --audit-level=high --production --ignore 1234567
```

## License

MIT
