import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container" style={{ padding: '96px 20px', textAlign: 'center' }}>
      <p className="eyebrow">404</p>
      <h1 style={{ fontSize: '2.4rem', margin: '16px 0 8px' }}>Page not found</h1>
      <p className="muted" style={{ marginBottom: 28 }}>
        The page you are looking for does not exist or has moved.
      </p>
      <div className="actions" style={{ justifyContent: 'center' }}>
        <Link href="/" className="btn btn-primary">
          Back home
        </Link>
        <Link href="/docs" className="btn btn-secondary">
          Docs
        </Link>
      </div>
    </div>
  );
}
