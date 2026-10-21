import { Asset, Networks } from '@stellar/stellar-sdk';

export const site = {
  name: 'TalentTrust',
  tagline: 'Milestone escrow for freelancers, secured on Stellar.',
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || 'https://talenttrust-backend.vercel.app').replace(/\/$/, ''),
  contractId: process.env.NEXT_PUBLIC_CONTRACT_ID || 'CCZMIVUBMG5SBC47SDTC32RWLBJ2HW2DCFVWJEOKCH2IFJBZGBKTXK5W',
  network: process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet',
  github: 'https://github.com/Talenttrust',
};

export const explorerUrl = `https://stellar.expert/explorer/${site.network}/contract/${site.contractId}`;
export const apiDocsUrl = `${site.apiUrl}/docs`;

/**
 * The Stellar Asset Contract id for native XLM on testnet.
 * Computed deterministically from the network passphrase — never hard-coded.
 * This is the only place in the codebase where this value is derived.
 */
export const XLM_SAC_ID: string = Asset.native().contractId(Networks.TESTNET);
