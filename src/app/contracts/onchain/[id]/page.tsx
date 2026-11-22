import { notFound } from 'next/navigation';
import OnChainEscrowActions from '@/components/onchain/OnChainEscrowActions';

type Props = { params: Promise<{ id: string }> };

export default async function OnChainContractPage({ params }: Props) {
  const { id } = await params;
  const parsed = parseInt(id, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || String(parsed) !== id) {
    notFound();
  }
  return (
    <div className="container" style={{ maxWidth: 720 }}>
      <OnChainEscrowActions id={parsed} />
    </div>
  );
}
