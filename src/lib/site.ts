import { stellarConfig, explorerContractUrl } from './stellar/config';

export const BRAND_THEME_COLORS = {
  light: '#4f46e5',
  dark: '#818cf8',
} as const;

export const site = {
  name: 'TalentTrust',
  tagline: 'Milestone escrow for freelancers, secured on Stellar.',
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || 'https://talenttrust-backend.vercel.app').replace(/\/$/, ''),
  contractId: stellarConfig.contractId,
  network: stellarConfig.network,
  rpcUrl: stellarConfig.rpcUrl,
  github: 'https://github.com/Talenttrust',
};

export const explorerUrl = explorerContractUrl(stellarConfig.contractId);
export const apiDocsUrl = `${site.apiUrl}/docs`;
