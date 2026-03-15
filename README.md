# TalentTrust Frontend

Next.js web app for the TalentTrust decentralized freelancer escrow protocol. Dashboard and Stellar wallet integration.

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
