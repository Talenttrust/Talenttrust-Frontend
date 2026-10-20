import { z } from 'zod';
import { site } from './site';
import {
  MilestoneSchema,
  DisputeSchema,
  EscrowContractSchema,
  ContractListSchema,
  ReputationSchema,
  StatsSchema,
  ChainSchema,
  ApiErrorBodySchema,
} from './schemas';

export type Milestone = z.infer<typeof MilestoneSchema>;
export type Dispute = z.infer<typeof DisputeSchema>;
export type EscrowContract = z.infer<typeof EscrowContractSchema>;
export type ContractList = z.infer<typeof ContractListSchema>;
export type Reputation = z.infer<typeof ReputationSchema>;

export type Stats = z.infer<typeof StatsSchema>;
export type Chain = z.infer<typeof ChainSchema>;

export class ApiSchemaError extends Error {
  readonly path: string;
  readonly issues: string[];

  constructor(path: string, issues: string[]) {
    super(`Invalid API response for ${path}`);
    this.name = 'ApiSchemaError';
    this.path = path;
    this.issues = issues;
  }
}

export class ApiHttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
  }
}

export class ApiNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiNetworkError';
  }
}

export interface ApiInit {
  method?: string;
  body?: unknown;
}

function condenseIssues(issues: z.ZodErrorIssue[]): string[] {
  return issues.slice(0, 3).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
}

export async function api<S extends z.ZodType<any>>(
  path: string,
  schema: S,
  init?: ApiInit,
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`${site.apiUrl}${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network request failed';
    throw new ApiNetworkError(message);
  }

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }

  if (!res.ok) {
    const errorBody = ApiErrorBodySchema.safeParse(parsed);
    const message =
      errorBody.success && errorBody.data.message
        ? errorBody.data.message
        : `Request failed (${res.status})`;
    throw new ApiHttpError(message, res.status);
  }

  if (parsed === undefined) {
    throw new ApiSchemaError(path, ['Response body was not valid JSON']);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ApiSchemaError(path, condenseIssues(result.error.issues));
  }

  return result.data as z.infer<S>;
}
