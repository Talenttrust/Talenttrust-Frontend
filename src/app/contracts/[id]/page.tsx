import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EscrowOverview } from '@/components/escrow/EscrowOverview';

export const metadata: Metadata = { title: 'Escrow overview' };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId <= 0 || String(numericId) !== id) notFound();

  return <EscrowOverview id={numericId} />;
}
