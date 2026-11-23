import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EscrowActivity } from '@/components/escrow/EscrowActivity';

export const metadata: Metadata = { title: 'Escrow activity' };

export default async function EscrowActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId <= 0 || String(numericId) !== id) notFound();

  return (
    <div className="container">
      <div className="page-head">
        <h1>Escrow #{numericId} activity</h1>
        <p>On-chain events emitted by the escrow contract for this escrow, oldest first.</p>
      </div>

      <div className="row" style={{ marginBottom: 16, gap: 8 }}>
        <Link href={`/contracts/${numericId}`} className="btn btn-secondary btn-sm">
          Back to escrow
        </Link>
        <Link href="/contracts" className="btn btn-secondary btn-sm">
          All escrows
        </Link>
      </div>

      <EscrowActivity escrowId={numericId} />
    </div>
  );
}
