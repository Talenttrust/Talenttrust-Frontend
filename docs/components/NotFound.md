# NotFound

`NotFound` (`src/app/not-found.tsx`) is the Next.js App Router 404 fallback page rendered for unmatched routes.

## File Location

- Component: `src/app/not-found.tsx`

## Props

`NotFound` is a static server component and accepts no props.

## Rendered Structure

- Eyebrow `<p className="eyebrow">404</p>`
- Heading `<h1>Page not found</h1>`
- Message `<p className="muted">The page you are looking for does not exist or has moved.</p>`
- Recovery actions:
  - **Back home** (`<Link href="/">`)
  - **Docs** (`<Link href="/docs">`)
