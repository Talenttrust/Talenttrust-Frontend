import { Milestone } from '@/components/MilestonesList';

export interface ContractData {
  id: string;
  name: string;
  status: 'Active' | 'Completed' | 'Disputed' | 'Pending';
  parties: Array<{ label: string; address: string }>;
  totalValue: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  milestones: Milestone[];
}

interface ResolverOptions {
  simulateError?: boolean;
  simulateDelay?: number;
}

/**
 * The contract ids the demo backend knows about.
 *
 * Existence is a real answer now, not an invention: an id outside this set
 * does not exist, and the route can say so. Ids in this set resolve.
 */
const KNOWN_CONTRACT_IDS: ReadonlySet<string> = new Set(['123']);

/**
 * Contracts restricted to named wallets.
 *
 * A contract whose id appears here may only be read by a wallet on its
 * permitted list. Everything known-but-unlisted is public, which keeps every
 * contract that predates the permission model readable — including the demo
 * id the whole existing suite renders with (`123`).
 */
const RESTRICTED_CONTRACTS: Readonly<Record<string, readonly string[]>> = {
  'restricted-demo': ['GADEMOCLIENT0000000000000000000000000000000001'],
};

/** Whether the demo backend holds a contract with this id. */
export function contractExists(id: string): boolean {
  return KNOWN_CONTRACT_IDS.has(id) || Object.hasOwn(RESTRICTED_CONTRACTS, id);
}

/** The permitted wallets for a contract, or null when it is public. */
export function permittedAddressesFor(id: string): readonly string[] | null {
  return Object.hasOwn(RESTRICTED_CONTRACTS, id) ? RESTRICTED_CONTRACTS[id] : null;
}

/**
 * Simulates async contract data resolution.
 * Deterministic for testing; in production, replace with real API call.
 *
 * Unknown ids throw — the route renders that as "not found". Inventing data
 * for any id (the old behaviour) made every link "work" and is what turned
 * existence into a question the route could not answer.
 */
export async function resolveContractData(
  id: string,
  options: ResolverOptions = {}
): Promise<ContractData> {
  const { simulateError = false, simulateDelay = 0 } = options;

  if (simulateDelay > 0) {
    await new Promise((resolve) => setTimeout(resolve, simulateDelay));
  }

  if (simulateError) {
    throw new Error(`Failed to load contract #${id}. Please try again.`);
  }

  if (!contractExists(id)) {
    throw new Error(`Contract #${id} was not found.`);
  }

  // Mock data for the given contract ID
  return {
    id,
    name: 'Stellar Escrow Implementation',
    status: 'Active',
    parties: [
      { label: 'Client', address: 'GABC1234DEF5678HIJK9012LMNO3456PQRS7890' },
      { label: 'Freelancer', address: 'GXYZ9876STU5432VWXQ1098ABCD7654EFGH3210' },
    ],
    totalValue: 7000,
    currency: 'USD',
    createdAt: 'Apr 20, 2026',
    updatedAt: '2026-04-20T12:00:00.000Z',
    milestones: [
      {
        id: 'ms-1',
        title: 'Kickoff and scope approval',
        status: 'Completed',
        payout: 1500,
        currency: 'USD',
        dueDate: '2026-05-04',
      },
      {
        id: 'ms-2',
        title: 'Design and review',
        status: 'Pending',
        payout: 2500,
        currency: 'USD',
        dueDate: '2026-06-01',
      },
      {
        id: 'ms-3',
        title: 'Final delivery',
        status: 'Pending',
        payout: 3000,
        currency: 'USD',
        dueDate: '2026-07-12',
      },
    ],
  };
}
