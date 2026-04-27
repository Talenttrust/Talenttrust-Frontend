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

Ensure these pass locally before pushing.

## License

MIT
