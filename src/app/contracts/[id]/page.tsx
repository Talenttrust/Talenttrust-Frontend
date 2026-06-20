import { notFound } from 'next/navigation';
import ContractDetailClient from './ContractDetailClient';
import { isValidContractId } from '@/lib/validateContractId';

const ContractDetailPage = ({ params }: { params: { id: string } }) => {
  const contractId = params.id;

  if (!isValidContractId(contractId)) {
    notFound();
  }

  return <ContractDetailClient contractId={contractId} />;
};

export default ContractDetailPage;
