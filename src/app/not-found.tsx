import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-[var(--background)]">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl font-bold text-gray-200">404</div>
        <h1 className="text-2xl font-bold text-gray-900">Page Not Found</h1>
        <p className="text-gray-600">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-5 py-2 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-700 transition-colors"
          >
            Go Home
          </Link>
          <a
            href="mailto:support@talenttrust.io"
            className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-100 transition-colors"
          >
            Contact Support
          </a>
        </div>
      </div>
    </main>
  );
}
