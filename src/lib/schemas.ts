import { z } from "zod";

/**
 * Runtime schemas for the TalentTrust API responses.
 *
 * These are the single source of truth for the API response types: the exported
 * TypeScript types in `src/lib/api.ts` are inferred from these schemas.
 *
 * Schemas are permissive about extra fields (zod strips them by default) but
 * strict about required ones, so backend additions do not break the client
 * while renames/removals are surfaced as `ApiSchemaError`.
 */

export const MilestoneStatusSchema = z.enum([
  "pending",
  "approved",
  "released",
  "rejected",
]);

export const MilestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  amount: z.number(),
  status: MilestoneStatusSchema,
});

export const DisputeSchema = z.object({
  id: z.string(),
  reason: z.string(),
  status: z.enum(["open", "resolved"]),
  raisedBy: z.string(),
  createdAt: z.string(),
});

export const EscrowContractSchema = z.object({
  id: z.string(),
  title: z.string(),
  client: z.string(),
  freelancer: z.string(),
  totalAmount: z.number(),
  fundedAmount: z.number(),
  releasedAmount: z.number(),
  status: z.enum([
    "draft",
    "funded",
    "in_progress",
    "completed",
    "disputed",
    "cancelled",
  ]),
  milestones: z.array(MilestoneSchema),
  dispute: DisputeSchema.nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const ContractListSchema = z.object({
  data: z.array(EscrowContractSchema),
});

export const ReputationSchema = z.object({
  address: z.string(),
  score: z.number(),
  completedContracts: z.number(),
  disputes: z.number(),
});

export const StatsSchema = z.object({
  totalContracts: z.number(),
  totalVolume: z.number(),
  activeContracts: z.number(),
  completedContracts: z.number(),
});

export const ChainSchema = z.object({
  network: z.string(),
  chainId: z.number(),
  latestLedger: z.number(),
});

export const ApiErrorBodySchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;
