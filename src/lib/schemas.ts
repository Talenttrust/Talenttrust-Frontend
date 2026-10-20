import { z } from 'zod';

export const MilestoneSchema = z.object({
  index: z.number(),
  title: z.string(),
  amount: z.number(),
  released: z.boolean(),
}).passthrough();

export const DisputeSchema = z.object({
  reason: z.string(),
  raisedBy: z.string(),
  resolved: z.boolean(),
}).passthrough();

export const EscrowContractStatusSchema = z.enum([
  'Created',
  'Funded',
  'Completed',
  'Disputed',
  'Resolved',
  'Cancelled',
]);

export const EscrowContractSchema = z.object({
  id: z.number(),
  title: z.string(),
  client: z.string(),
  freelancer: z.string(),
  token: z.string(),
  milestones: z.array(MilestoneSchema),
  totalAmount: z.number(),
  fundedAmount: z.number(),
  releasedAmount: z.number(),
  status: EscrowContractStatusSchema,
  reputationIssued: z.boolean(),
  dispute: DisputeSchema.optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export const ContractListSchema = z.object({
  data: z.array(EscrowContractSchema),
}).passthrough();

export const ReputationSchema = z.object({
  address: z.string(),
  completedContracts: z.number(),
  totalRating: z.number(),
  averageRating: z.number(),
}).passthrough();

export const StatsSchema = z.object({
  totalContracts: z.number(),
  totalVolume: z.number(),
  activeContracts: z.number(),
  completedContracts: z.number(),
}).passthrough();

export const ChainSchema = z.object({
  network: z.string(),
  contractId: z.string(),
  latestLedger: z.number(),
}).passthrough();

export const ApiErrorBodySchema = z.object({
  message: z.string(),
}).passthrough();
