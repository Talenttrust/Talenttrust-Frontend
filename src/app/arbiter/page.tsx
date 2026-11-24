import type { Metadata } from 'next';
import { ArbiterConsole } from '@/components/disputes/ArbiterConsole';

export const metadata: Metadata = {
  title: 'Arbiter Console',
  description: 'Review and resolve open escrow disputes as the contract arbiter.',
};

export default function ArbiterPage() {
  return <ArbiterConsole />;
}
