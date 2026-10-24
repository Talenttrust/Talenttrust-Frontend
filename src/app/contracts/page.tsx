import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EscrowDashboard } from '@/components/EscrowDashboard';
import { site } from '@/lib/site';

export const metadata: Metadata = { title: 'Escrows' };

export default function ContractsPage() {
  return (
    <div className="container">
      <div className="page-head">
        <h1>Escrow dashboard</h1>
        <p>
          Create, fund and settle milestone escrows against the live TalentTrust API at{' '}
          <a href={site.apiUrl} target="_blank" rel="noreferrer">
            {site.apiUrl.replace('https://', '')}
          </a>
          .
        </p>
      </div>
      {/*
        EscrowDashboard calls useSearchParams() which requires a Suspense boundary
        at the nearest Server Component boundary (Next.js App Router requirement).
      */}
      <Suspense fallback={<div className="card muted">Loading escrows…</div>}>
        <EscrowDashboard />
      </Suspense>
    </div>
  );
}
