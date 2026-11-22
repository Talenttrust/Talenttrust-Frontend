import type { Metadata } from 'next';
import { site } from '@/lib/site';

const title = `${site.name} | Milestone escrow on Stellar`;
const description =
  'TalentTrust lets clients and freelancers lock payments in a Soroban smart contract, release funds milestone by milestone, resolve disputes and build on-chain reputation.';

export const rootMetadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://talenttrust-frontend.vercel.app'),
  title: { default: title, template: `%s | ${site.name}` },
  description,
  icons: { icon: '/icon.svg' },
  openGraph: {
    title,
    description,
    url: '/',
    siteName: site.name,
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
    title,
    description,
  },
};
